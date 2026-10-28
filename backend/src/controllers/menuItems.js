const MenuItem = require("../models/MenuItem");
const httpError = require("../utils/httpError");
const normalize = require("../utils/normalize");
const toMenuItemJSON = require("../utils/toMenuItemJSON");

// A query value as a whole number from min to max, or def when it's absent.
// Query values are strings (an array when repeated), so "abc", "1.5" and ["1", "2"] are all 400.
function intParam(v, def, min, max, message) {
  if (v === undefined) return def;
  if (typeof v !== "string" || !/^\d+$/.test(v) || !Number.isSafeInteger(+v) || +v < min || +v > max) {
    throw httpError(400, message);
  }
  return +v;
}

// GET /menu-items/search?q=&limit=&skip= (#31). Partial match on the normalized item name, so
// "CHICK-FIL-A Nuggets" and "chick fil a nuggets" find the same items.
async function search(req, res, next) {
  try {
    const { q } = req.query;
    if (typeof q !== "string" || !q.trim()) throw httpError(400, "q is required");
    if (q.length > 100) throw httpError(400, "q: 100 characters max");
    const limit = intParam(req.query.limit, 20, 1, 100, "limit must be a whole number from 1 to 100");
    const skip = intParam(req.query.skip, 0, 0, Number.MAX_SAFE_INTEGER, "skip must be a whole number, 0 or more");

    const text = normalize(q);
    if (!text) throw httpError(400, "q must contain a letter or number");
    // searchName is stored normalized (lowercase) and text is normalized the same way, so the match is
    // case-insensitive without the "i" flag, which would stop the regex using the search_name index.
    // normalize() leaves only [a-z0-9 ], but escape anyway: user text must never be read as a regex.
    const filter = { searchName: { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } };
    const [items, total] = await Promise.all([
      MenuItem.find(filter, toMenuItemJSON.fields).sort({ chainName: 1, name: 1 }).skip(skip).limit(limit).lean(),
      MenuItem.countDocuments(filter),
    ]);
    res.json({ items: items.map(toMenuItemJSON), total, limit, skip });
  } catch (err) {
    next(err);
  }
}

module.exports = { search };
