// Ranking for POST /recommendations (docs/api-contract.md "Recommendations", #32).

// Below this an item can't be a meal, and tiny portions would otherwise top the list
// (8 grilled nuggets at 130 kcal score 19.2). It also keeps the score from dividing by zero.
const MIN_CALORIES = 300;
const MACROS = { protein: "proteinG", carb: "carbsG" };

// Grams of the ranking macro per 100 kcal, 1 decimal.
function score(macroG, calories) {
  return Math.round((macroG / calories) * 1000) / 10;
}

// Items that fit [MIN_CALORIES, mealCalorieLimit] and have the ranking macro, each with its score,
// best first: score descending, then fewer calories, then name so ties are stable.
// An unknown macro (null) is skipped, never ranked as 0 (R6: never invent macros).
function rankItems(items, { mode, mealCalorieLimit, limit }) {
  const macro = MACROS[mode];
  return items
    .filter((i) => i[macro] != null && i.calories >= MIN_CALORIES && i.calories <= mealCalorieLimit)
    .map((i) => ({ ...i, score: score(i[macro], i.calories) }))
    .sort((a, b) => b.score - a.score || a.calories - b.calories || a.name.localeCompare(b.name))
    .slice(0, limit);
}

module.exports = { rankItems, score, MIN_CALORIES, MACROS };
