const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const MenuItem = require("../../src/models/MenuItem");

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/menu-items/search`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

const stored = {
  _id: "64b0000000000000000000c1",
  chainId: "64b000000000000000000001",
  chainName: "Chick-fil-A",
  name: "Grilled Nuggets (8 ct)",
  category: "entree",
  calories: 130,
  proteinG: 25,
  carbsG: 1,
  fatG: 3,
  isEstimate: false,
};

// Stubs find().sort().skip().limit().lean() and countDocuments, recording what each was given.
function stubSearch(items, total = items.length) {
  const seen = {};
  const query = {
    sort: (s) => ((seen.sort = s), query),
    skip: (n) => ((seen.skip = n), query),
    limit: (n) => ((seen.limit = n), query),
    lean: async () => items,
  };
  mock.method(MenuItem, "find", (filter, projection) => {
    Object.assign(seen, { filter, projection });
    return query;
  });
  mock.method(MenuItem, "countDocuments", async (filter) => {
    seen.countFilter = filter;
    return total;
  });
  return seen;
}

const search = (params) => fetch(`${base}?${new URLSearchParams(params)}`);

test("search needs no login and returns MenuItems with total, limit and skip", async () => {
  const seen = stubSearch([stored], 7);
  const res = await search({ q: "nuggets" });
  assert.strictEqual(res.status, 200);
  const { _id, ...fields } = stored;
  assert.deepStrictEqual(await res.json(), {
    items: [{ id: _id, ...fields }],
    total: 7,
    limit: 20,
    skip: 0,
  });
  assert.deepStrictEqual(seen.sort, { chainName: 1, name: 1 });
  assert.strictEqual(seen.limit, 20);
  assert.strictEqual(seen.skip, 0);
  // searchName, source and lastVerified are never read or returned.
  assert.ok(!("searchName" in seen.projection) && !("source" in seen.projection));
  assert.deepStrictEqual(seen.countFilter, seen.filter);
});

test("q is normalized like the stored searchName, so case and punctuation don't matter", async () => {
  const seen = stubSearch([]);
  await search({ q: "  CHICK-FIL-A  Nuggets!! " });
  assert.deepStrictEqual(seen.filter, { searchName: { $regex: "chick fil a nuggets" } });

  await search({ q: "McDonald's Café & Fries" });
  assert.deepStrictEqual(seen.filter, { searchName: { $regex: "mcdonalds cafe and fries" } });
});

test("regex characters in q can't change the query", async () => {
  const seen = stubSearch([]);
  const res = await search({ q: ".*(a+)+$" });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(seen.filter, { searchName: { $regex: "a" } });
});

test("limit and skip are passed through for paging", async () => {
  const seen = stubSearch([], 45);
  const res = await search({ q: "chicken", limit: "10", skip: "20" });
  const body = await res.json();
  assert.deepStrictEqual([body.total, body.limit, body.skip], [45, 10, 20]);
  assert.deepStrictEqual([seen.limit, seen.skip], [10, 20]);
});

for (const [label, params, error] of [
  ["a missing q", {}, "q is required"],
  ["a blank q", { q: "   " }, "q is required"],
  ["a q over 100 characters", { q: "a".repeat(101) }, "q: 100 characters max"],
  ["a q with no letters or numbers", { q: "!!!" }, "q must contain a letter or number"],
  ["limit 0", { q: "a", limit: "0" }, "limit must be a whole number from 1 to 100"],
  ["limit 101", { q: "a", limit: "101" }, "limit must be a whole number from 1 to 100"],
  ["a decimal limit", { q: "a", limit: "1.5" }, "limit must be a whole number from 1 to 100"],
  ["a negative skip", { q: "a", skip: "-1" }, "skip must be a whole number, 0 or more"],
  ["a word for skip", { q: "a", skip: "ten" }, "skip must be a whole number, 0 or more"],
]) {
  test(`search rejects ${label}`, async () => {
    const seen = stubSearch([]);
    const res = await search(params);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(seen.filter, undefined);
  });
}

test("a repeated q (an array) is rejected rather than sent to Mongo", async () => {
  stubSearch([]);
  const res = await fetch(`${base}?q=a&q=b`);
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "q is required" });
});
