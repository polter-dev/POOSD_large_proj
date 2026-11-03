// Suggested eats for GET /meal-plans (docs/api-contract.md "Meal plans", #111). Pure: nothing is stored.
const { rankItems } = require("./recommendations");

const MEALS_PER_DAY = 3;
const MACRO_FIELDS = ["proteinG", "carbsG", "fatG"];

// The contract's Totals for one serving of each item: integer calories, macros to 1 decimal, and
// incomplete when a macro is unknown (a null adds nothing, never 0).
function totals(items) {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false };
  for (const i of items) {
    t.calories += i.calories;
    for (const m of MACRO_FIELDS) {
      if (i[m] == null) t.incomplete = true;
      else t[m] += i[m];
    }
  }
  t.calories = Math.round(t.calories);
  for (const m of MACRO_FIELDS) t[m] = Math.round(t[m] * 10) / 10;
  return t;
}

// One row per date, in order. items: menu items to pick from; logs: the user's entries in the range
// ({ date, calories, servings }); target and perMeal from calories(); chainIds empty = every chain.
// Picked items keep their fields plus score, like rankItems returns them.
function mealPlan(items, logs, { target, perMeal }, { dates, mode, chainIds = [] }) {
  const pool = chainIds.length ? items.filter((i) => chainIds.includes(String(i.chainId))) : items;
  const used = new Set(); // item ids picked anywhere in the plan: no repeats
  return dates.map((date) => {
    const dayLogs = logs.filter((l) => l.date === date); // planned and eaten alike
    const logged = dayLogs.reduce((sum, l) => sum + l.calories * l.servings, 0);
    const remaining = Math.max(0, target - logged);
    const remainingCalories = Math.round(remaining); // reported rounded; the limit uses the real value
    const slots = Math.max(1, MEALS_PER_DAY - dayLogs.length);
    const mealCalorieLimit = Math.min(perMeal, Math.floor(remaining / slots));
    // rankItems drops everything under 300 kcal, so a limit under 300 leaves the day empty.
    const ranked = rankItems(pool, { mode, mealCalorieLimit, limit: Infinity });

    const picks = [];
    const chains = new Set();
    for (let s = 0; s < slots; s++) {
      const fresh = ranked.filter((i) => !used.has(String(i._id)));
      const pick = fresh.find((i) => !chains.has(String(i.chainId))) ?? fresh[0];
      if (!pick) break; // out of unused items: the day just has fewer
      used.add(String(pick._id));
      chains.add(String(pick.chainId));
      picks.push(pick);
    }
    return { date, remainingCalories, mealCalorieLimit, items: picks, totals: totals(picks) };
  });
}

module.exports = { mealPlan, totals };
