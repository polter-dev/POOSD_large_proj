// OpenStreetMap Overpass: free, no key, no card (decision on #27).
const METERS_PER_MILE = 1609.344;

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
  // JSON.stringify quotes the regex as a valid Overpass QL string literal.
  const query = `[out:json][timeout:25];
nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"~${JSON.stringify(pattern)},i](around:${radiusM},${lat},${lng});
out center;`;

  let data;
  try {
    const res = await fetch(process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter", {
      method: "POST",
      // overpass-api.de answers 406 to Node's default "node" User-Agent.
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "MenuMacroFitter/1.0 (POOSD student project)" },
      body: new URLSearchParams({ data: query }),
    });
    if (!res.ok) throw placesError();
    data = await res.json();
  } catch {
    throw placesError();
  }
  // Overpass reports a timeout as 200 with a remark and partial results.
  if (!Array.isArray(data?.elements)) throw placesError();
  if (data.remark && /error/i.test(data.remark)) throw placesError();

  return data.elements
    // Nodes carry lat/lon; ways and relations only have a center with "out center". Drop any with neither.
    .filter((el) => el.lat != null || el.center)
    .map((el) => {
      const t = el.tags || {};
      const pLat = el.lat ?? el.center.lat;
      const pLng = el.lon ?? el.center.lon;
      const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
      return {
        placeId: `${el.type}/${el.id}`,
        name: t.name,
        address: [street, t["addr:city"]].filter(Boolean).join(", ") || null,
        lat: pLat,
        lng: pLng,
        distanceMiles: distanceMiles(lat, lng, pLat, pLng),
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

module.exports = { findNearbyChainLocations };
