const { test, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const Chain = require("../../src/models/Chain");
const MenuItem = require("../../src/models/MenuItem");
const Submission = require("../../src/models/Submission");
const User = require("../../src/models/User");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
const ITEM_ID = "64b0000000000000000000c1";
const CHAIN_ID = "64b000000000000000000001";
const NEW_ID = "64b0000000000000000000f2";
const SUB_ID = "64b0000000000000000000e1";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
const auth = `Bearer ${signJwt(USER_ID)}`;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/submissions`;
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

async function post(body, status) {
  const res = await call("POST", "", body);
  const json = await res.json();
  assert.strictEqual(res.status, status, JSON.stringify(json));
  return json;
}

const created = new Date("2026-11-03T12:00:00Z");
// 4*25 + 4*46 + 9*34 = 590, so the macros agree with the calories.
const estimate = {
  _id: ITEM_ID, chainId: CHAIN_ID, chainName: "McDonald's", name: "Big Mac", searchName: "big mac", category: "entree",
  calories: 590, proteinG: 25, carbsG: 46, fatG: 34, isEstimate: true, source: "draft", lastVerified: null,
};
const veggie = { name: "6-inch Veggie Delite", category: "entree", calories: 310, proteinG: 16, carbsG: 40, fatG: 10 };

// A month-old account with no rejections and no recent submissions, unless a test changes them.
let counts;
let store;
beforeEach(() => {
  counts = { recent: 0, rejected: 0 };
  mock.method(User, "findById", () => ({ lean: async () => ({ _id: USER_ID, createdAt: new Date("2026-10-01T00:00:00Z") }) }));
  mock.method(Submission, "countDocuments", async (f) => {
    if (f.status === "rejected") return counts.rejected;
    assert.strictEqual(f.userId, USER_ID);
    assert.ok(f.createdAt.$gt > new Date(Date.now() - 24 * 3600e3 - 60e3)); // a rolling 24 h window
    return counts.recent;
  });
  store = { created: [] };
  mock.method(Submission, "create", async (doc) => {
    store.created.push(doc);
    return { _id: SUB_ID, before: null, resultId: null, reviewedBy: null, reviewNote: null, ...doc, createdAt: created, updatedAt: created };
  });
  mock.method(Chain, "findById", () => ({ lean: async () => ({ _id: CHAIN_ID, name: "Subway" }) }));
  mock.method(Chain, "exists", async () => null);
  mock.method(MenuItem, "exists", async () => null);
});

// An in-memory menu item for findById and updateOne.
function storeItem(item) {
  const s = { doc: structuredClone(item) };
  mock.method(MenuItem, "findById", () => ({ lean: async () => s.doc && structuredClone(s.doc) }));
  s.updateOne = mock.method(MenuItem, "updateOne", async (filter, update) => {
    Object.assign(s.doc, update.$set);
    return { matchedCount: 1 };
  });
  return s;
}

test("both routes need a token", async () => {
  assert.strictEqual((await call("POST", "", { kind: "new_chain", targetId: null, payload: {} }, null)).status, 401);
  assert.strictEqual((await call("GET", "/mine", undefined, null)).status, 401);
});

test("a clean edit on an estimate item is auto_applied: the item changes and before is recorded", async () => {
  const item = storeItem(estimate);
  const body = await post({ kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 } }, 201);
  assert.deepStrictEqual(item.doc, { ...estimate, calories: 600, source: "community" });
  assert.deepStrictEqual(store.created[0].before, { calories: 590, isEstimate: true, source: "draft", lastVerified: null });
  assert.deepStrictEqual(body, {
    id: SUB_ID, kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 }, before: { calories: 590 }, resultId: null,
    status: "auto_applied", reviewNote: null, createdAt: created.toISOString(), updatedAt: created.toISOString(),
  });
});

test("an edit to a verified item is pending and doesn't change it", async () => {
  const item = storeItem({ ...estimate, isEstimate: false, source: "official", lastVerified: created });
  const body = await post({ kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 } }, 201);
  assert.deepStrictEqual([body.status, body.before, store.created[0].flags], ["pending", null, ["verified_item"]]);
  assert.ok(!("flags" in body)); // moderation reasons stay with the admins
  assert.strictEqual(item.updateOne.mock.callCount(), 0);
  assert.strictEqual(item.doc.calories, 590);
});

test("a flagged user's clean-looking edit is pending too", async () => {
  storeItem(estimate);
  counts.rejected = 2;
  const body = await post({ kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 } }, 201);
  assert.deepStrictEqual([body.status, store.created[0].flags], ["pending", ["untrusted_user"]]);
  assert.ok(!("flags" in body)); // the submitter isn't told they're untrusted
});

test("the 11th submission in 24 hours is 429 and nothing is written", async () => {
  const item = storeItem(estimate);
  counts.recent = 10;
  assert.deepStrictEqual(await post({ kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 } }, 429), { error: "Too many submissions today" });
  assert.strictEqual(item.updateOne.mock.callCount(), 0);
  assert.strictEqual(store.created.length, 0);
});

test("a new item is auto_applied into the chain and resultId is recorded", async () => {
  const create = mock.method(MenuItem, "create", async (doc) => ({ _id: NEW_ID, ...doc }));
  const body = await post({ kind: "new_item", targetId: CHAIN_ID, payload: veggie }, 201);
  assert.deepStrictEqual(create.mock.calls[0].arguments[0], {
    chainId: CHAIN_ID, chainName: "Subway", ...veggie, searchName: "6 inch veggie delite", isEstimate: true, source: "community", lastVerified: null,
  });
  assert.deepStrictEqual([body.status, body.resultId], ["auto_applied", NEW_ID]);
});

test("a duplicate new item is 409 and nothing is written", async () => {
  let filter;
  mock.method(MenuItem, "exists", async (f) => ((filter = f), { _id: ITEM_ID }));
  const create = mock.method(MenuItem, "create", async () => assert.fail("inserted a duplicate"));
  assert.deepStrictEqual(await post({ kind: "new_item", targetId: CHAIN_ID, payload: { ...veggie, name: "6-Inch VEGGIE delite!" } }, 409), {
    error: "Item already exists",
  });
  assert.deepStrictEqual(filter, { chainId: CHAIN_ID, searchName: "6 inch veggie delite" });
  assert.strictEqual(create.mock.callCount(), 0);
  assert.strictEqual(store.created.length, 0);
});

test("a rename onto another item in the chain is 409 at submit time", async () => {
  storeItem(estimate);
  let filter;
  mock.method(MenuItem, "exists", async (f) => ((filter = f), { _id: NEW_ID }));
  assert.deepStrictEqual(await post({ kind: "edit_item", targetId: ITEM_ID, payload: { name: "Quarter Pounder" } }, 409), { error: "Item already exists" });
  assert.deepStrictEqual(filter, { chainId: CHAIN_ID, searchName: "quarter pounder", _id: { $ne: ITEM_ID } });
});

test("a unique-index clash while applying is 409, not 500, and no submission is stored", async () => {
  mock.method(MenuItem, "create", async () => {
    throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  });
  assert.deepStrictEqual(await post({ kind: "new_item", targetId: CHAIN_ID, payload: veggie }, 409), { error: "Item already exists" });
  assert.strictEqual(store.created.length, 0);
});

test("a new chain is always pending and isn't created", async () => {
  const create = mock.method(Chain, "create", async () => assert.fail("created a chain"));
  const payload = { name: "Raising Cane's", nutritionSourceUrl: "https://www.raisingcanes.com/nutrition" };
  const body = await post({ kind: "new_chain", targetId: null, payload }, 201);
  assert.deepStrictEqual([body.status, store.created[0].flags, body.targetId, body.resultId], ["pending", ["new_chain"], null, null]);
  assert.strictEqual(create.mock.callCount(), 0);
});

test("a new chain whose name is a chain's name or alternate name is 409", async () => {
  let filter;
  mock.method(Chain, "exists", async (f) => ((filter = f), { _id: CHAIN_ID }));
  const payload = { name: "Chick-fil-A", nutritionSourceUrl: "https://www.chick-fil-a.com/nutrition" };
  assert.deepStrictEqual(await post({ kind: "new_chain", payload }, 409), { error: "Restaurant already exists" });
  assert.deepStrictEqual(filter, { $or: [{ nameKey: { $in: ["chick fil a"] } }, { alternateNames: { $in: ["chick fil a"] } }] });
});

test("a new chain whose alternate name is already a chain's name is 409, so Nearby never matches two chains", async () => {
  let filter;
  mock.method(Chain, "exists", async (f) => ((filter = f), { _id: CHAIN_ID }));
  const payload = { name: "Panda Bowl House", nutritionSourceUrl: "https://example.com/nutrition", alternateNames: ["Subway", "Panda Bowl"] };
  assert.deepStrictEqual(await post({ kind: "new_chain", payload }, 409), { error: "Restaurant already exists" });
  const keys = ["panda bowl house", "subway", "panda bowl"];
  assert.deepStrictEqual(filter, { $or: [{ nameKey: { $in: keys } }, { alternateNames: { $in: keys } }] });
  assert.strictEqual(store.created.length, 0);
});

test("a missing target is 404", async () => {
  storeItem(null);
  assert.deepStrictEqual(await post({ kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 } }, 404), { error: "Menu item not found" });
  mock.method(Chain, "findById", () => ({ lean: async () => null }));
  assert.deepStrictEqual(await post({ kind: "new_item", targetId: CHAIN_ID, payload: veggie }, 404), { error: "Restaurant not found" });
});

for (const [label, body] of [
  ["an unknown kind", { kind: "delete_item", targetId: ITEM_ID, payload: { calories: 1 } }],
  ["a malformed targetId", { kind: "edit_item", targetId: "abc", payload: { calories: 1 } }],
  ["a targetId on a new chain", { kind: "new_chain", targetId: CHAIN_ID, payload: { name: "X", nutritionSourceUrl: "https://x" } }],
  ["an unknown body field", { kind: "edit_item", targetId: ITEM_ID, payload: { calories: 1 }, userId: USER_ID }],
  ["an operator in the payload", { kind: "edit_item", targetId: ITEM_ID, payload: { calories: { $gt: 0 } } }],
]) {
  test(`POST rejects ${label} with 400`, async () => {
    const item = storeItem(estimate);
    await post(body, 400);
    assert.strictEqual(item.updateOne.mock.callCount(), 0);
    assert.strictEqual(store.created.length, 0);
  });
}

test("GET /mine lists only the caller's submissions, newest first, without flags", async () => {
  const seen = {};
  const query = {
    sort: (s) => ((seen.sort = s), query),
    skip: (n) => ((seen.skip = n), query),
    limit: (n) => ((seen.limit = n), query),
    lean: async () => [{
      _id: SUB_ID, userId: USER_ID, kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 }, before: null, resultId: null,
      status: "rejected", flags: ["untrusted_user"], reviewedBy: NEW_ID, reviewNote: "No source", createdAt: created, updatedAt: created,
    }],
  };
  mock.method(Submission, "find", (f) => ((seen.filter = f), query));
  mock.method(Submission, "countDocuments", async (f) => ((seen.countFilter = f), 7));
  const res = await call("GET", "/mine?limit=5&skip=5");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    submissions: [{
      id: SUB_ID, kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 }, before: null, resultId: null,
      status: "rejected", reviewNote: "No source", createdAt: created.toISOString(), updatedAt: created.toISOString(),
    }],
    total: 7,
  });
  assert.deepStrictEqual(seen, { filter: { userId: USER_ID }, countFilter: { userId: USER_ID }, sort: { createdAt: -1, _id: -1 }, skip: 5, limit: 5 });
  assert.strictEqual((await call("GET", "/mine?limit=51")).status, 400);
});
