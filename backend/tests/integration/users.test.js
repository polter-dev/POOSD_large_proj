const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const User = require("../../src/models/User");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/users/me`;
  auth = `Bearer ${signJwt(USER_ID)}`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

function call(method, path = "", body, authorization = auth) {
  return fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "carb", mealCalorieLimit: null };
const PROFILE = { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" };

function storedUser(extra) {
  return {
    _id: USER_ID,
    firstName: "Jane",
    lastName: "Doe",
    username: "janedoe",
    email: "jane.doe@example.com",
    passwordHash: "secret-hash",
    isVerified: true,
    resetTokenHash: "secret-reset-hash",
    profile: PROFILE,
    preferences: PREFERENCES,
    ...extra,
  };
}

const lean = (value) => () => ({ lean: async () => value });

// Records each findByIdAndUpdate / findOneAndUpdate and answers with the user after the update.
function stubUpdate(method, user) {
  const calls = [];
  mock.method(User, method, (...args) => {
    calls.push(args);
    return { lean: async () => user };
  });
  return calls;
}

// A birth date `years` years before today (UTC), as YYYY-MM-DD.
function yearsAgo(years, days = 0) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// auth and GET /me
// ---------------------------------------------------------------------------
test("every /users/me route needs a token", async () => {
  for (const [method, path] of [["GET", ""], ["PUT", "/profile"], ["PUT", "/goal"], ["PATCH", "/preferences"], ["GET", "/calories"]]) {
    const res = await call(method, path, undefined, null);
    assert.strictEqual(res.status, 401, `${method} ${path}`);
    assert.deepStrictEqual(await res.json(), { error: "Not logged in" });
  }
});

test("GET /me returns the contract's User and never the hashes", async () => {
  mock.method(User, "findById", lean(storedUser()));
  const res = await call("GET");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    id: USER_ID,
    firstName: "Jane",
    lastName: "Doe",
    username: "janedoe",
    email: "jane.doe@example.com",
    isVerified: true,
    profile: { heightIn: 65, weightLb: 160, birthDate: "2006-03-14", sex: "female", activityLevel: "light", goal: "lose" },
    preferences: PREFERENCES,
  });
  assert.strictEqual(User.findById.mock.calls[0].arguments[0], USER_ID);
});

test("GET /me answers 404 when the account was deleted", async () => {
  mock.method(User, "findById", lean(null));
  const res = await call("GET");
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "User not found" });
});

// ---------------------------------------------------------------------------
// PUT /me/profile
// ---------------------------------------------------------------------------
const goodProfile = { heightIn: 70.5, weightLb: 180, birthDate: "2000-02-29", sex: "male", activityLevel: "very_active", goal: "gain" };

test("PUT /me/profile replaces the profile, storing birthDate as UTC midnight", async () => {
  const calls = stubUpdate("findByIdAndUpdate", storedUser({ profile: { ...goodProfile, birthDate: new Date("2000-02-29") } }));
  const res = await call("PUT", "/profile", goodProfile);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual((await res.json()).profile, goodProfile);

  const [id, update, options] = calls[0];
  assert.strictEqual(id, USER_ID);
  assert.deepStrictEqual(update, { $set: { profile: { ...goodProfile, birthDate: new Date("2000-02-29T00:00:00Z") } } });
  assert.deepStrictEqual(options, { returnDocument: "after" });
});

for (const [label, change, error] of [
  ["height too short", { heightIn: 35 }, "Height: 36 to 96 inches"],
  ["height as a string", { heightIn: "70" }, "Height: 36 to 96 inches"],
  ["weight too high", { weightLb: 701 }, "Weight: 50 to 700 lb"],
  ["missing weight", { weightLb: undefined }, "Weight: 50 to 700 lb"],
  ["birth date not YYYY-MM-DD", { birthDate: "02/29/2000" }, "Birth date: use YYYY-MM-DD"],
  ["birth date that doesn't exist", { birthDate: "2001-02-29" }, "Birth date: use YYYY-MM-DD"],
  ["under 18 by a day", { birthDate: yearsAgo(18, 1) }, "Birth date: you must be 18 or older"],
  ["over 119", { birthDate: yearsAgo(120) }, "Birth date: check the year"],
  ["unknown sex", { sex: "other" }, "Sex: male or female"],
  ["unknown activity level", { activityLevel: "extreme" }, "Activity level: sedentary, light, moderate, active or very_active"],
  ["unknown goal", { goal: "bulk" }, "Goal: lose, maintain or gain"],
]) {
  test(`PUT /me/profile rejects ${label}`, async () => {
    const calls = stubUpdate("findByIdAndUpdate", storedUser());
    const res = await call("PUT", "/profile", { ...goodProfile, ...change });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(calls.length, 0);
  });
}

test("PUT /me/profile accepts exactly 18 today and rejects unknown fields", async () => {
  stubUpdate("findByIdAndUpdate", storedUser());
  assert.strictEqual((await call("PUT", "/profile", { ...goodProfile, birthDate: yearsAgo(18) })).status, 200);

  const res = await call("PUT", "/profile", { ...goodProfile, age: 25 });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Unknown field: age" });
});

// ---------------------------------------------------------------------------
// PUT /me/goal
// ---------------------------------------------------------------------------
test("PUT /me/goal changes only the goal, and only for a user with a profile", async () => {
  const calls = stubUpdate("findOneAndUpdate", storedUser({ profile: { ...PROFILE, goal: "maintain" } }));
  const res = await call("PUT", "/goal", { goal: "maintain" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).profile.goal, "maintain");
  const [filter, update] = calls[0];
  assert.deepStrictEqual(filter, { _id: USER_ID, profile: { $ne: null } });
  assert.deepStrictEqual(update, { $set: { "profile.goal": "maintain" } });
});

test("PUT /me/goal answers 400 Set your profile first when the profile is null, 404 when the user is gone", async () => {
  stubUpdate("findOneAndUpdate", null);
  mock.method(User, "exists", async () => ({ _id: USER_ID }));
  let res = await call("PUT", "/goal", { goal: "gain" });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Set your profile first" });

  User.exists.mock.mockImplementation(async () => null);
  res = await call("PUT", "/goal", { goal: "gain" });
  assert.strictEqual(res.status, 404);
});

test("PUT /me/goal rejects an invalid goal", async () => {
  const res = await call("PUT", "/goal", { goal: "LOSE" });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Goal: lose, maintain or gain" });
});

// ---------------------------------------------------------------------------
// PATCH /me/preferences
// ---------------------------------------------------------------------------
test("PATCH /me/preferences sets only the fields sent", async () => {
  const calls = stubUpdate("findByIdAndUpdate", storedUser({ preferences: { ...PREFERENCES, searchRadius: 15, mealCalorieLimit: 650 } }));
  const res = await call("PATCH", "/preferences", { searchRadius: 15, mealCalorieLimit: 650 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).preferences.searchRadius, 15);
  assert.deepStrictEqual(calls[0][1], { $set: { "preferences.searchRadius": 15, "preferences.mealCalorieLimit": 650 } });
});

test("PATCH /me/preferences with mealCalorieLimit null clears it", async () => {
  const calls = stubUpdate("findByIdAndUpdate", storedUser());
  assert.strictEqual((await call("PATCH", "/preferences", { mealCalorieLimit: null })).status, 200);
  assert.deepStrictEqual(calls[0][1], { $set: { "preferences.mealCalorieLimit": null } });
});

for (const [label, body, error] of [
  ["an empty body", {}, "Nothing to update"],
  ["unknown units", { units: "stone" }, "Units: imperial or metric"],
  ["a radius not in 5/10/15/20", { searchRadius: 7 }, "Search radius: 5, 10, 15 or 20 miles"],
  ["a radius as a string", { searchRadius: "10" }, "Search radius: 5, 10, 15 or 20 miles"],
  ["an unknown mode", { recommendationMode: "fat" }, "Recommendation mode: protein or carb"],
  ["a meal limit under 100", { mealCalorieLimit: 99 }, "Meal calorie limit: 100 to 3000 calories, or none"],
  ["a meal limit over 3000", { mealCalorieLimit: 3001 }, "Meal calorie limit: 100 to 3000 calories, or none"],
  ["an unknown field", { theme: "dark" }, "Unknown field: theme"],
]) {
  test(`PATCH /me/preferences rejects ${label}`, async () => {
    const calls = stubUpdate("findByIdAndUpdate", storedUser());
    const res = await call("PATCH", "/preferences", body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(calls.length, 0);
  });
}

// ---------------------------------------------------------------------------
// GET /me/calories
// ---------------------------------------------------------------------------
test("GET /me/calories returns integer targets from the saved profile", async () => {
  mock.method(User, "findById", lean(storedUser()));
  const res = await call("GET", "/calories");
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ["age", "maintenance", "target", "perMeal"]);
  assert.strictEqual(body.target, body.maintenance - 500);
  assert.strictEqual(body.perMeal, Math.round(body.target / 3));
});

test("GET /me/calories uses the saved meal limit for perMeal", async () => {
  mock.method(User, "findById", lean(storedUser({ preferences: { ...PREFERENCES, mealCalorieLimit: 600 } })));
  assert.strictEqual((await (await call("GET", "/calories")).json()).perMeal, 600);
});

test("GET /me/calories answers 400 Set your profile first with no profile", async () => {
  mock.method(User, "findById", lean(storedUser({ profile: null })));
  const res = await call("GET", "/calories");
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Set your profile first" });
});
