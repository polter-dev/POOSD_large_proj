const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const MealLog = require("../../src/models/MealLog");
const MenuItem = require("../../src/models/MenuItem");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
const LOG_ID = "64b0000000000000000000c1";
const NUGGETS = "64b0000000000000000000d1";
const BOWL = "64b0000000000000000000d2";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/meal-logs`;
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

const created = new Date("2026-11-03T12:00:00Z");

// Real rows from db/menu-data/chains.js, as MenuItem.find returns them with the controller's projection.
const MENU = {
  [NUGGETS]: { _id: NUGGETS, name: "Grilled Nuggets (8 ct)", chainName: "Chick-fil-A", calories: 130, proteinG: 25, carbsG: 1, fatG: 3 },
  [BOWL]: { _id: BOWL, name: "Chicken Burrito Bowl", chainName: "Chipotle", calories: 655, proteinG: 51, carbsG: 61, fatG: null },
};

// A stored log, as MealLog.find(...).lean() returns it.
let n = 0;
function stored(fields) {
  return {
    _id: `64b0000000000000000000${String(++n).padStart(2, "0")}`,
    userId: USER_ID, status: "eaten", menuItemId: null, chainName: null, servings: 1, source: "custom", createdAt: created,
    ...fields,
  };
}

// MenuItem.find answers with the MENU rows asked for; insertMany saves like Mongoose (an _id and createdAt each).
// Returns what was asked and written.
function stubAdd() {
  const seen = { lookups: [], written: [] };
  mock.method(MenuItem, "find", (filter, projection) => {
    seen.lookups.push({ filter, projection });
    return { lean: async () => filter._id.$in.map((id) => MENU[id]).filter(Boolean) };
  });
  mock.method(MealLog, "insertMany", async (docs) => {
    seen.written.push(...docs);
    return docs.map((d, i) => ({ _id: `64b0000000000000000000e${i}`, ...d, createdAt: created }));
  });
  return seen;
}

// A custom food entry with every required field.
const CUSTOM = { date: "2026-11-03", source: "custom", name: "Homemade smoothie", calories: 250, proteinG: 8, carbsG: 45, fatG: null };
const RANGE_ERROR = "from and to must be dates (YYYY-MM-DD), at most 31 days apart";

test("every meal-logs route needs a token", async () => {
  for (const [method, path] of [["GET", "?from=2026-11-03&to=2026-11-03"], ["POST", ""], ["PATCH", `/${LOG_ID}`], ["DELETE", `/${LOG_ID}`]]) {
    const res = await call(method, path, undefined, null);
    assert.strictEqual(res.status, 401, method);
    assert.deepStrictEqual(await res.json(), { error: "Not logged in" });
  }
});

// ---------------------------------------------------------------------------
// GET /meal-logs?from=&to=
// ---------------------------------------------------------------------------
test("GET returns the caller's entries in the range and one totals row per day, empty days included", async () => {
  const rows = [
    stored({ date: "2026-11-02", name: "Homemade smoothie", calories: 250, proteinG: 8, carbsG: 45, fatG: null }),
    stored({ date: "2026-11-04", menuItemId: NUGGETS, ...MENU[NUGGETS], _id: LOG_ID, servings: 1.5, source: "photo" }),
    stored({ date: "2026-11-04", status: "planned", name: "6-inch Grilled Chicken", chainName: "Subway", calories: 300, proteinG: 26, carbsG: 40, fatG: 5, source: "plan" }),
  ];
  let filter;
  let sort;
  mock.method(MealLog, "find", (f) => {
    filter = f;
    return { sort: (s) => ((sort = s), { lean: async () => rows }) };
  });

  const res = await call("GET", "?from=2026-11-02&to=2026-11-04");
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(filter, { userId: USER_ID, date: { $gte: "2026-11-02", $lte: "2026-11-04" } });
  assert.deepStrictEqual(sort, { date: 1, createdAt: 1, _id: 1 });
  assert.deepStrictEqual(body.entries[1], {
    id: LOG_ID, date: "2026-11-04", status: "eaten", menuItemId: NUGGETS, name: "Grilled Nuggets (8 ct)", chainName: "Chick-fil-A",
    servings: 1.5, calories: 130, proteinG: 25, carbsG: 1, fatG: 3, source: "photo", createdAt: "2026-11-03T12:00:00.000Z",
  });
  assert.strictEqual(body.entries[0].menuItemId, null);
  assert.ok(body.entries.every((e) => !("userId" in e)));

  const zero = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false };
  assert.deepStrictEqual(body.days, [
    { date: "2026-11-02", eaten: { calories: 250, proteinG: 8, carbsG: 45, fatG: 0, incomplete: true }, planned: zero },
    { date: "2026-11-03", eaten: zero, planned: zero },
    {
      date: "2026-11-04",
      eaten: { calories: 195, proteinG: 37.5, carbsG: 1.5, fatG: 4.5, incomplete: false }, // 1.5 servings
      planned: { calories: 300, proteinG: 26, carbsG: 40, fatG: 5, incomplete: false },
    },
  ]);
});

test("GET takes a single day and up to 31 days counting both ends, across a month end", async () => {
  mock.method(MealLog, "find", () => ({ sort: () => ({ lean: async () => [] }) }));
  let body = await (await call("GET", "?from=2026-11-03&to=2026-11-03")).json();
  assert.deepStrictEqual(body.days.map((d) => d.date), ["2026-11-03"]);
  assert.deepStrictEqual(body.entries, []);

  body = await (await call("GET", "?from=2026-02-15&to=2026-03-17")).json();
  assert.strictEqual(body.days.length, 31);
  assert.deepStrictEqual([body.days[13].date, body.days[14].date, body.days[30].date], ["2026-02-28", "2026-03-01", "2026-03-17"]);
});

for (const [label, query] of [
  ["no query", ""],
  ["a missing to", "?from=2026-11-03"],
  ["a missing from", "?to=2026-11-03"],
  ["from after to", "?from=2026-11-04&to=2026-11-03"],
  ["32 days", "?from=2026-10-01&to=2026-11-01"],
  ["a date that doesn't exist", "?from=2026-02-28&to=2026-02-30"],
  ["a date that isn't YYYY-MM-DD", "?from=2026-11-3&to=2026-11-04"],
  ["from given twice", "?from=2026-11-01&from=2026-11-02&to=2026-11-03"],
]) {
  test(`GET rejects ${label}`, async () => {
    const find = mock.method(MealLog, "find", () => ({ sort: () => ({ lean: async () => [] }) }));
    const res = await call("GET", query);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: RANGE_ERROR });
    assert.strictEqual(find.mock.callCount(), 0);
  });
}

// ---------------------------------------------------------------------------
// POST /meal-logs
// ---------------------------------------------------------------------------
test("POST with menuItemId copies the item's name, chain and macros, with status eaten and 1 serving by default", async () => {
  const seen = stubAdd();
  const res = await call("POST", "", { entries: [{ date: "2026-11-03", source: "search", menuItemId: NUGGETS }] });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), {
    entries: [{
      id: "64b0000000000000000000e0", date: "2026-11-03", status: "eaten", menuItemId: NUGGETS, name: "Grilled Nuggets (8 ct)",
      chainName: "Chick-fil-A", servings: 1, calories: 130, proteinG: 25, carbsG: 1, fatG: 3, source: "search",
      createdAt: "2026-11-03T12:00:00.000Z",
    }],
  });
  assert.deepStrictEqual(seen.lookups[0].filter, { _id: { $in: [NUGGETS] } });
  assert.deepStrictEqual(seen.written, [{
    userId: USER_ID, date: "2026-11-03", status: "eaten", servings: 1, source: "search", menuItemId: NUGGETS,
    name: "Grilled Nuggets (8 ct)", chainName: "Chick-fil-A", calories: 130, proteinG: 25, carbsG: 1, fatG: 3,
  }]);
});

test("POST stores custom food as sent, trimmed, with no chain when chainName is omitted, null or blank", async () => {
  const seen = stubAdd();
  const res = await call("POST", "", {
    entries: [
      { ...CUSTOM, name: "  Homemade smoothie  ", status: "planned", servings: 1.5 },
      { ...CUSTOM, chainName: null, menuItemId: null, source: "photo" }, // an unmatched PhotoItem
      { ...CUSTOM, chainName: "  ", proteinG: 0 },
      { ...CUSTOM, chainName: " Joe's Deli ", fatG: 12.5 },
    ],
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(seen.lookups.length, 0); // no menu items to look up
  assert.deepStrictEqual(seen.written[0], {
    userId: USER_ID, date: "2026-11-03", status: "planned", servings: 1.5, source: "custom", menuItemId: null,
    name: "Homemade smoothie", chainName: null, calories: 250, proteinG: 8, carbsG: 45, fatG: null,
  });
  assert.deepStrictEqual(seen.written.map((d) => [d.source, d.chainName, d.proteinG, d.fatG]), [
    ["custom", null, 8, null], ["photo", null, 8, null], ["custom", null, 0, null], ["custom", "Joe's Deli", 8, 12.5],
  ]);
});

test("POST saves a mixed batch in the order sent and looks each menu item up once", async () => {
  const seen = stubAdd();
  const entries = [
    { date: "2026-11-03", source: "plan", status: "planned", menuItemId: BOWL },
    CUSTOM,
    { date: "2026-11-04", source: "plan", status: "planned", menuItemId: BOWL, servings: 2 },
    { date: "2026-11-04", source: "search", menuItemId: NUGGETS },
  ];
  const res = await call("POST", "", { entries });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.deepStrictEqual(body.entries.map((e) => [e.name, e.servings, e.fatG]), [
    ["Chicken Burrito Bowl", 1, null], ["Homemade smoothie", 1, null], ["Chicken Burrito Bowl", 2, null], ["Grilled Nuggets (8 ct)", 1, 3],
  ]);
  assert.strictEqual(seen.lookups.length, 1);
  assert.deepStrictEqual(seen.lookups[0].filter, { _id: { $in: [BOWL, NUGGETS] } });
  assert.deepStrictEqual(seen.lookups[0].projection, { name: 1, chainName: 1, calories: 1, proteinG: 1, carbsG: 1, fatG: 1 });
});

// Even the item's own values are refused: the server never takes name, chain or macros from the client for a menu item.
for (const field of ["name", "chainName", "calories", "proteinG", "carbsG", "fatG"]) {
  test(`POST with menuItemId refuses a client ${field} instead of trusting it (400, nothing written)`, async () => {
    const seen = stubAdd();
    const res = await call("POST", "", { entries: [{ date: "2026-11-03", source: "search", menuItemId: NUGGETS, [field]: MENU[NUGGETS][field] }] });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: `entries[0]: ${field} comes from the menu item, so leave it out` });
    assert.deepStrictEqual([seen.lookups.length, seen.written.length], [0, 0]);
  });
}

test("POST answers 404 for the first entry whose menu item doesn't exist, and writes nothing", async () => {
  const seen = stubAdd();
  const missing = "64b0000000000000000000d9";
  const res = await call("POST", "", {
    entries: [
      { date: "2026-11-03", source: "search", menuItemId: NUGGETS },
      CUSTOM,
      { date: "2026-11-03", source: "search", menuItemId: missing },
      { date: "2026-11-03", source: "search", menuItemId: "64b0000000000000000000d8" },
    ],
  });
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "entries[2]: menu item not found" });
  assert.strictEqual(seen.written.length, 0);
});

test("POST with one bad entry in a batch writes nothing and names that entry", async () => {
  const seen = stubAdd();
  const res = await call("POST", "", {
    entries: [CUSTOM, { date: "2026-11-03", source: "search", menuItemId: NUGGETS }, { ...CUSTOM, servings: 0 }, { ...CUSTOM, date: "bad" }],
  });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "entries[2]: servings must be a number from 0.25 to 10" });
  assert.deepStrictEqual([seen.lookups.length, seen.written.length], [0, 0]);
});

const LIST_ERROR = "entries must be a list of 1 to 50";
for (const [label, body, error] of [
  ["a body without entries", {}, LIST_ERROR],
  ["an empty list", { entries: [] }, LIST_ERROR],
  ["51 entries", { entries: Array(51).fill(CUSTOM) }, LIST_ERROR],
  ["one entry not in a list", { entries: CUSTOM }, LIST_ERROR],
  ["a field next to entries", { entries: [CUSTOM], date: "2026-11-03" }, "Unknown field: date"],
  ["an entry that isn't an object", { entries: ["smoothie"] }, "entries[0]: entry must be an object"],
  ["an entry with a field the schema doesn't allow", { entries: [{ ...CUSTOM, notes: "tasty" }] }, "entries[0]: Unknown field: notes"],
  ["a userId in the entry", { entries: [{ ...CUSTOM, userId: "64b0000000000000000000bb" }] }, "entries[0]: Unknown field: userId"],
  ["a missing date", { entries: [{ ...CUSTOM, date: undefined }] }, "entries[0]: date must be a date (YYYY-MM-DD)"],
  ["a date that doesn't exist", { entries: [{ ...CUSTOM, date: "2026-02-30" }] }, "entries[0]: date must be a date (YYYY-MM-DD)"],
  ["a date with a time", { entries: [{ ...CUSTOM, date: "2026-11-03T12:00:00Z" }] }, "entries[0]: date must be a date (YYYY-MM-DD)"],
  ["an unknown status", { entries: [{ ...CUSTOM, status: "skipped" }] }, "entries[0]: status must be planned or eaten"],
  ["servings under 0.25", { entries: [{ ...CUSTOM, servings: 0.2 }] }, "entries[0]: servings must be a number from 0.25 to 10"],
  ["servings over 10", { entries: [{ ...CUSTOM, servings: 10.5 }] }, "entries[0]: servings must be a number from 0.25 to 10"],
  ["servings as a string", { entries: [{ ...CUSTOM, servings: "2" }] }, "entries[0]: servings must be a number from 0.25 to 10"],
  ["a missing source", { entries: [{ ...CUSTOM, source: undefined }] }, "entries[0]: source must be search, plan, photo or custom"],
  ["an unknown source", { entries: [{ ...CUSTOM, source: "manual" }] }, "entries[0]: source must be search, plan, photo or custom"],
  ["a malformed menuItemId", { entries: [{ date: "2026-11-03", source: "search", menuItemId: "abc" }] }, "entries[0]: menuItemId must be a menu item id"],
  ["a menuItemId that is an object", { entries: [{ date: "2026-11-03", source: "search", menuItemId: { $ne: null } }] }, "entries[0]: menuItemId must be a menu item id"],
  ["custom food without a name", { entries: [{ ...CUSTOM, name: undefined }] }, "entries[0]: name must be 1 to 150 characters"],
  ["a blank name", { entries: [{ ...CUSTOM, name: "   " }] }, "entries[0]: name must be 1 to 150 characters"],
  ["a name over 150 characters", { entries: [{ ...CUSTOM, name: "x".repeat(151) }] }, "entries[0]: name must be 1 to 150 characters"],
  ["a chainName over 100 characters", { entries: [{ ...CUSTOM, chainName: "x".repeat(101) }] }, "entries[0]: chainName must be 1 to 100 characters, or null"],
  ["a chainName that isn't text", { entries: [{ ...CUSTOM, chainName: 7 }] }, "entries[0]: chainName must be 1 to 100 characters, or null"],
  ["custom food without calories", { entries: [{ ...CUSTOM, calories: undefined }] }, "entries[0]: calories must be a number from 0 to 5000"],
  ["calories over 5000", { entries: [{ ...CUSTOM, calories: 5001 }] }, "entries[0]: calories must be a number from 0 to 5000"],
  ["negative calories", { entries: [{ ...CUSTOM, calories: -1 }] }, "entries[0]: calories must be a number from 0 to 5000"],
  ["calories null", { entries: [{ ...CUSTOM, calories: null }] }, "entries[0]: calories must be a number from 0 to 5000"],
  ["a missing macro (unknown is null, not left out)", { entries: [{ ...CUSTOM, carbsG: undefined }] }, "entries[0]: carbsG must be a number, 0 or more, or null if unknown"],
  ["a negative macro", { entries: [{ ...CUSTOM, proteinG: -2 }] }, "entries[0]: proteinG must be a number, 0 or more, or null if unknown"],
  ["a macro as a string", { entries: [{ ...CUSTOM, fatG: "3" }] }, "entries[0]: fatG must be a number, 0 or more, or null if unknown"],
]) {
  test(`POST rejects ${label}`, async () => {
    const seen = stubAdd();
    const res = await call("POST", "", body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.deepStrictEqual([seen.lookups.length, seen.written.length], [0, 0]);
  });
}

// ---------------------------------------------------------------------------
// PATCH /meal-logs/:id
// ---------------------------------------------------------------------------
function stubUpdate(result) {
  const calls = [];
  mock.method(MealLog, "findOneAndUpdate", (...args) => {
    calls.push(args);
    return { lean: async () => result };
  });
  return calls;
}

test("PATCH marks the caller's planned entry eaten and changes servings, answering the MealLog", async () => {
  const log = stored({ date: "2026-11-03", menuItemId: BOWL, ...MENU[BOWL], _id: LOG_ID, status: "eaten", servings: 0.5, source: "plan" });
  const calls = stubUpdate(log);
  const res = await call("PATCH", `/${LOG_ID}`, { status: "eaten", servings: 0.5 });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual([body.id, body.status, body.servings, body.menuItemId], [LOG_ID, "eaten", 0.5, BOWL]);
  const [filter, update, options] = calls[0];
  assert.deepStrictEqual(filter, { _id: LOG_ID, userId: USER_ID });
  assert.deepStrictEqual(update, { $set: { status: "eaten", servings: 0.5 } });
  assert.deepStrictEqual(options, { returnDocument: "after" });
});

test("PATCH sets only the field sent", async () => {
  const calls = stubUpdate(stored({ _id: LOG_ID, date: "2026-11-03", name: "x", calories: 1, proteinG: 1, carbsG: 1, fatG: 1, status: "planned" }));
  assert.strictEqual((await call("PATCH", `/${LOG_ID}`, { status: "planned" })).status, 200);
  assert.deepStrictEqual(calls[0][1], { $set: { status: "planned" } });
});

test("PATCH answers 404 for a missing or someone else's entry, and for a malformed id", async () => {
  const calls = stubUpdate(null);
  let res = await call("PATCH", `/${LOG_ID}`, { status: "eaten" });
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "Meal log not found" });

  res = await call("PATCH", "/not-an-id", { status: "eaten" });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(calls.length, 1); // the malformed id never reached Mongo
});

for (const [label, body, error] of [
  ["an empty body", {}, "Nothing to update"],
  ["an unknown status", { status: "done" }, "status must be planned or eaten"],
  ["servings of 0", { servings: 0 }, "servings must be a number from 0.25 to 10"],
  ["servings null", { servings: null }, "servings must be a number from 0.25 to 10"],
  ["a macro (a log is a snapshot)", { calories: 500 }, "Unknown field: calories"],
  ["a new date", { date: "2026-11-04" }, "Unknown field: date"],
]) {
  test(`PATCH rejects ${label}`, async () => {
    const calls = stubUpdate(stored({}));
    const res = await call("PATCH", `/${LOG_ID}`, body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(calls.length, 0);
  });
}

// ---------------------------------------------------------------------------
// DELETE /meal-logs/:id
// ---------------------------------------------------------------------------
test("DELETE removes the caller's entry and answers 204 with no body", async () => {
  let filter;
  mock.method(MealLog, "deleteOne", async (f) => {
    filter = f;
    return { deletedCount: 1 };
  });
  const res = await call("DELETE", `/${LOG_ID}`);
  assert.strictEqual(res.status, 204);
  assert.strictEqual(await res.text(), "");
  assert.deepStrictEqual(filter, { _id: LOG_ID, userId: USER_ID });
});

test("DELETE answers 404 for a missing or someone else's entry, and for a malformed id", async () => {
  const deleteOne = mock.method(MealLog, "deleteOne", async () => ({ deletedCount: 0 }));
  let res = await call("DELETE", `/${LOG_ID}`);
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "Meal log not found" });

  res = await call("DELETE", "/64B0000000000000000000C1"); // ids are lowercase hex
  assert.strictEqual(res.status, 404);
  assert.strictEqual(deleteOne.mock.callCount(), 1);
});
