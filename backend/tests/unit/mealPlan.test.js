const { test } = require("node:test");
const assert = require("node:assert");
const { mealPlan, totals } = require("../../src/services/mealPlan");

// janedoe's numbers (docs/api-contract.md "Calories" check): target 1558, perMeal 519.
const CAL = { target: 1558, perMeal: 519 };
const WEEK = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

let n = 0;
const item = (chainId, calories, proteinG, fatG = 10) => ({
  _id: `item${++n}`, chainId, chainName: chainId, name: `Item ${n}`, category: "entree", calories, proteinG, carbsG: 40, fatG, isEstimate: false,
});

// 30 items over 3 chains, 300-510 kcal, with varied protein so the ranking has no ties.
const menu = Array.from({ length: 30 }, (_, i) => item(["A", "B", "C"][i % 3], 300 + i * 7, 10 + i));

const plan = (logs, opts = {}) => mealPlan(menu, logs, CAL, { dates: [WEEK[0]], mode: "protein", ...opts });
const log = (calories, servings = 1, date = WEEK[0]) => ({ date, calories, servings });

test("an empty day gets 3 items under perMeal, from 3 different chains, with their totals", () => {
  const [day] = plan([]);
  assert.strictEqual(day.date, WEEK[0]);
  assert.strictEqual(day.remainingCalories, 1558);
  assert.strictEqual(day.mealCalorieLimit, 519);
  assert.strictEqual(day.items.length, 3);
  assert.ok(day.items.every((i) => i.calories <= 519 && typeof i.score === "number"));
  assert.deepStrictEqual(new Set(day.items.map((i) => i.chainId)).size, 3);
  assert.strictEqual(day.totals.calories, day.items.reduce((s, i) => s + i.calories, 0));
});

test("a 7-day plan never repeats an item", () => {
  const days = plan([], { dates: WEEK });
  const ids = days.flatMap((d) => d.items.map((i) => i._id));
  assert.strictEqual(ids.length, 21);
  assert.strictEqual(new Set(ids).size, 21);
  assert.deepStrictEqual(days.map((d) => d.date), WEEK);
});

test("an already-logged day gets fewer and smaller slots; planned and eaten both count, times servings", () => {
  const [day] = plan([log(400, 2), log(100)]); // 900 kcal, 2 entries
  assert.strictEqual(day.remainingCalories, 658);
  assert.strictEqual(day.mealCalorieLimit, 519); // 1 slot: min(519, 658)
  assert.strictEqual(day.items.length, 1);

  const [oneLog] = plan([log(758)]); // 800 left over 2 slots
  assert.strictEqual(oneLog.mealCalorieLimit, 400);
  assert.strictEqual(oneLog.items.length, 2);
  assert.ok(oneLog.items.every((i) => i.calories <= 400));
});

test("a day with under 300 kcal per slot returns no items; remaining never goes below 0", () => {
  const [tight] = plan([log(1000)]); // 558 left over 2 slots = 279
  assert.strictEqual(tight.mealCalorieLimit, 279);
  assert.deepStrictEqual(tight.items, []);
  assert.deepStrictEqual(tight.totals, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false });

  const [over] = plan([log(2000)]);
  assert.strictEqual(over.remainingCalories, 0);
  assert.deepStrictEqual(over.items, []);
});

test("only another day's logs leave this day alone", () => {
  const [day] = plan([log(1500, 1, WEEK[1])]);
  assert.strictEqual(day.remainingCalories, 1558);
});

test("chainIds limits the chains", () => {
  const days = plan([], { dates: WEEK, chainIds: ["B"] });
  const picked = days.flatMap((d) => d.items);
  assert.ok(picked.length > 0);
  assert.ok(picked.every((i) => i.chainId === "B"));
});

test("with one chain the day falls back to the top unused items; when they run out, days get fewer", () => {
  const days = plan([], { dates: WEEK, chainIds: ["A"] }); // 10 items from chain A
  assert.deepStrictEqual(days.map((d) => d.items.length), [3, 3, 3, 1, 0, 0, 0]);
  // Best protein per 100 kcal first.
  const scores = days[0].items.map((i) => i.score);
  assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a));
});

test("picks are deterministic for the same input", () => {
  const opts = { dates: WEEK, mode: "carb" };
  assert.deepStrictEqual(plan([log(300)], opts), plan([log(300)], opts));
});

test("totals: integer calories, 1-decimal macros, and a null macro marks them incomplete", () => {
  const t = totals([{ calories: 400.4, proteinG: 20.25, carbsG: 30, fatG: null }, { calories: 300, proteinG: 10, carbsG: 5.06, fatG: 8 }]);
  assert.deepStrictEqual(t, { calories: 700, proteinG: 30.3, carbsG: 35.1, fatG: 8, incomplete: true });
});
