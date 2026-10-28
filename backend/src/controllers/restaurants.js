const Chain = require("../models/Chain");
const places = require("../integrations/places");
const { matchChain } = require("../services/chainMatch");

const RADII = [5, 10, 15, 20];
// TODO(#13): default to the caller's preferences.searchRadius once auth middleware sets req.userId.
const DEFAULT_RADIUS = 5;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// The body is JSON, so lat/lng/radiusMiles must already be numbers (see #30). Strings are
// rejected rather than coerced: these values end up in the Overpass query.
function parseNearbyBody(body) {
  const { lat, lng, radiusMiles = DEFAULT_RADIUS } = body || {};
  // Number.isFinite is false for strings, so "28.6" is rejected here too.
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw badRequest("lat must be a number from -90 to 90");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw badRequest("lng must be a number from -180 to 180");
  }
  if (!RADII.includes(radiusMiles)) {
    throw badRequest("radiusMiles must be 5, 10, 15 or 20");
  }
  return { lat, lng, radiusMiles };
}

// Nothing about the location is stored (spec N4).
async function nearby(req, res, next) {
  try {
    const { lat, lng, radiusMiles } = parseNearbyBody(req.body);
    const chains = await Chain.find({}, { name: 1, nameKey: 1, alternateNames: 1 }).lean();
    const chainNames = chains.flatMap((c) => [c.name, ...(c.alternateNames || [])]);
    const found = await places.findNearbyChainLocations({ lat, lng, radiusMiles, chainNames });
    // A place that contains a chain name but matches no chain (e.g. "Not Subway Cafe") stays in
    // the list with chainId null, so the client can show it without nutrition data.
    const restaurants = found.map((p) => {
      const chain = matchChain(p.name, chains);
      return {
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        distanceMiles: p.distanceMiles,
        chainId: chain ? String(chain._id) : null,
      };
    });
    res.json({ restaurants });
  } catch (err) {
    next(err);
  }
}

module.exports = { nearby };
