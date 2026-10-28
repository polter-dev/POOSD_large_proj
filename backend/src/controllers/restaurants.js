const Chain = require("../models/Chain");
const User = require("../models/User");
const places = require("../integrations/places");
const { matchChain } = require("../services/chainMatch");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");

const RADII = [5, 10, 15, 20];

// The body is JSON, so lat/lng/radiusMiles must already be numbers (see #30). Strings are
// rejected rather than coerced: these values end up in the Overpass query.
// radiusMiles is undefined when omitted; the caller fills in the user's saved searchRadius.
function parseNearbyBody(body) {
  const { lat, lng, radiusMiles } = readBody(body, ["lat", "lng", "radiusMiles"]);
  // Number.isFinite is false for strings, so "28.6" is rejected here too.
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw httpError(400, "lat must be a number from -90 to 90");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw httpError(400, "lng must be a number from -180 to 180");
  }
  if (radiusMiles !== undefined && !RADII.includes(radiusMiles)) {
    throw httpError(400, "radiusMiles must be 5, 10, 15 or 20");
  }
  return { lat, lng, radiusMiles };
}

async function savedRadius(userId) {
  const user = await User.findById(userId, { preferences: 1 }).lean();
  if (!user) throw httpError(404, "User not found"); // token outlived a deleted account
  return user.preferences.searchRadius;
}

// Nothing about the location is stored (spec N4).
async function nearby(req, res, next) {
  try {
    const { lat, lng, radiusMiles: asked } = parseNearbyBody(req.body);
    const radiusMiles = asked ?? (await savedRadius(req.userId));
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
