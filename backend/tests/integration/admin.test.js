const { test, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const Chain = require("../../src/models/Chain");
const MenuItem = require("../../src/models/MenuItem");
const Submission = require("../../src/models/Submission");
const User = require("../../src/models/User");
const moderation = require("../../src/services/moderation");
const { signJwt } = require("../../src/services/tokens");

const ADMIN_ID = "64b0000000000000000000ad";
const USER_ID = "64b0000000000000000000aa";
const AUTHOR_ID = "64b0000000000000000000ab";
const SUB_ID = "64b0000000000000000000e1";
const ITEM_ID = "64b0000000000000000000c1";
const CHAIN_ID = "64b000000000000000000001";
const NEW_ID = "64b0000000000000000000f2";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
const auth = (id) => `Bearer ${signJwt(id)}`;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/admin/submissions`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

// requireAdmin reads the role from the database; usernames for user/reviewedBy come from User.find.
const USERS = { [ADMIN_ID]: { role: "admin", username: "siteadmin" }, [USER_ID]: { username: "janedoe" }, [AUTHOR_ID]: { username: "kevinn" } };
beforeEach(() => {
  mock.method(User, "findById", (id) => ({ lean: async () => USERS[id] && { _id: id, role: USERS[id].role } }));
  mock.method(User, "find", (filter) => ({
    lean: async () => filter._id.$in.filter((id) => USERS[id]).map((id) => ({ _id: id, username: USERS[id].username })),
  }));
});

function call(method, path = "", body, authorization = auth(ADMIN_ID)) {
  return fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const created = new Date("2026-10-27T12:00:00Z");
const bigMac = {
  _id: ITEM_ID, chainId: CHAIN_ID, chainName: "McDonald's", name: "Big Mac", searchName: "big mac", category: "entree",
  calories: 590, proteinG: 25, carbsG: 46, fatG: 34, isEstimate: false, source: "official", lastVerified: new Date("2026-09-01T00:00:00Z"),
};

function submission(extra) {
  return {
    _id: SUB_ID, userId: AUTHOR_ID, kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 }, before: null, resultId: null,
    status: "pending", flags: ["verified_item"], reviewedBy: null, reviewNote: null, createdAt: created, updatedAt: created, ...extra,
  };
}

// An in-memory submission: findById reads it, findByIdAndUpdate applies the $set like Mongo would.
function storeSubmission(s) {
  const store = { doc: structuredClone(s), updates: [] };
  mock.method(Submission, "findById", () => ({ lean: async () => structuredClone(store.doc) }));
  mock.method(Submission, "findByIdAndUpdate", (id, update) => {
    store.updates.push(update.$set);
    Object.assign(store.doc, update.$set, { updatedAt: new Date("2026-10-28T09:00:00Z") });
    return { lean: async () => structuredClone(store.doc) };
  });
  return store;
}

// An in-memory menu item for findById, updateOne (filter fields must all match) and exists.
function storeItem(item) {
  const store = { doc: structuredClone(item) };
  const matches = (filter) => store.doc && Object.entries(filter).every(([k, v]) => String(store.doc[k]) === String(v));
  mock.method(MenuItem, "findById", () => ({ lean: async () => store.doc && structuredClone(store.doc) }));
  mock.method(MenuItem, "exists", async (filter) => (matches(filter) ? { _id: store.doc._id } : null));
  mock.method(MenuItem, "updateOne", async (filter, update) => {
    if (!matches(filter)) return { matchedCount: 0 };
    Object.assign(store.doc, update.$set);
    return { matchedCount: 1 };
  });
  return store;
}

async function patch(body, status) {
  const res = await call("PATCH", `/${SUB_ID}`, body);
  const json = await res.json();
  assert.strictEqual(res.status, status, JSON.stringify(json));
  return json;
}

// ---------------------------------------------------------------------------
// access
// ---------------------------------------------------------------------------
test("both admin routes need a token, an existing account and role admin", async () => {
  for (const [method, path, body] of [["GET", ""], ["PATCH", `/${SUB_ID}`, { status: "approved" }]]) {
    let res = await call(method, path, body, null);
    assert.strictEqual(res.status, 401, method);

    res = await call(method, path, body, auth(USER_ID));
    assert.strictEqual(res.status, 403, method);
    assert.deepStrictEqual(await res.json(), { error: "Admin only" });

    res = await call(method, path, body, auth("64b0000000000000000000dd")); // account deleted
    assert.strictEqual(res.status, 404, method);
    assert.deepStrictEqual(await res.json(), { error: "User not found" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/submissions
// ---------------------------------------------------------------------------
function stubList(subs, total = subs.length) {
  const seen = {};
  const query = {
    sort: (s) => ((seen.sort = s), query),
    skip: (n) => ((seen.skip = n), query),
    limit: (n) => ((seen.limit = n), query),
    lean: async () => subs,
  };
  mock.method(Submission, "find", (filter) => ((seen.filter = filter), query));
  mock.method(Submission, "countDocuments", async (filter) => ((seen.countFilter = filter), total));
  return seen;
}

test("GET lists the pending queue oldest first, with usernames, total and the public part of before", async () => {
  const s = submission({
    before: { calories: 590, searchName: "big mac", isEstimate: false, source: "official", lastVerified: null },
    reviewedBy: ADMIN_ID,
  });
  const seen = stubList([s], 3);
  const res = await call("GET");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    submissions: [{
      id: SUB_ID, kind: "edit_item", targetId: ITEM_ID, payload: { calories: 600 }, before: { calories: 590 }, resultId: null,
      status: "pending", flags: ["verified_item"], reviewNote: null, createdAt: created.toISOString(), updatedAt: created.toISOString(),
      user: { id: AUTHOR_ID, username: "kevinn" }, reviewedBy: { id: ADMIN_ID, username: "siteadmin" },
    }],
    total: 3,
  });
  assert.deepStrictEqual(seen, { filter: { status: "pending" }, countFilter: { status: "pending" }, sort: { createdAt: 1, _id: 1 }, skip: 0, limit: 20 });
});

test("GET for another status is newest first and pages with limit and skip; a deleted author has a null username", async () => {
  const seen = stubList([submission({ status: "approved", userId: "64b0000000000000000000dd" })]);
  const body = await (await call("GET", "?status=approved&limit=5&skip=10")).json();
  assert.deepStrictEqual(body.submissions[0].user, { id: "64b0000000000000000000dd", username: null });
  assert.strictEqual(body.submissions[0].reviewedBy, null);
  assert.deepStrictEqual([seen.filter, seen.sort, seen.limit, seen.skip], [{ status: "approved" }, { createdAt: -1, _id: -1 }, 5, 10]);
});

for (const query of ["?status=bogus", "?limit=0", "?limit=101", "?skip=-1", "?limit=abc"]) {
  test(`GET rejects ${query} with 400`, async () => {
    stubList([]);
    assert.strictEqual((await call("GET", query)).status, 400);
  });
}

// ---------------------------------------------------------------------------
// PATCH /admin/submissions/:id: status rules
// ---------------------------------------------------------------------------
const STATUSES = ["auto_applied", "pending", "approved", "rejected", "reverted"];
const ALLOWED = ["pending>approved", "pending>rejected", "auto_applied>reverted", "approved>reverted"];

test("PATCH allows exactly the contract's transitions; every other one is 409 and saves nothing", async () => {
  const apply = mock.method(moderation, "apply", async () => ({ before: { calories: 590 }, resultId: null }));
  const revert = mock.method(moderation, "revert", async () => {});
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const store = storeSubmission(submission({ status: from }));
      const res = await call("PATCH", `/${SUB_ID}`, { status: to });
      const body = await res.json();
      if (ALLOWED.includes(`${from}>${to}`)) {
        assert.strictEqual(res.status, 200, `${from} > ${to}`);
        assert.strictEqual(body.status, to);
        assert.deepStrictEqual(body.reviewedBy, { id: ADMIN_ID, username: "siteadmin" });
      } else {
        assert.strictEqual(res.status, 409, `${from} > ${to}`);
        assert.deepStrictEqual(body, { error: `Can't change a submission from ${from} to ${to}` });
        assert.strictEqual(store.updates.length, 0);
      }
    }
  }
  assert.strictEqual(apply.mock.callCount(), 1);
  assert.strictEqual(revert.mock.callCount(), 2);
});

