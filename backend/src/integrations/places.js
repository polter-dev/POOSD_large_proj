// OpenStreetMap Overpass: free, no key, no card (decision on #27).
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
  for (const url of [...new Set([process.env.OVERPASS_URL, ...MIRRORS].filter(Boolean))].slice(0, 3)) {
    try {
      const res = await fetch(url, {
        method: "POST",
        // overpass-api.de answers 406 to Node's default "node" User-Agent.
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MenuMacroFitter/1.0 (POOSD student project)" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data?.elements)) continue;
      // Overpass reports a timeout as 200 with a remark and partial results.
      if (data.remark && /error/i.test(data.remark)) continue;
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

// Places within radiusMiles whose name contains one of chainNames, nearest first.
async function findNearbyChainLocations({ lat, lng, radiusMiles, chainNames }) {
  // These are interpolated into the Overpass query, so anything non-numeric could inject QL.
  if (![lat, lng, radiusMiles].every(Number.isFinite)) {
    throw Object.assign(new Error("lat, lng and radiusMiles must be numbers"), { status: 400 });
  }
  // An empty pattern would match every restaurant in the radius.
  if (!chainNames.length) return [];
  const pattern = chainNames
    // Escape regex metacharacters; let an apostrophe also match ’ or nothing (McDonalds).
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]?"))
    .join("|");
  const radiusM = Math.round(radiusMiles * METERS_PER_MILE);
  // 3 decimals is about 110 m, so a user standing still builds the same query and hits the cache.
  const [qLat, qLng] = [+lat.toFixed(3), +lng.toFixed(3)];
  // [timeout:12] sits under the 15 s abort so Overpass can answer with its own timeout remark first.
  // JSON.stringify quotes the regex as a valid Overpass QL string literal.
  const query = `[out:json][timeout:12];
nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"~${JSON.stringify(pattern)},i](around:${radiusM},${qLat},${qLng});
out center;`;

  const data = await queryOverpass(query);

  return data.elements
    // Nodes carry lat/lon; ways and relations only have a center with "out center". Drop any with neither.
    .filter((el) => el.lat != null || el.center)
    .map((el) => {
      const t = el.tags || {};
      const pLat = el.lat ?? el.center.lat;
      const pLng = el.lon ?? el.center.lon;
      const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      return {
        // "osm-node-123": fits favorites.placeId in db/schema.js (no "/"), so a result can be saved as a favorite.
        placeId: `osm-${el.type}-${el.id}`,
        name: t.name,
        address: [street, t["addr:city"]].filter(Boolean).join(", ") || null,
        lat: pLat,
        lng: pLng,
        distanceMiles: distanceMiles(lat, lng, pLat, pLng),
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

// Test-only: reset the cache and in-flight requests between tests.
function _clearCache() {
  cache.clear();
  inflight.clear();
}

module.exports = { findNearbyChainLocations, _clearCache };
