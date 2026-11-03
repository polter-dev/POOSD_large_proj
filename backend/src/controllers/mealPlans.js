const MealLog = require("../models/MealLog");
const MenuItem = require("../models/MenuItem");
const User = require("../models/User");
const { calories } = require("../services/calories");
const { mealPlan } = require("../services/mealPlan");
const { MACROS, MIN_CALORIES } = require("../services/recommendations");
const { found, parseDate, MODES } = require("./users");
const httpError = require("../utils/httpError");
const toMenuItemJSON = require("../utils/toMenuItemJSON");

const OBJECT_ID = /^[0-9a-f]{24}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Query values are strings (an array when repeated, which every check here rejects).
function parseQuery(q) {
  const start = parseDate(q.start);
  if (!start) throw httpError(400, "start must be a date (YYYY-MM-DD)");
  if (q.days !== undefined && q.days !== "1" && q.days !== "7") throw httpError(400, "days must be 1 or 7");
  const ids = q.chainIds ?? ""; // missing or empty = every chain
  if (typeof ids !== "string" || (ids && !ids.split(",").every((id) => OBJECT_ID.test(id)))) {
    throw httpError(400, "chainIds must be comma-separated chain ids");
  }
  if (q.mode !== undefined && !MODES.includes(q.mode)) throw httpError(400, "mode must be protein or carb");
  // start is UTC midnight, so adding whole days never crosses a time-zone change.
  const dates = Array.from({ length: Number(q.days ?? 1) }, (_, i) =>
    new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10)
  );
  return { dates, chainIds: ids ? ids.split(",") : [], mode: q.mode };
}

// GET /meal-plans?start=&days=&chainIds=&mode= (#111): suggested eats that fit what's left of each day's
// target. Nothing is stored; the client opts in with POST /meal-logs.
async function getMealPlan(req, res, next) {
  try {
    const { dates, chainIds, mode: queryMode } = parseQuery(req.query);
    const { profile, preferences } = found(await User.findById(req.userId, { profile: 1, preferences: 1 }).lean());
    if (!profile) throw httpError(400, "Set your profile first");
    const mode = queryMode ?? preferences.recommendationMode;
    const cal = calories(profile, preferences);

    // No day's limit is over perMeal, so the database only sends back candidates (verified items only).
    const filter = { calories: { $gte: MIN_CALORIES, $lte: cal.perMeal }, [MACROS[mode]]: { $ne: null }, isEstimate: false };
    if (chainIds.length) filter.chainId = { $in: chainIds };
    const [items, logs] = await Promise.all([
      MenuItem.find(filter, toMenuItemJSON.fields).sort({ _id: 1 }).lean(), // fixed order, so ties pick the same item
      MealLog.find({ userId: req.userId, date: { $gte: dates[0], $lte: dates.at(-1) } }, { date: 1, calories: 1, servings: 1 }).lean(),
    ]);

    const days = mealPlan(items, logs, cal, { dates, mode, chainIds });
    res.json({
      mode,
      days: days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...toMenuItemJSON(i), score: i.score })) })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMealPlan };
