// End-to-end tests against a real MongoDB loaded with db/schema.js and db/seed.js (#41).
// Unlike tests/integration, nothing is stubbed: every write also has to pass the collections'
// $jsonSchema validators. They change data (and put it back), so they only run when
// TEST_MONGODB_URI is set; never point it at the production database.
//
//   SEED_ADMIN=1 mongosh "$TEST_MONGODB_URI" db/schema.js db/seed.js
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
    for (const name of ["jane.doe", "sam.patel", "kevin.nguyen"]) {
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
        // Both are optional in the users validator; the API fills in the defaults when it answers.
        const doc = await User.findOne({ email }).lean();
        assert.ok(!("role" in doc) && !("trackedNutrients" in doc.preferences), JSON.stringify(doc.preferences));
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
      assert.strictEqual(me.role, "user"); // not stored: the default
      assert.deepStrictEqual(me.preferences.trackedNutrients, ["calories", "protein", "carbs"]); // seeded (sam.patel gets the default below)
      assert.ok(!("passwordHash" in me));
    });

    test("GET /users/me/calories follows the contract formula", async () => {
      const c = await (await api("GET", "/users/me/calories", undefined, tokens["jane.doe"])).json();
      assert.strictEqual(c.target, c.maintenance - 500);
      assert.strictEqual(c.perMeal, Math.round(c.target / 3));
      assert.ok(c.age >= 20);
      // lose: 35 / 35 / 30 % of target
      assert.deepStrictEqual(c.macros, {
        proteinG: Math.round((c.target * 35) / 400), carbsG: Math.round((c.target * 35) / 400), fatG: Math.round((c.target * 30) / 900),
      });
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
          units: "metric", searchRadius: 20, recommendationMode: "protein", mealCalorieLimit: 650, trackedNutrients: ["calories", "protein"],
        });

        res = await api("PATCH", "/users/me/preferences", { trackedNutrients: ["carbs", "calories", "fat"] }, token);
        assert.deepStrictEqual((await res.json()).preferences.trackedNutrients, ["carbs", "calories", "fat"]);
        assert.strictEqual((await api("PATCH", "/users/me/preferences", { trackedNutrients: [] }, token)).status, 400);
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

  // seed.js logs janedoe's food on UCF's calendar days (America/New_York).
  const ucfDay = (daysBack) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000));

  describe("meal logs", () => {
    const DAY = "2030-01-15"; // far from the seeded days, so these tests see only their own entries

    test("janedoe's seeded tracker: yesterday is 'at least' (a custom food without fat), today has a planned Subway sandwich", async () => {
      const [yesterday, today] = [ucfDay(1), ucfDay(0)];
      const body = await (await api("GET", `/meal-logs?from=${yesterday}&to=${today}`, undefined, tokens["jane.doe"])).json();
      assert.deepStrictEqual(body.days.map((d) => d.date), [yesterday, today]);
      const dates = body.entries.map((e) => e.date);
      assert.deepStrictEqual(dates, [...dates].sort());
      const smoothie = body.entries.find((e) => e.name === "Homemade smoothie");
      assert.deepStrictEqual([smoothie.menuItemId, smoothie.chainName, smoothie.fatG, smoothie.source], [null, null, null, "custom"]);
      assert.strictEqual(body.days[0].eaten.incomplete, true);
      assert.ok(body.days[0].eaten.calories > 0);
      const panda = body.entries.find((e) => e.chainName === "Panda Express");
      assert.strictEqual(panda.servings, 1.5);
      assert.deepStrictEqual(body.days[1].planned, { calories: 300, proteinG: 26, carbsG: 40, fatG: 5, incomplete: false });
      // Another user's tracker doesn't show them.
      const sams = await (await api("GET", `/meal-logs?from=${yesterday}&to=${today}`, undefined, tokens["sam.patel"])).json();
      assert.ok(sams.entries.every((e) => !body.entries.some((j) => j.id === e.id)));
    });

    test("log a batch, eat the planned item, change a portion, delete; the validator accepts every write", async () => {
      const token = tokens["jane.doe"];
      const logs = mongoose.connection.db.collection("mealLogs");
      const item = (await (await api("GET", "/menu-items/search?q=grilled%20nuggets")).json()).items[0];
      let ids = [];
      try {
        let res = await api("POST", "/meal-logs", {
          entries: [
            { date: DAY, status: "planned", source: "plan", menuItemId: item.id },
            { date: DAY, source: "custom", name: "DB test oatmeal", calories: 150, proteinG: 5, carbsG: 27, fatG: null, servings: 2 },
          ],
        }, token);
        assert.strictEqual(res.status, 201);
        const added = (await res.json()).entries;
        ids = added.map((e) => e.id);
        assert.deepStrictEqual(
          [added[0].name, added[0].chainName, added[0].calories, added[0].proteinG, added[0].status],
          [item.name, item.chainName, item.calories, item.proteinG, "planned"]
        );
        assert.deepStrictEqual([added[1].menuItemId, added[1].chainName, added[1].status], [null, null, "eaten"]);

        let day = (await (await api("GET", `/meal-logs?from=${DAY}&to=${DAY}`, undefined, token)).json()).days[0];
        assert.deepStrictEqual(day.eaten, { calories: 300, proteinG: 10, carbsG: 54, fatG: 0, incomplete: true });
        assert.strictEqual(day.planned.calories, Math.round(item.calories));

        res = await api("PATCH", `/meal-logs/${ids[0]}`, { status: "eaten", servings: 1.5 }, token);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual([(await res.json()).status, (await logs.findOne({ _id: new mongoose.Types.ObjectId(ids[0]) })).servings], ["eaten", 1.5]);
        day = (await (await api("GET", `/meal-logs?from=${DAY}&to=${DAY}`, undefined, token)).json()).days[0];
        assert.strictEqual(day.planned.calories, 0);
        assert.strictEqual(day.eaten.calories, Math.round(300 + item.calories * 1.5));

        // Someone else's entry is a 404, and stays as it was.
        assert.strictEqual((await api("PATCH", `/meal-logs/${ids[0]}`, { servings: 3 }, tokens["sam.patel"])).status, 404);
        assert.strictEqual((await api("DELETE", `/meal-logs/${ids[0]}`, undefined, tokens["sam.patel"])).status, 404);
        assert.strictEqual((await logs.findOne({ _id: new mongoose.Types.ObjectId(ids[0]) })).servings, 1.5);

        for (const id of ids) assert.strictEqual((await api("DELETE", `/meal-logs/${id}`, undefined, token)).status, 204);
        assert.strictEqual((await api("DELETE", `/meal-logs/${ids[0]}`, undefined, token)).status, 404);
        ids = [];
      } finally {
        await logs.deleteMany({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } });
      }
    });

    test("a batch with one bad entry or a missing menu item writes nothing", async () => {
      const token = tokens["jane.doe"];
      const logs = mongoose.connection.db.collection("mealLogs");
      const good = { date: DAY, source: "custom", name: "DB test apple", calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3 };
      const item = (await (await api("GET", "/menu-items/search?q=grilled%20nuggets")).json()).items[0];
      for (const [entries, status] of [
        [[good, { ...good, date: "2030-02-30" }], 400],
        [[good, { date: DAY, source: "search", menuItemId: item.id, calories: 1 }], 400],
        [[good, { date: DAY, source: "search", menuItemId: "000000000000000000000000" }], 404],
      ]) {
        const res = await api("POST", "/meal-logs", { entries }, token);
        assert.strictEqual(res.status, status, (await res.json()).error);
      }
      assert.strictEqual(await logs.countDocuments({ date: DAY }), 0);
    });
  });

  describe("meal plans", () => {
    test("7 days from yesterday: each day's limit follows janedoe's seeded logs; verified items only, never repeated", async () => {
      const token = tokens["jane.doe"];
      const { target, perMeal } = await (await api("GET", "/users/me/calories", undefined, token)).json();
      const res = await api("GET", `/meal-plans?start=${ucfDay(1)}&days=7`, undefined, token);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.mode, "carb");
      assert.deepStrictEqual(body.days.slice(0, 2).map((d) => d.date), [ucfDay(1), ucfDay(0)]);
      assert.strictEqual(body.days.length, 7);

      // Yesterday has 4 seeded entries (one is 1.5 servings), today 2 (one planned), the rest none.
      const { entries } = await (await api("GET", `/meal-logs?from=${body.days[0].date}&to=${body.days[6].date}`, undefined, token)).json();
      assert.deepStrictEqual(body.days.map((d) => entries.filter((e) => e.date === d.date).length), [4, 2, 0, 0, 0, 0, 0]);
      const picked = new Set();
      for (const day of body.days) {
        const logs = entries.filter((e) => e.date === day.date);
        const remaining = Math.max(0, target - logs.reduce((sum, e) => sum + e.calories * e.servings, 0));
        const slots = Math.max(1, 3 - logs.length);
        assert.strictEqual(day.remainingCalories, Math.round(remaining), day.date);
        assert.strictEqual(day.mealCalorieLimit, Math.min(perMeal, Math.floor(remaining / slots)), day.date);
        assert.ok(day.items.length <= slots, day.date);
        for (const i of day.items) {
          assert.ok(i.calories >= 300 && i.calories <= day.mealCalorieLimit, `${day.date} ${i.name} ${i.calories}`);
          assert.strictEqual(i.isEstimate, false, i.name);
          assert.strictEqual(i.score, Math.round((i.carbsG / i.calories) * 1000) / 10, i.name);
          assert.ok(!picked.has(i.id), `${i.name} picked twice`);
          picked.add(i.id);
        }
        assert.strictEqual(day.totals.calories, day.items.reduce((sum, i) => sum + i.calories, 0), day.date);
      }
      // A day with nothing logged fills all 3 slots, each from a different chain.
      assert.strictEqual(new Set(body.days[2].items.map((i) => i.chainId)).size, 3);
    });

    test("one chain for a week uses up its verified items once each; Subway's community estimate never appears", async () => {
      const token = tokens["jane.doe"];
      const items = mongoose.connection.db.collection("menuItems");
      const subway = await mongoose.connection.db.collection("chains").findOne({ nameKey: "subway" });
      assert.ok(await items.findOne({ chainId: subway._id, isEstimate: true }), "seed gives Subway a community item");
      const res = await api("GET", `/meal-plans?start=2030-01-15&days=7&chainIds=${subway._id}&mode=protein`, undefined, token);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.mode, "protein");

      // 21 slots, more than Subway has items: the week picks every eligible verified one, then runs out.
      const limit = body.days[0].mealCalorieLimit;
      const eligible = await items
        .find({ chainId: subway._id, isEstimate: false, proteinG: { $ne: null }, calories: { $gte: 300, $lte: limit } })
        .toArray();
      const picks = body.days.flatMap((d) => d.items);
      assert.ok(eligible.length > 0 && eligible.length < 21);
      assert.deepStrictEqual(picks.map((i) => i.id).sort(), eligible.map((i) => String(i._id)).sort());
      const scores = picks.map((i) => i.score); // one chain, so each day takes the best item left
      assert.deepStrictEqual(scores, [...scores].sort((a, b) => b - a));
      for (const i of picks) assert.strictEqual(i.score, Math.round((i.proteinG / i.calories) * 1000) / 10, i.name);
    });
  });

  describe("submissions", () => {
    test("kevinn's new item and its edit apply at once, show in search, stay out of recommendations; a verified edit waits", async () => {
      const token = tokens["kevin.nguyen"];
      const items = mongoose.connection.db.collection("menuItems");
      const submissions = mongoose.connection.db.collection("submissions");
      const subway = await mongoose.connection.db.collection("chains").findOne({ nameKey: "subway" });
      const bigMac = await items.findOne({ chainName: "McDonald's", name: "Big Mac" });
      const ids = [];
      let itemId;
      try {
        // 4*40 + 4*50 + 9*15.5 = 499.5, close to 500: no flags.
        const payload = { name: "DB Test Protein Bowl", category: "entree", calories: 500, proteinG: 40, carbsG: 50, fatG: 15.5 };
        let res = await api("POST", "/submissions", { kind: "new_item", targetId: String(subway._id), payload }, token);
        assert.strictEqual(res.status, 201);
        const added = await res.json();
        ids.push(added.id);
        itemId = added.resultId;
        assert.strictEqual(added.status, "auto_applied");
        assert.ok(!("flags" in added));
        assert.strictEqual((await api("POST", "/submissions", { kind: "new_item", targetId: String(subway._id), payload }, token)).status, 409);

        const found = (await (await api("GET", "/menu-items/search?q=db%20test%20protein")).json()).items;
        assert.deepStrictEqual(found.map((i) => [i.id, i.isEstimate]), [[itemId, true]]);
        const recs = async (includeEstimates) => (await (await api("POST", "/recommendations",
          { chainIds: [String(subway._id)], mode: "protein", mealCalorieLimit: 800, limit: 50, includeEstimates }, token)).json()).items.map((i) => i.id);
        assert.ok(!(await recs(false)).includes(itemId));
        assert.ok((await recs(true)).includes(itemId));

        res = await api("POST", "/submissions", { kind: "edit_item", targetId: itemId, payload: { calories: 510 } }, token);
        const edit = await res.json();
        ids.push(edit.id);
        assert.deepStrictEqual([edit.status, edit.before], ["auto_applied", { calories: 500 }]);
        assert.strictEqual((await items.findOne({ _id: new mongoose.Types.ObjectId(itemId) })).calories, 510);

        res = await api("POST", "/submissions", { kind: "edit_item", targetId: String(bigMac._id), payload: { calories: 600 } }, token);
        const waiting = await res.json();
        ids.push(waiting.id);
        assert.strictEqual(waiting.status, "pending");
        assert.deepStrictEqual((await submissions.findOne({ _id: new mongoose.Types.ObjectId(waiting.id) })).flags, ["verified_item"]);
        assert.deepStrictEqual(await items.findOne({ _id: bigMac._id }), bigMac);

        const mine = await (await api("GET", "/submissions/mine", undefined, token)).json();
        assert.deepStrictEqual(mine.submissions.slice(0, 3).map((s) => s.id), [...ids].reverse());
        assert.ok(!("flags" in mine.submissions[0]));
        const sams = await (await api("GET", "/submissions/mine", undefined, tokens["sam.patel"])).json();
        assert.ok(sams.submissions.every((s) => !ids.includes(s.id)));
      } finally {
        if (itemId) await items.deleteOne({ _id: new mongoose.Types.ObjectId(itemId) });
        await submissions.deleteMany({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } });
      }
    });
  });

  describe("admin", () => {
    test("siteadmin approves kevinn's pending Big Mac edit, then reverting puts the item back exactly", async () => {
      assert.strictEqual((await api("GET", "/admin/submissions", undefined, tokens["jane.doe"])).status, 403);
      const login = await api("POST", "/auth/login", { login: "siteadmin", password: "Password123!" });
      assert.strictEqual(login.status, 200, "siteadmin login; did seed.js run with SEED_ADMIN=1?");
      const { token, user } = await login.json();
      assert.strictEqual(user.role, "admin");

      const queue = await (await api("GET", "/admin/submissions", undefined, token)).json();
      const sub = queue.submissions.find((s) => s.user.username === "kevinn");
      assert.ok(sub, "seed gives kevinn a pending edit");
      const items = mongoose.connection.db.collection("menuItems");
      const submissions = mongoose.connection.db.collection("submissions");
      const id = new mongoose.Types.ObjectId(sub.id);
      const original = await items.findOne({ _id: new mongoose.Types.ObjectId(sub.targetId) });
      const storedSub = await submissions.findOne({ _id: id });
      try {
        let res = await api("PATCH", `/admin/submissions/${sub.id}`, { status: "approved", reviewNote: "DB test" }, token);
        assert.strictEqual(res.status, 200);
        const approved = await res.json();
        assert.deepStrictEqual(approved.before, { calories: original.calories });
        assert.strictEqual(approved.reviewedBy.username, "siteadmin");
        const edited = await items.findOne({ _id: original._id });
        assert.deepStrictEqual(edited, { ...original, ...sub.payload, isEstimate: true, source: "community", lastVerified: null });

        res = await api("PATCH", `/admin/submissions/${sub.id}`, { status: "reverted" }, token);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await items.findOne({ _id: original._id }), original);
        res = await api("PATCH", `/admin/submissions/${sub.id}`, { status: "approved" }, token);
        assert.strictEqual(res.status, 409);
      } finally {
        await items.replaceOne({ _id: original._id }, original);
        await submissions.replaceOne({ _id: id }, storedSub);
      }
    });
  });
});
