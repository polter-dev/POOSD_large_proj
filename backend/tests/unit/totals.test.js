const { test } = require("node:test");
const assert = require("node:assert");
const { totals, dailyTotals } = require("../../src/services/totals");

const ZERO = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false };

test("totals: integer calories, 1-decimal macros, and a null macro marks them incomplete", () => {
  const t = totals([{ calories: 400.4, proteinG: 20.25, carbsG: 30, fatG: null }, { calories: 300, proteinG: 10, carbsG: 5.06, fatG: 8 }]);
  assert.deepStrictEqual(t, { calories: 700, proteinG: 30.3, carbsG: 35.1, fatG: 8, incomplete: true });
});

test("totals multiply each value by servings; no servings counts as 1", () => {
  const t = totals([
    { servings: 1.5, calories: 130, proteinG: 33, carbsG: 4, fatG: 3.5 }, // Panda's Grilled Teriyaki Chicken
    { servings: 0.25, calories: 250, proteinG: 8, carbsG: 45, fatG: 1 },
    { calories: 100, proteinG: 1, carbsG: 1, fatG: 1 },
  ]);
  // 195 + 62.5 + 100; 49.5 + 2 + 1; 6 + 11.25 + 1; 5.25 + 0.25 + 1
  assert.deepStrictEqual(t, { calories: 358, proteinG: 52.5, carbsG: 18.3, fatG: 6.5, incomplete: false });
});

test("a null macro adds nothing, even with servings, and the other macros still add up", () => {
  const t = totals([{ servings: 2, calories: 250, proteinG: 8, carbsG: 45, fatG: null }]);
  assert.deepStrictEqual(t, { calories: 500, proteinG: 16, carbsG: 90, fatG: 0, incomplete: true });
});

test("no entries give zero totals that are complete", () => {
  assert.deepStrictEqual(totals([]), ZERO);
});

test("dailyTotals: one row per date in order, empty days included, eaten and planned apart", () => {
  const entries = [
    { date: "2026-11-02", status: "eaten", servings: 1, calories: 300, proteinG: 20, carbsG: 30, fatG: 10 },
    { date: "2026-11-02", status: "eaten", servings: 2, calories: 250, proteinG: 8, carbsG: 45, fatG: null },
    { date: "2026-11-04", status: "planned", servings: 1, calories: 600, proteinG: 40, carbsG: 50, fatG: 20 },
    { date: "2026-11-04", status: "eaten", servings: 0.5, calories: 410, proteinG: 13, carbsG: 47, fatG: 21 },
  ];
  const days = dailyTotals(entries, ["2026-11-02", "2026-11-03", "2026-11-04"]);
  assert.deepStrictEqual(days, [
    { date: "2026-11-02", eaten: { calories: 800, proteinG: 36, carbsG: 120, fatG: 10, incomplete: true }, planned: ZERO },
    { date: "2026-11-03", eaten: ZERO, planned: ZERO },
    {
      date: "2026-11-04",
      eaten: { calories: 205, proteinG: 6.5, carbsG: 23.5, fatG: 10.5, incomplete: false },
      planned: { calories: 600, proteinG: 40, carbsG: 50, fatG: 20, incomplete: false },
    },
  ]);
});

test("dailyTotals leaves out entries on dates it wasn't asked for", () => {
  const entries = [{ date: "2026-11-05", status: "eaten", servings: 1, calories: 300, proteinG: 1, carbsG: 1, fatG: 1 }];
  assert.deepStrictEqual(dailyTotals(entries, ["2026-11-04"]), [{ date: "2026-11-04", eaten: ZERO, planned: ZERO }]);
});
