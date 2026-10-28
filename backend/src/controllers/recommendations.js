const MenuItem = require("../models/MenuItem");
const User = require("../models/User");
const { calories } = require("../services/calories");
const { rankItems, MACROS, MIN_CALORIES } = require("../services/recommendations");
const { found, MODES } = require("./users");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");
const toMenuItemJSON = require("../utils/toMenuItemJSON");

const OBJECT_ID = /^[0-9a-f]{24}$/;

// Every field is optional; undefined means "use the default" (docs/api-contract.md "Recommendations").
function parseBody(body) {
  const b = readBody(body, ["chainIds", "mode", "mealCalorieLimit", "limit", "includeEstimates"]);
  if (b.chainIds !== undefined && !(Array.isArray(b.chainIds) && b.chainIds.every((id) => OBJECT_ID.test(id)))) {
    throw httpError(400, "chainIds must be a list of chain ids");
  }
  if (b.mode !== undefined && !MODES.includes(b.mode)) throw httpError(400, "mode must be protein or carb");
  const m = b.mealCalorieLimit;
  if (m !== undefined && (!Number.isFinite(m) || m < 100 || m > 3000)) {
    throw httpError(400, "mealCalorieLimit must be a number from 100 to 3000");
  }
  if (b.limit !== undefined && !(Number.isInteger(b.limit) && b.limit >= 1 && b.limit <= 50)) {
    throw httpError(400, "limit must be a whole number from 1 to 50");
  }
  if (b.includeEstimates !== undefined && typeof b.includeEstimates !== "boolean") {
    throw httpError(400, "includeEstimates must be true or false");
  }
  return b;
}

// The user's saved mode and per-meal limit (Calories.perMeal; null when there's neither a saved
// limit nor a profile to compute one from).
async function savedDefaults(userId) {
  const { preferences, profile } = found(await User.findById(userId, { profile: 1, preferences: 1 }).lean());
  let perMeal = preferences.mealCalorieLimit;
  if (perMeal == null && profile) perMeal = calories(profile, preferences).perMeal;
  return { mode: preferences.recommendationMode, perMeal };
}

// POST /recommendations (#32): items that fit one meal, ranked by protein or carbs per 100 kcal.
async function recommend(req, res, next) {
  try {
    const b = parseBody(req.body);
    let mode = b.mode;
    let mealCalorieLimit = b.mealCalorieLimit;
    if (mode === undefined || mealCalorieLimit === undefined) {
      const saved = await savedDefaults(req.userId);
      mode ??= saved.mode;
      mealCalorieLimit ??= saved.perMeal;
      if (mealCalorieLimit == null) throw httpError(400, "Set your profile first");
    }

    // The same rules rankItems applies, so the database only sends back candidates.
    const filter = { calories: { $gte: MIN_CALORIES, $lte: mealCalorieLimit }, [MACROS[mode]]: { $ne: null } };
    if (b.chainIds?.length) filter.chainId = { $in: b.chainIds };
    if (!b.includeEstimates) filter.isEstimate = false;
    const candidates = await MenuItem.find(filter, toMenuItemJSON.fields).lean();

    const ranked = rankItems(candidates, { mode, mealCalorieLimit, limit: b.limit ?? 10 });
    res.json({ mode, mealCalorieLimit, items: ranked.map((i) => ({ ...toMenuItemJSON(i), score: i.score })) });
  } catch (err) {
    next(err);
  }
}

module.exports = { recommend };