test("PATCH sets reviewedBy and a trimmed note; a blank note is stored as null", async () => {
  let store = storeSubmission(submission());
  const body = await patch({ status: "rejected", reviewNote: "  Matches the official page already  " }, 200);
  assert.deepStrictEqual(store.updates, [{ status: "rejected", reviewedBy: ADMIN_ID, reviewNote: "Matches the official page already" }]);
  assert.deepStrictEqual(body.user, { id: AUTHOR_ID, username: "kevinn" });
  assert.strictEqual(body.reviewNote, "Matches the official page already");

  store = storeSubmission(submission());
  await patch({ status: "rejected", reviewNote: "   " }, 200);
  assert.strictEqual(store.updates[0].reviewNote, null);
});

test("PATCH answers 404 for a missing submission or a malformed id", async () => {
  const findById = mock.method(Submission, "findById", () => ({ lean: async () => null }));
  let res = await call("PATCH", `/${SUB_ID}`, { status: "approved" });
  assert.deepStrictEqual([res.status, await res.json()], [404, { error: "Submission not found" }]);
  res = await call("PATCH", "/not-an-id", { status: "approved" });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(findById.mock.callCount(), 1); // the malformed id never reached Mongo
});

for (const [label, body] of [
  ["a missing status", {}],
  ["an unknown status", { status: "deleted" }],
  ["a note over 300 characters", { status: "rejected", reviewNote: "x".repeat(301) }],
  ["a note that isn't text", { status: "rejected", reviewNote: 5 }],
  ["a field the contract doesn't list", { status: "rejected", reviewedBy: USER_ID }],
]) {
  test(`PATCH rejects ${label} with 400`, async () => {
    const store = storeSubmission(submission());
    assert.strictEqual((await call("PATCH", `/${SUB_ID}`, body)).status, 400);
    assert.strictEqual(store.updates.length, 0);
  });
}

