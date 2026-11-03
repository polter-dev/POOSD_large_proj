const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const MealLog = require("../../src/models/MealLog");
const MenuItem = require("../../src/models/MenuItem");
const User = require("../../src/models/User");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
const CHICK_FIL_A = "64b000000000000000000001";
const SUBWAY = "64b000000000000000000002";
const MCDONALDS = "64b000000000000000000003";
const PANDA = "64b000000000000000000004";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/meal-plans`;
  auth = `Bearer ${signJwt(USER_ID)}`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

const get = (query, authorization = auth) =>
  fetch(`${base}?${query}`, { headers: authorization ? { Authorization: authorization } : {} });

// Seed user janedoe: carb mode, no saved meal limit, so perMeal = round(target / 3).
const PROFILE = { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" };
const PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "carb", mealCalorieLimit: null };

let n = 0;
const item = (chainId, chainName, name, calories, proteinG, carbsG, fatG) => ({
  _id: `64b0000000000000000000${String(++n).padStart(2, "0")}`,
  chainId, chainName, name, category: "entree", calories, proteinG, carbsG, fatG, isEstimate: false,
});

// Real rows from db/menu-data/chains.js.
const items = [
  item(SUBWAY, "Subway", "6-inch Grilled Chicken (Fresh Fit)", 300, 26, 40, 5), // carb 13.3
  item(SUBWAY, "Subway", "6-inch Rotisserie-Style Chicken (Fresh Fit)", 310, 24, 40, 6), // 12.9
  item(SUBWAY, "Subway", "6-inch Sweet Onion Chicken Teriyaki", 430, 29, 55, 11), // 12.8
  item(MCDONALDS, "McDonald's", "French Fries (Medium)", 320, 5, 43, 15), // 13.4
  item(MCDONALDS, "McDonald's", "Egg McMuffin", 310, 17, 30, 13), // 9.7
  item(CHICK_FIL_A, "Chick-fil-A", "Grilled Chicken Sandwich", 390, 28, 45, 11), // 11.5
  item(PANDA, "Panda Express", "Chow Mein", 520, 14, 89, 12), // over janedoe's perMeal (519 in late 2026)
];

// Answers each find with `rows` and records the filter it was given.
function stub({ user = { profile: PROFILE, preferences: PREFERENCES }, logs = [] } = {}) {
  const seen = {};
  mock.method(User, "findById", () => ({ lean: async () => user }));
  mock.method(MenuItem, "find", (filter) => ((seen.items = filter), { lean: async () => items }));
  mock.method(MealLog, "find", (filter) => ((seen.logs = filter), { lean: async () => logs }));
  return seen;
}

test("needs a login", async () => {
  const res = await get("start=2026-11-03", null);
  assert.strictEqual(res.status, 401);
});

test("janedoe gets 3 items from 3 chains on an empty day", async () => {
  const seen = stub();
  const res = await get("start=2026-11-03");
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.mode, "carb");
  assert.strictEqual(body.days.length, 1);
  const [day] = body.days;
  assert.strictEqual(day.date, "2026-11-03");
  // Nothing logged: remaining = target, and floor(target / 3) is never over perMeal = round(target / 3).
  assert.strictEqual(day.mealCalorieLimit, Math.floor(day.remainingCalories / 3));
  assert.deepStrictEqual(
    day.items.map((i) => [i.chainName, i.name, i.score]),
    [["McDonald's", "French Fries (Medium)", 13.4], ["Subway", "6-inch Grilled Chicken (Fresh Fit)", 13.3], ["Chick-fil-A", "Grilled Chicken Sandwich", 11.5]]
  );
  assert.deepStrictEqual(Object.keys(day.items[0]).sort(), [
    "calories", "carbsG", "category", "chainId", "chainName", "fatG", "id", "isEstimate", "name", "proteinG", "score",
  ]);
  assert.deepStrictEqual(day.totals, { calories: 1010, proteinG: 59, carbsG: 128, fatG: 31, incomplete: false });
  assert.deepStrictEqual(seen.items, { calories: { $gte: 300, $lte: day.mealCalorieLimit }, carbsG: { $ne: null }, isEstimate: false });
  assert.deepStrictEqual(seen.logs, { userId: USER_ID, date: { $gte: "2026-11-03", $lte: "2026-11-03" } });
});

test("a week plan reads the whole range's logs and applies chainIds and mode", async () => {
  const seen = stub({ logs: [{ date: "2026-03-01", calories: 1000, servings: 1 }] });
  const res = await get(`start=2026-02-28&days=7&chainIds=${SUBWAY},${MCDONALDS}&mode=protein`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.mode, "protein");
  assert.deepStrictEqual(body.days.map((d) => d.date), [
    "2026-02-28", "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06",
  ]);
  assert.deepStrictEqual(body.days[1].items, []); // the logged day has under 300 kcal per slot
  assert.ok(body.days.flatMap((d) => d.items).every((i) => [SUBWAY, MCDONALDS].includes(i.chainId)));
  assert.deepStrictEqual(seen.items.chainId, { $in: [SUBWAY, MCDONALDS] });
  assert.ok("proteinG" in seen.items);
  assert.deepStrictEqual(seen.logs.date, { $gte: "2026-02-28", $lte: "2026-03-06" });
});

test("400 Set your profile first when the profile is null", async () => {
  stub({ user: { profile: null, preferences: { ...PREFERENCES, mealCalorieLimit: 600 } } });
  const res = await get("start=2026-11-03");
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Set your profile first" });
});

for (const [label, query, error] of [
  ["a missing start", "days=1", "start must be a date (YYYY-MM-DD)"],
  ["a malformed start", "start=11/03/2026", "start must be a date (YYYY-MM-DD)"],
  ["a start that doesn't exist", "start=2026-02-30", "start must be a date (YYYY-MM-DD)"],
  ["days other than 1 or 7", "start=2026-11-03&days=3", "days must be 1 or 7"],
  ["a malformed chain id", "start=2026-11-03&chainIds=abc", "chainIds must be comma-separated chain ids"],
  ["chainIds given twice", `start=2026-11-03&chainIds=${SUBWAY}&chainIds=${PANDA}`, "chainIds must be comma-separated chain ids"],
  ["an unknown mode", "start=2026-11-03&mode=fat", "mode must be protein or carb"],
]) {
  test(`rejects ${label}`, async () => {
    const seen = stub();
    const res = await get(query);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(seen.items, undefined);
  });
}
