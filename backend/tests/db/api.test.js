// End-to-end tests against a real MongoDB loaded with db/schema.js and db/seed.js (#41).
// Unlike tests/integration, nothing is stubbed: every write also has to pass the collections'
// $jsonSchema validators. They change data (and put it back), so they only run when
// TEST_MONGODB_URI is set; never point it at the production database.
//
//   mongosh "$TEST_MONGODB_URI" db/schema.js db/seed.js
//   TEST_MONGODB_URI=mongodb://localhost:27017 npm run test:db
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const uri = process.env.TEST_MONGODB_URI;

describe("API against a seeded MongoDB", { skip: !uri && "set TEST_MONGODB_URI to run" }, () => {
  let server;
  let base;
  let User;
  const tokens = {};

  before(async () => {
    process.env.MONGODB_URI = uri;
    process.env.JWT_SECRET ||= "db-test-secret";
    process.env.CLIENT_URL ||= "http://localhost:5173";
    process.env.SENDGRID_API_KEY = ""; // email links are logged, never sent
    const app = require("../../src/app");
    User = require("../../src/models/User");
    await require("../../src/config/db").connect();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://localhost:${server.address().port}/api`;
    for (const name of ["jane.doe", "sam.patel"]) {
      const res = await api("POST", "/auth/login", { email: `${name}@example.com`, password: "Password123!" });
      assert.strictEqual(res.status, 200, `seed login ${name}; did seed.js run?`);
      tokens[name] = (await res.json()).token;
    }
  });

  after(async () => {
    server?.close();
    await mongoose.disconnect();
  });

  async function api(method, path, body, token) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: async () => (text ? JSON.parse(text) : null) };
  }

  describe("auth", () => {
    test("wrong password is 401, unverified account is 403", async () => {
      let res = await api("POST", "/auth/login", { email: "jane.doe@example.com", password: "wrong-password" });
      assert.strictEqual(res.status, 401);
      res = await api("POST", "/auth/login", { email: "alex.kim@example.com", password: "Password123!" });
      assert.strictEqual(res.status, 403);
    });

    test("login and resend-verification accept a username", async () => {
      let res = await api("POST", "/auth/login", { login: "JaneDoe", password: "Password123!" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await res.json()).user.email, "jane.doe@example.com");
      res = await api("POST", "/auth/login", { login: "alexkim", password: "Password123!" });
      assert.strictEqual(res.status, 403);
      // Resend replaces alexkim's token; put the seeded one back so demo-verify-token still works.
      const { verificationTokenHash, verificationTokenExpires } = await User.findOne({ username: "alexkim" }).lean();
      try {
        res = await api("POST", "/auth/resend-verification", { login: "alexkim" });
        assert.strictEqual(res.status, 200);
        const after = await User.findOne({ username: "alexkim" }).lean();
        assert.notStrictEqual(after.verificationTokenHash, verificationTokenHash);
      } finally {
        await User.updateOne({ username: "alexkim" }, { $set: { verificationTokenHash, verificationTokenExpires } });
      }
    });

    test("register stores a user the users validator accepts, and a taken email is 409", async () => {
      const email = `db-test-${Date.now()}@example.com`;
      const body = { firstName: "Db", lastName: "Test", username: `dbtest${Date.now() % 1e9}`, email, password: "Password123!" };
      try {
        assert.strictEqual((await api("POST", "/auth/register", body)).status, 201);
        assert.strictEqual((await api("POST", "/auth/register", body)).status, 409);
        const res = await api("POST", "/auth/login", { email, password: "Password123!" });
        assert.strictEqual(res.status, 403); // not verified yet
      } finally {
        await User.deleteOne({ email });
      }
    });

    test("protected routes need a valid token", async () => {
      assert.strictEqual((await api("GET", "/users/me")).status, 401);
      assert.strictEqual((await api("GET", "/users/me", undefined, "not-a-jwt")).status, 401);
    });
  });

  describe("users", () => {
    test("GET /users/me returns the seed user", async () => {
      const me = await (await api("GET", "/users/me", undefined, tokens["jane.doe"])).json();
      assert.strictEqual(me.username, "janedoe");
      assert.strictEqual(me.profile.birthDate, "2006-03-14");
      assert.strictEqual(me.preferences.recommendationMode, "carb");
      assert.ok(!("passwordHash" in me));
    });

    test("GET /users/me/calories follows the contract formula", async () => {
      const c = await (await api("GET", "/users/me/calories", undefined, tokens["jane.doe"])).json();
      assert.strictEqual(c.target, c.maintenance - 500);
      assert.strictEqual(c.perMeal, Math.round(c.target / 3));
      assert.ok(c.age >= 20);
    });

    test("a new user sets a profile, a goal and preferences, and the validator accepts each write", async () => {
      const token = tokens["sam.patel"];
      try {
        let res = await api("GET", "/users/me/calories", undefined, token);
        assert.strictEqual(res.status, 400); // profile still null
        assert.strictEqual((await api("PUT", "/users/me/goal", { goal: "gain" }, token)).status, 400);

        const profile = { heightIn: 68, weightLb: 170.5, birthDate: "2004-07-04", sex: "male", activityLevel: "moderate", goal: "lose" };
        res = await api("PUT", "/users/me/profile", profile, token);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual((await res.json()).profile, profile);

        res = await api("PUT", "/users/me/goal", { goal: "maintain" }, token);
        assert.strictEqual((await res.json()).profile.goal, "maintain");

        res = await api("PATCH", "/users/me/preferences", { units: "metric", searchRadius: 20, mealCalorieLimit: 650 }, token);
        assert.deepStrictEqual((await res.json()).preferences, {
          units: "metric", searchRadius: 20, recommendationMode: "protein", mealCalorieLimit: 650,
        });
        const c = await (await api("GET", "/users/me/calories", undefined, token)).json();
        assert.strictEqual(c.target, c.maintenance);
        assert.strictEqual(c.perMeal, 650);

        res = await api("PATCH", "/users/me/preferences", { mealCalorieLimit: null }, token);
        assert.strictEqual((await res.json()).preferences.mealCalorieLimit, null);
      } finally {
        await User.updateOne(
          { email: "sam.patel@example.com" },
          { $set: { profile: null, preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null } } }
        );
      }
    });
  });

  describe("menu search", () => {
    test("partial, case- and punctuation-insensitive match, sorted by chain then name", async () => {
      const body = await (await api("GET", "/menu-items/search?q=GRILLED%20nuggets")).json();
      const names = body.items.map((i) => `${i.chainName} | ${i.name}`);
      assert.ok(names.includes("Chick-fil-A | Grilled Nuggets (8 ct)"), names.join(", "));
      assert.strictEqual(body.total, body.items.length);
      assert.deepStrictEqual(names, [...names].sort());
      assert.ok(!("searchName" in body.items[0]));
    });

    test("pages with limit and skip; total counts every match", async () => {
      const all = await (await api("GET", "/menu-items/search?q=chicken&limit=100")).json();
      assert.ok(all.total >= 3, `only ${all.total} chicken items`);
      const page = await (await api("GET", "/menu-items/search?q=chicken&limit=2&skip=1")).json();
      assert.strictEqual(page.total, all.total);
      assert.deepStrictEqual(page.items.map((i) => i.id), all.items.slice(1, 3).map((i) => i.id));
    });

    test("punctuation in the query matches the stored normalized name", async () => {
      const body = await (await api("GET", "/menu-items/search?q=chick-fil-a%20nuggets")).json();
      assert.ok(body.items.length > 0);
      assert.ok(body.items.every((i) => i.chainName === "Chick-fil-A"));
    });
  });

  describe("recommendations", () => {
    test("default uses the saved mode and perMeal, best score first, all within the limit", async () => {
      const token = tokens["jane.doe"];
      const c = await (await api("GET", "/users/me/calories", undefined, token)).json();
      const body = await (await api("POST", "/recommendations", {}, token)).json();
      assert.strictEqual(body.mode, "carb");
      assert.strictEqual(body.mealCalorieLimit, c.perMeal);
      assert.ok(body.items.length > 0);
      for (const i of body.items) {
        assert.ok(i.calories >= 300 && i.calories <= c.perMeal, `${i.name} ${i.calories}`);
        assert.strictEqual(i.score, Math.round((i.carbsG / i.calories) * 1000) / 10);
        assert.strictEqual(i.isEstimate, false);
      }
      const scores = body.items.map((i) => i.score);
      assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a));
    });

    test("chainIds limits the results to those chains", async () => {
      const search = await (await api("GET", "/menu-items/search?q=nuggets")).json();
      const chainId = search.items[0].chainId;
      const body = await (await api("POST", "/recommendations", { chainIds: [chainId], mode: "protein", mealCalorieLimit: 800 }, tokens["jane.doe"])).json();
      assert.ok(body.items.length > 0);
      assert.ok(body.items.every((i) => i.chainId === chainId));
    });
  });

  describe("favorites", () => {
    test("add, list, reject a duplicate, and remove", async () => {
      const token = tokens["jane.doe"];
      const before = (await (await api("GET", "/favorites", undefined, token)).json()).favorites;
      assert.ok(before.length >= 2, "seed gives janedoe 2 favorites");

      const placeId = `osm-node-${Date.now()}`;
      let res = await api("POST", "/favorites", { placeId, label: "DB test" }, token);
      assert.strictEqual(res.status, 201);
      const fav = await res.json();
      assert.deepStrictEqual([fav.placeId, fav.label], [placeId, "DB test"]);
      try {
        const list = (await (await api("GET", "/favorites", undefined, token)).json()).favorites;
        assert.strictEqual(list[0].id, fav.id); // newest first
        assert.strictEqual((await api("POST", "/favorites", { placeId }, token)).status, 409);
        // Another user can't delete it.
        assert.strictEqual((await api("DELETE", `/favorites/${fav.id}`, undefined, tokens["sam.patel"])).status, 404);
      } finally {
        res = await api("DELETE", `/favorites/${fav.id}`, undefined, token);
        assert.strictEqual(res.status, 204);
      }
      const after = (await (await api("GET", "/favorites", undefined, token)).json()).favorites;
      assert.strictEqual(after.length, before.length);
    });
  });
});
