// OpenStreetMap Overpass: free, no key, no card (decision on #27).
// When every server fails, Nearby answers from an expired cache entry, then from db/places-snapshot.json (#128).
const path = require("path");

// Loaded on first use (require caches it), so scripts/capture-places-snapshot.js runs even when the file is missing.
const SNAPSHOT_FILE = path.join(__dirname, "..", "..", "db", "places-snapshot.json");
const METERS_PER_MILE = 1609.344;
// Tried in order after OVERPASS_URL; the public servers are often overloaded, so one failing is routine.
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// 3 attempts x 15 s keeps the worst case near 45 s, under the mobile client's 60 s limit.
const ATTEMPT_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 300;
// shortcut: per-process memory, lost on restart and not shared between instances; move to Redis or a Mongo TTL collection if we run more than one.
// Expired entries stay until a fresh answer or the size cap replaces them: they're the stale answer when every server fails.
const cache = new Map(); // query string -> { at, data }
// Identical lookups already running share one upstream request; overpass-api.de allows only a few concurrent slots per IP.
const inflight = new Map(); // query string -> Promise<data>

function placesError() {
  return Object.assign(new Error("Places lookup failed"), { status: 502 });
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

// OVERPASS_URL first, then the mirrors, without repeats.
function overpassServers() {
  return [...new Set([process.env.OVERPASS_URL, ...MIRRORS].filter(Boolean))];
}

// The chain-name regex. Overpass matches it against place names case-insensitively, and the snapshot fallback runs
// the same regex in JS, so both find the same places.
function namePattern(chainNames) {
  return chainNames
    // Escape regex metacharacters; let an apostrophe also match ’ or nothing (McDonalds).
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]?"))
    .join("|");
}

// Restaurants, fast food and cafes within radiusMiles whose name contains a chain name. timeoutSec is Overpass's own
// limit; scripts/capture-places-snapshot.js passes a longer one.
function buildQuery({ lat, lng, radiusMiles, chainNames }, timeoutSec = 12) {
  const radiusM = Math.round(radiusMiles * METERS_PER_MILE);
  // 3 decimals is about 110 m, so a user standing still builds the same query and hits the cache.
  const [qLat, qLng] = [+lat.toFixed(3), +lng.toFixed(3)];
  // The default 12 s sits under the 15 s abort so Overpass can answer with its own timeout remark first.
  // JSON.stringify quotes the regex as a valid Overpass QL string literal.
  return `[out:json][timeout:${timeoutSec}];
nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"~${JSON.stringify(namePattern(chainNames))},i](around:${radiusM},${qLat},${qLng});
out center;`;
}

// One POST to one server: the Overpass body, or null when the answer can't be used. Network errors, timeouts and
// bad JSON throw.
async function postQuery(url, query, timeoutMs) {
  const res = await fetch(url, {
    method: "POST",
    // overpass-api.de answers 406 to Node's default "node" User-Agent.
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MenuMacroFitter/1.0 (POOSD student project)" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data?.elements)) return null;
  // Overpass reports a timeout as 200 with a remark and partial results.
  if (data.remark && /error/i.test(data.remark)) return null;
  return data;
}

// POST the query to each server in turn; first good body wins and is cached.
async function queryOverpass(query) {
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  if (inflight.has(query)) return inflight.get(query);
  // Removed when settled, so a failure is not reused and the next caller retries.
  const p = fetchOverpass(query).finally(() => inflight.delete(query));
  inflight.set(query, p);
  return p;
}

async function fetchOverpass(query) {
  // At most 3 attempts even when OVERPASS_URL is a fourth server, to keep the 45 s cap.
  for (const url of overpassServers().slice(0, 3)) {
    try {
      const data = await postQuery(url, query, ATTEMPT_TIMEOUT_MS);
      if (!data) continue;
      cache.delete(query); // re-insert at the end so the oldest entry is first
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(query, { at: Date.now(), data });
      return data;
    } catch {
      // network error, timeout or bad JSON: try the next server
    }
  }
  throw placesError();
}

// An Overpass element as { placeId, name, address, lat, lng }, or null when it has no coordinates.
function toPlace(el) {
  // Nodes carry lat/lon; ways and relations only have a center with "out center".
  if (el.lat == null && !el.center) return null;
  const t = el.tags || {};
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  return {
    // "osm-node-123": fits favorites.placeId in db/schema.js (no "/"), so a result can be saved as a favorite.
    placeId: `osm-${el.type}-${el.id}`,
    name: t.name,
    address: [street, t["addr:city"]].filter(Boolean).join(", ") || null,
    lat: el.lat ?? el.center.lat,
    lng: el.lon ?? el.center.lon,
  };
}

function toPlaces(elements) {
  return elements.map(toPlace).filter(Boolean);
}

// Adds distanceMiles from the user's exact position, nearest first.
function nearestFirst(places, lat, lng) {
  return places
    .map((p) => ({ ...p, distanceMiles: distanceMiles(lat, lng, p.lat, p.lng) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

// Every server failed. Answers are never cached from here, so the next request tries Overpass again.
function fallback(query, { lat, lng, radiusMiles, chainNames }) {
  const stale = cache.get(query);
  if (stale) {
    const minutes = Math.round((Date.now() - stale.at) / 60000);
    console.error(`[places] every Overpass server failed; answered from a cached result ${minutes} min old`);
    return nearestFirst(toPlaces(stale.data.elements), lat, lng);
  }
  const snapshot = require(SNAPSHOT_FILE);
  const name = new RegExp(namePattern(chainNames), "i");
  const places = nearestFirst(snapshot.places.filter((p) => name.test(p.name)), lat, lng)
    .filter((p) => p.distanceMiles <= radiusMiles);
  // Outside the snapshot's circle an empty list would wrongly say "nothing near you", so that stays a 502.
  const { center } = snapshot;
  if (!places.length && distanceMiles(lat, lng, center.lat, center.lng) > snapshot.radiusMiles) throw placesError();
  console.error(`[places] every Overpass server failed; answered from the snapshot captured ${snapshot.capturedAt} (${places.length} places)`);
  return places;
}

// Places within radiusMiles whose name contains one of chainNames, nearest first.
async function findNearbyChainLocations({ lat, lng, radiusMiles, chainNames }) {
  // These are interpolated into the Overpass query, so anything non-numeric could inject QL.
  if (![lat, lng, radiusMiles].every(Number.isFinite)) {
    throw Object.assign(new Error("lat, lng and radiusMiles must be numbers"), { status: 400 });
  }
  // An empty pattern would match every restaurant in the radius.
  if (!chainNames.length) return [];
  const query = buildQuery({ lat, lng, radiusMiles, chainNames });
  let data;
  try {
    data = await queryOverpass(query);
  } catch {
    return fallback(query, { lat, lng, radiusMiles, chainNames }); // queryOverpass only throws the 502
  }
  return nearestFirst(toPlaces(data.elements), lat, lng);
}

// Test-only: reset the cache and in-flight requests between tests.
function _clearCache() {
  cache.clear();
  inflight.clear();
}

module.exports = { findNearbyChainLocations, _clearCache, buildQuery, overpassServers, postQuery, toPlaces };
