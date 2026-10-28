const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const MenuItem = require("../../src/models/MenuItem");
const User = require("../../src/models/User");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
const CHAIN_A = "64b000000000000000000001";
const CHAIN_B = "64b000000000000000000002";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/recommendations`;
  auth = `Bearer ${signJwt(USER_ID)}`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

function post(body, authorization = auth) {
  return fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: JSON.stringify(body),
  });
}

// Seed user janedoe: carb mode, no saved meal limit, so perMeal = round(target / 3).
const PROFILE = { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" };
const PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "carb", mealCalorieLimit: null };

function stubUser(user = { profile: PROFILE, preferences: PREFERENCES }) {
  return mock.method(User, "findById", () => ({ lean: async () => user }));
}

let n = 0;
const item = (name, calories, proteinG, carbsG, extra) => ({
  _id: `64b0000000000000000000${String(++n).padStart(2, "0")}`,
  chainId: CHAIN_A,
  chainName: "Panda Express",
  name,
  category: "entree",
  calories,
  proteinG,
  carbsG,
  fatG: 10,
  isEstimate: false,
  ...extra,
});

const items = [
  item("Grilled Teriyaki Chicken", 300, 36, 13),
  item("Orange Chicken", 490, 25, 51),
  item("Chow Mein", 510, 13, 80, { category: "side" }),
];

// Records the filter MenuItem.find was given and answers with `rows`.
function stubItems(rows = items) {
  const seen = {};
  mock.method(MenuItem, "find", (filter) => {
    seen.filter = filter;
    return { lean: async () => rows };
  });
  return seen;
}

test("needs a login", async () => {
  const res = await post({}, null);
  assert.strictEqual(res.status, 401);
});

test("with an empty body, uses the saved mode and perMeal and returns scored items best first", async () => {
  stubUser();
  const seen = stubItems();
  const res = await post({});
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.mode, "carb");
  assert.strictEqual(body.mealCalorieLimit, Math.round(body.mealCalorieLimit)); // integer perMeal
  assert.deepStrictEqual(
    body.items.map((i) => [i.name, i.score]),
    [["Chow Mein", 15.7], ["Orange Chicken", 10.4], ["Grilled Teriyaki Chicken", 4.3]]
  );
  // The full MenuItem plus score; nothing else.
  assert.deepStrictEqual(Object.keys(body.items[0]).sort(), [
    "calories", "carbsG", "category", "chainId", "chainName", "fatG", "id", "isEstimate", "name", "proteinG", "score",
  ]);
  assert.deepStrictEqual(seen.filter, {
    calories: { $gte: 300, $lte: body.mealCalorieLimit },
    carbsG: { $ne: null },
    isEstimate: false,
  });
});

test("body values override the saved ones without loading the user", async () => {
  const findById = stubUser();
  const seen = stubItems();
  const res = await post({ mode: "protein", mealCalorieLimit: 500, limit: 2, chainIds: [CHAIN_A, CHAIN_B], includeEstimates: true });
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(findById.mock.callCount(), 0);
  assert.deepStrictEqual([body.mode, body.mealCalorieLimit], ["protein", 500]);
  // Chow Mein (510) is over the limit; limit 2 keeps the best two.
  assert.deepStrictEqual(body.items.map((i) => i.name), ["Grilled Teriyaki Chicken", "Orange Chicken"]);
  assert.deepStrictEqual(seen.filter, {
    calories: { $gte: 300, $lte: 500 },
    proteinG: { $ne: null },
    chainId: { $in: [CHAIN_A, CHAIN_B] },
  });
});

test("an empty chainIds list means every chain", async () => {
  stubUser();
  const seen = stubItems();
  await post({ chainIds: [] });
  assert.ok(!("chainId" in seen.filter));
});

test("a saved meal limit is used even before the profile is filled in", async () => {
  stubUser({ profile: null, preferences: { ...PREFERENCES, mealCalorieLimit: 600 } });
  stubItems();
  const body = await (await post({})).json();
  assert.strictEqual(body.mealCalorieLimit, 600);
});

test("400 Set your profile first when no meal limit can be worked out", async () => {
  stubUser({ profile: null, preferences: PREFERENCES });
  stubItems();
  const res = await post({ mode: "protein" });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Set your profile first" });
});

test("a body meal limit works with no profile at all", async () => {
  stubUser({ profile: null, preferences: PREFERENCES });
  stubItems();
  assert.strictEqual((await post({ mealCalorieLimit: 700 })).status, 200);
});

test("404 when the account was deleted and a default is needed", async () => {
  stubUser(null);
  const res = await post({});
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "User not found" });
});

for (const [label, body, error] of [
  ["chainIds that isn't a list", { chainIds: CHAIN_A }, "chainIds must be a list of chain ids"],
  ["a malformed chain id", { chainIds: ["abc"] }, "chainIds must be a list of chain ids"],
  ["a Mongo operator as a chain id", { chainIds: [{ $ne: null }] }, "chainIds must be a list of chain ids"],
  ["an unknown mode", { mode: "fat" }, "mode must be protein or carb"],
  ["a meal limit under 100", { mealCalorieLimit: 50 }, "mealCalorieLimit must be a number from 100 to 3000"],
  ["a meal limit as a string", { mealCalorieLimit: "500" }, "mealCalorieLimit must be a number from 100 to 3000"],
  ["a null meal limit", { mealCalorieLimit: null }, "mealCalorieLimit must be a number from 100 to 3000"],
  ["limit 0", { limit: 0 }, "limit must be a whole number from 1 to 50"],
  ["limit 51", { limit: 51 }, "limit must be a whole number from 1 to 50"],
  ["a decimal limit", { limit: 2.5 }, "limit must be a whole number from 1 to 50"],
  ["includeEstimates as a string", { includeEstimates: "true" }, "includeEstimates must be true or false"],
  ["an unknown field", { minCalories: 0 }, "Unknown field: minCalories"],
]) {
  test(`rejects ${label}`, async () => {
    stubUser();
    const seen = stubItems();
    const res = await post(body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(seen.filter, undefined);
  });
}