// ---------------------------------------------------------------------------
// PATCH: what approving and reverting write (services/moderation.js)
// ---------------------------------------------------------------------------
test("approving an edit applies it as a community estimate, and reverting puts the item back exactly", async () => {
  const item = storeItem(bigMac);
  const sub = storeSubmission(submission({ payload: { name: "Big Mac Deluxe", calories: 600 } }));

  let body = await patch({ status: "approved" }, 200);
  assert.deepStrictEqual(item.doc, {
    ...bigMac, name: "Big Mac Deluxe", searchName: "big mac deluxe", calories: 600, isEstimate: true, source: "community", lastVerified: null,
  });
  assert.deepStrictEqual(sub.doc.before, {
    name: "Big Mac", calories: 590, searchName: "big mac", isEstimate: false, source: "official", lastVerified: bigMac.lastVerified,
  });
  assert.deepStrictEqual(body.before, { name: "Big Mac", calories: 590 }); // hidden fields stripped
  assert.deepStrictEqual(body.reviewedBy, { id: ADMIN_ID, username: "siteadmin" });

  body = await patch({ status: "reverted" }, 200);
  assert.deepStrictEqual(item.doc, bigMac);
  assert.strictEqual(body.status, "reverted");
});

test("reverting an edit after the item changed again is 409 and changes nothing", async () => {
  const item = storeItem({ ...bigMac, calories: 650, isEstimate: true });
  const sub = storeSubmission(submission({ status: "approved", before: { calories: 590, isEstimate: false } }));
  const body = await patch({ status: "reverted" }, 409);
  assert.deepStrictEqual(body, { error: "Item changed since this submission" });
  assert.strictEqual(item.doc.calories, 650);
  assert.strictEqual(sub.updates.length, 0);
});

test("approving or reverting an edit whose item was deleted is 404", async () => {
  storeItem(null);
  storeSubmission(submission());
  assert.deepStrictEqual(await patch({ status: "approved" }, 404), { error: "Menu item not found" });
  storeSubmission(submission({ status: "approved", before: { calories: 590 } }));
  assert.deepStrictEqual(await patch({ status: "reverted" }, 404), { error: "Menu item not found" });
});

test("approving a rename onto a name the chain already has is 409 and the submission stays pending", async () => {
  storeItem(bigMac);
  mock.method(MenuItem, "updateOne", async () => {
    throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  });
  const sub = storeSubmission(submission({ payload: { name: "Quarter Pounder" } }));
  assert.deepStrictEqual(await patch({ status: "approved" }, 409), { error: "Item already exists" });
  assert.strictEqual(sub.updates.length, 0);
});

const veggie = { name: "6-inch Veggie Delite", category: "entree", calories: 310, proteinG: 16, carbsG: 40, fatG: 10 };

