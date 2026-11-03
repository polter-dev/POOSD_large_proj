const { test } = require("node:test");
const assert = require("node:assert");
const { ageOn, calories } = require("../../src/services/calories");

const NOW = new Date("2026-10-28T15:00:00Z");
const NO_LIMIT = { mealCalorieLimit: null };

// Seed users from db/seed.js.
const jane = { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" };
const kevin = { heightIn: 70, weightLb: 155, birthDate: new Date("2005-06-02"), sex: "male", activityLevel: "active", goal: "gain" };

test("seed user janedoe matches the contract's check values", () => {
  assert.deepStrictEqual(calories(jane, NO_LIMIT, NOW), {
    age: 20, maintenance: 2058, target: 1558, perMeal: 519,
    // lose: 35 / 35 / 30 % of 1558 kcal -> 545.3 / 4, 545.3 / 4, 467.4 / 9
    macros: { proteinG: 136, carbsG: 136, fatG: 52 },
  });
});

test("macros split the target by goal: maintain 30/40/30, gain 30/45/25", () => {
  const maintain = calories({ ...jane, goal: "maintain" }, NO_LIMIT, NOW);
  assert.strictEqual(maintain.target, 2058);
  // 617.4 / 4, 823.2 / 4, 617.4 / 9
  assert.deepStrictEqual(maintain.macros, { proteinG: 154, carbsG: 206, fatG: 69 });
  const gain = calories({ ...jane, goal: "gain" }, NO_LIMIT, NOW);
  assert.strictEqual(gain.target, 2358);
  // 707.4 / 4, 1061.1 / 4, 589.5 / 9
  assert.deepStrictEqual(gain.macros, { proteinG: 177, carbsG: 265, fatG: 66 });
});

test("macros use the floored target and ignore the meal limit", () => {
  const small = { heightIn: 60, weightLb: 100, birthDate: new Date("1950-01-01"), sex: "female", activityLevel: "sedentary", goal: "lose" };
  // 1200 kcal: 420 / 4, 420 / 4, 360 / 9
  assert.deepStrictEqual(calories(small, { mealCalorieLimit: 900 }, NOW).macros, { proteinG: 105, carbsG: 105, fatG: 40 });
});

test("an exact .5 gram rounds up (1320 * 0.35 / 4 is 115.49999... in floating point)", () => {
  const p = { heightIn: 61, weightLb: 185, birthDate: new Date("2000-01-01"), sex: "female", activityLevel: "sedentary", goal: "lose" };
  const c = calories(p, NO_LIMIT, NOW);
  assert.strictEqual(c.target, 1320);
  assert.strictEqual(c.macros.proteinG, 116);
});

test("gain adds 300 and maintain adds nothing", () => {
  const gain = calories(kevin, NO_LIMIT, NOW);
  assert.strictEqual(gain.target, gain.maintenance + 300);
  const maintain = calories({ ...kevin, goal: "maintain" }, NO_LIMIT, NOW);
  assert.strictEqual(maintain.target, maintain.maintenance);
});

test("male bmr is 166 above female for the same body (+5 vs -161)", () => {
  const male = calories({ ...jane, sex: "male", activityLevel: "sedentary", goal: "maintain" }, NO_LIMIT, NOW);
  const female = calories({ ...jane, activityLevel: "sedentary", goal: "maintain" }, NO_LIMIT, NOW);
  assert.strictEqual(male.maintenance - female.maintenance, Math.round(166 * 1.2));
});

test("every activity level uses its multiplier", () => {
  const base = { ...jane, goal: "maintain" };
  const levels = ["sedentary", "light", "moderate", "active", "very_active"];
  const values = levels.map((activityLevel) => calories({ ...base, activityLevel }, NO_LIMIT, NOW).maintenance);
  // bmr for jane at 20 is 1496.6222
  assert.deepStrictEqual(values, [1796, 2058, 2320, 2582, 2844]);
});

test("target is floored at 1200 for women and 1500 for men", () => {
  const small = { heightIn: 60, weightLb: 100, birthDate: new Date("1950-01-01"), activityLevel: "sedentary", goal: "lose" };
  const woman = calories({ ...small, sex: "female" }, NO_LIMIT, NOW);
  assert.ok(woman.maintenance - 500 < 1200);
  assert.strictEqual(woman.target, 1200);
  assert.strictEqual(woman.perMeal, 400);
  const man = calories({ ...small, sex: "male" }, NO_LIMIT, NOW);
  assert.ok(man.maintenance - 500 < 1500);
  assert.strictEqual(man.target, 1500);
});

test("perMeal is the user's own meal limit when set", () => {
  assert.strictEqual(calories(jane, { mealCalorieLimit: 600 }, NOW).perMeal, 600);
});

test("age counts whole years and only goes up on the birthday (UTC)", () => {
  const born = new Date("2006-03-14");
  assert.strictEqual(ageOn(born, new Date("2024-03-13T23:59:59Z")), 17);
  assert.strictEqual(ageOn(born, new Date("2024-03-14T00:00:00Z")), 18);
  assert.strictEqual(ageOn(born, new Date("2024-12-31T00:00:00Z")), 18);
  // Leap-day birthdays turn a year older on March 1 in non-leap years.
  const leap = new Date("2008-02-29");
  assert.strictEqual(ageOn(leap, new Date("2026-02-28T12:00:00Z")), 17);
  assert.strictEqual(ageOn(leap, new Date("2026-03-01T00:00:00Z")), 18);
});

test("all values are integers", () => {
  const { macros, ...rest } = calories(kevin, NO_LIMIT, NOW);
  for (const v of [...Object.values(rest), ...Object.values(macros)]) assert.ok(Number.isInteger(v), v);
});
