const { test } = require("node:test");
const assert = require("node:assert");
const { rankItems, score } = require("../../src/services/recommendations");

const item = (name, calories, proteinG, carbsG) => ({ name, calories, proteinG, carbsG });

const items = [
  item("Teriyaki Chicken", 300, 36, 13), // protein 12.0, carb 4.3
  item("Chicken Sandwich", 420, 29, 41), // protein 6.9, carb 9.8
  item("Fried Rice", 610, 15, 109), // protein 2.5, carb 17.9
  item("Grilled Nuggets", 130, 25, 1), // under 300 kcal: never returned
  item("Mystery Bowl", 500, null, 60), // protein unknown
  item("Big Burrito", 1100, 50, 120), // over most limits
];

test("score is grams of the macro per 100 kcal, 1 decimal", () => {
  assert.strictEqual(score(29, 420), 6.9);
  assert.strictEqual(score(38, 280), 13.6);
  assert.strictEqual(score(15, 610), 2.5);
});

test("protein mode ranks by protein per 100 kcal and attaches the score", () => {
  const ranked = rankItems(items, { mode: "protein", mealCalorieLimit: 800, limit: 10 });
  assert.deepStrictEqual(
    ranked.map((i) => [i.name, i.score]),
    [["Teriyaki Chicken", 12], ["Chicken Sandwich", 6.9], ["Fried Rice", 2.5]]
  );
});

test("carb mode ranks by carbs, and an item with unknown protein can still rank on carbs", () => {
  const ranked = rankItems(items, { mode: "carb", mealCalorieLimit: 800, limit: 10 });
  assert.deepStrictEqual(ranked.map((i) => i.name), ["Fried Rice", "Mystery Bowl", "Chicken Sandwich", "Teriyaki Chicken"]);
});

test("a null macro is skipped, never ranked as 0", () => {
  const ranked = rankItems(items, { mode: "protein", mealCalorieLimit: 800, limit: 10 });
  assert.ok(!ranked.some((i) => i.name === "Mystery Bowl"));
});

test("only items from 300 kcal up to the meal limit are returned (both ends inclusive)", () => {
  const ranked = rankItems(items, { mode: "protein", mealCalorieLimit: 420, limit: 10 });
  assert.deepStrictEqual(ranked.map((i) => i.calories), [300, 420]);
  assert.deepStrictEqual(rankItems(items, { mode: "protein", mealCalorieLimit: 299, limit: 10 }), []);
});

test("equal scores put the lower-calorie item first, then sort by name", () => {
  const ties = [item("B", 600, 30, 0), item("A", 600, 30, 0), item("C", 400, 20, 0)];
  const ranked = rankItems(ties, { mode: "protein", mealCalorieLimit: 800, limit: 10 });
  assert.deepStrictEqual(ranked.map((i) => i.name), ["C", "A", "B"]);
});

test("limit caps the list after ranking", () => {
  const ranked = rankItems(items, { mode: "protein", mealCalorieLimit: 800, limit: 1 });
  assert.deepStrictEqual(ranked.map((i) => i.name), ["Teriyaki Chicken"]);
});

test("the input items are not modified", () => {
  const copy = structuredClone(items);
  rankItems(items, { mode: "protein", mealCalorieLimit: 800, limit: 10 });
  assert.deepStrictEqual(items, copy);
});