test("approving a new item inserts it under the chain as a community estimate and records resultId", async () => {
  mock.method(Chain, "findById", () => ({ lean: async () => ({ _id: CHAIN_ID, name: "Subway" }) }));
  const create = mock.method(MenuItem, "create", async (doc) => ({ _id: NEW_ID, ...doc }));
  storeSubmission(submission({ kind: "new_item", targetId: CHAIN_ID, payload: veggie }));
  const body = await patch({ status: "approved" }, 200);
  assert.deepStrictEqual(create.mock.calls[0].arguments[0], {
    chainId: CHAIN_ID, chainName: "Subway", ...veggie, searchName: "6 inch veggie delite", isEstimate: true, source: "community", lastVerified: null,
  });
  assert.strictEqual(body.resultId, NEW_ID);
});

test("approving a new item for a deleted chain is 404", async () => {
  mock.method(Chain, "findById", () => ({ lean: async () => null }));
  storeSubmission(submission({ kind: "new_item", targetId: CHAIN_ID, payload: veggie }));
  assert.deepStrictEqual(await patch({ status: "approved" }, 404), { error: "Restaurant not found" });
});

test("reverting a new item deletes it only while it still holds the submitted values", async () => {
  const deleteOne = mock.method(MenuItem, "deleteOne", async () => ({ deletedCount: 1 }));
  storeSubmission(submission({ kind: "new_item", targetId: CHAIN_ID, payload: veggie, status: "auto_applied", resultId: NEW_ID }));
  await patch({ status: "reverted" }, 200);
  assert.deepStrictEqual(deleteOne.mock.calls[0].arguments[0], { _id: NEW_ID, ...veggie });

  deleteOne.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  mock.method(MenuItem, "exists", async () => ({ _id: NEW_ID })); // still there, so it was edited since
  const sub = storeSubmission(submission({ kind: "new_item", targetId: CHAIN_ID, payload: veggie, status: "auto_applied", resultId: NEW_ID }));
  assert.deepStrictEqual(await patch({ status: "reverted" }, 409), { error: "Item changed since this submission" });
  assert.strictEqual(sub.updates.length, 0);
});

const newChain = { name: "Raising Cane's", nutritionSourceUrl: "https://www.raisingcanes.com/nutrition", alternateNames: ["Raising Canes", "Canes", "canes"] };

test("approving a new chain inserts it with normalized, unique names and records resultId", async () => {
  mock.method(Chain, "exists", async () => null);
  const create = mock.method(Chain, "create", async (doc) => ({ _id: NEW_ID, ...doc }));
  storeSubmission(submission({ kind: "new_chain", targetId: null, payload: newChain, flags: ["new_chain"] }));
  const body = await patch({ status: "approved" }, 200);
  assert.deepStrictEqual(create.mock.calls[0].arguments[0], {
    name: "Raising Cane's", nameKey: "raising canes", alternateNames: ["raising canes", "canes"], nutritionSourceUrl: newChain.nutritionSourceUrl,
  });
  assert.strictEqual(body.resultId, NEW_ID);
});

test("approving a new chain whose name is already a chain's name or alternate name is 409", async () => {
  let filter;
  mock.method(Chain, "exists", async (f) => ((filter = f), { _id: CHAIN_ID }));
  storeSubmission(submission({ kind: "new_chain", targetId: null, payload: newChain }));
  assert.deepStrictEqual(await patch({ status: "approved" }, 409), { error: "Restaurant already exists" });
  assert.deepStrictEqual(filter, { $or: [{ nameKey: "raising canes" }, { alternateNames: "raising canes" }] });
});

test("reverting a new chain deletes it only when it has no menu items", async () => {
  const chainSub = () => submission({ kind: "new_chain", targetId: null, payload: newChain, status: "approved", resultId: NEW_ID });
  mock.method(MenuItem, "exists", async () => ({ _id: ITEM_ID }));
  const deleteOne = mock.method(Chain, "deleteOne", async () => ({ deletedCount: 1 }));
  storeSubmission(chainSub());
  assert.deepStrictEqual(await patch({ status: "reverted" }, 409), { error: "Restaurant has menu items" });
  assert.strictEqual(deleteOne.mock.callCount(), 0);

  mock.method(MenuItem, "exists", async () => null);
  storeSubmission(chainSub());
  await patch({ status: "reverted" }, 200);
  assert.deepStrictEqual(deleteOne.mock.calls[0].arguments[0], { _id: NEW_ID });

  deleteOne.mock.mockImplementation(async () => ({ deletedCount: 0 }));
  storeSubmission(chainSub());
  assert.deepStrictEqual(await patch({ status: "reverted" }, 404), { error: "Restaurant not found" });
});
