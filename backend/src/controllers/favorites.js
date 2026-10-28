const Favorite = require("../models/Favorite");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");

// Same rule as favorites.placeId in db/schema.js; nearby's placeIds (osm-node-123...) fit it.
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const OBJECT_ID = /^[0-9a-f]{24}$/;

// The contract's Favorite: userId is never returned.
function toFavoriteJSON(f) {
  return { id: String(f._id), placeId: f.placeId, label: f.label, createdAt: f.createdAt.toISOString() };
}

// Omitted, null or blank all mean "no label".
function checkLabel(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw httpError(400, "Label must be text");
  if (v.trim().length > 50) throw httpError(400, "Label: 50 characters max");
  return v.trim() || null;
}

async function list(req, res, next) {
  try {
    const favorites = await Favorite.find({ userId: req.userId }).sort({ createdAt: -1, _id: -1 }).lean();
    res.json({ favorites: favorites.map(toFavoriteJSON) });
  } catch (err) {
    next(err);
  }
}

// Spec N4: only the user, the place ID and the label are stored (no name, address or location).
async function add(req, res, next) {
  try {
    const b = readBody(req.body, ["placeId", "label"]);
    if (typeof b.placeId !== "string" || !PLACE_ID.test(b.placeId)) throw httpError(400, "placeId is invalid");
    const label = checkLabel(b.label);
    let favorite;
    try {
      favorite = await Favorite.create({ userId: req.userId, placeId: b.placeId, label });
    } catch (err) {
      // The unique userId+placeId index is the duplicate check.
      if (err.code === 11000) throw httpError(409, "Already in your favorites");
      throw err;
    }
    res.status(201).json(toFavoriteJSON(favorite));
  } catch (err) {
    next(err);
  }
}

// Someone else's favorite answers 404 like a missing one, so ids can't be probed.
async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const result = OBJECT_ID.test(id) ? await Favorite.deleteOne({ _id: id, userId: req.userId }) : null;
    if (!result?.deletedCount) throw httpError(404, "Favorite not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, add, remove };
