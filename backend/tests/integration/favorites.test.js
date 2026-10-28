const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const Favorite = require("../../src/models/Favorite");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
const FAV_ID = "64b0000000000000000000f1";
const PLACE_ID = "osm-node-1234567890";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/favorites`;
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

const created = new Date("2026-10-27T12:00:00Z");

test("every favorites route needs a token", async () => {
  for (const [method, path] of [["GET", ""], ["POST", ""], ["DELETE", `/${FAV_ID}`]]) {
    assert.strictEqual((await call(method, path, undefined, null)).status, 401, method);
  }
});

test("GET lists only the caller's favorites, newest first, without userId", async () => {
  let filter;
  let sort;
  mock.method(Favorite, "find", (f) => {
    filter = f;
    return {
      sort: (s) => {
        sort = s;
        return { lean: async () => [{ _id: FAV_ID, userId: USER_ID, placeId: PLACE_ID, label: "Union", createdAt: created }] };
      },
    };
  });
  const res = await call("GET");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    favorites: [{ id: FAV_ID, placeId: PLACE_ID, label: "Union", createdAt: "2026-10-27T12:00:00.000Z" }],
  });
  assert.deepStrictEqual(filter, { userId: USER_ID });
  assert.deepStrictEqual(sort, { createdAt: -1, _id: -1 });
});

function stubCreate() {
  const docs = [];
  mock.method(Favorite, "create", async (doc) => {
    docs.push(doc);
    return { _id: FAV_ID, ...doc, createdAt: created };
  });
  return docs;
}

test("POST stores only the user, place ID and label and answers 201 Favorite", async () => {
  const docs = stubCreate();
  const res = await call("POST", "", { placeId: PLACE_ID, label: "  Post-gym  " });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), { id: FAV_ID, placeId: PLACE_ID, label: "Post-gym", createdAt: "2026-10-27T12:00:00.000Z" });
  assert.deepStrictEqual(docs, [{ userId: USER_ID, placeId: PLACE_ID, label: "Post-gym" }]);
});

test("POST stores a missing, null or blank label as null", async () => {
  const docs = stubCreate();
  for (const body of [{ placeId: PLACE_ID }, { placeId: PLACE_ID, label: null }, { placeId: PLACE_ID, label: "  " }]) {
    assert.strictEqual((await call("POST", "", body)).status, 201);
  }
  assert.deepStrictEqual(docs.map((d) => d.label), [null, null, null]);
});

test("POST accepts the Google-style seed place IDs too", async () => {
  stubCreate();
  assert.strictEqual((await call("POST", "", { placeId: "ChIJdemo_ChickfilA_StudentUnion" })).status, 201);
});

test("POST answers 409 when the place is already a favorite", async () => {
  mock.method(Favorite, "create", async () => {
    throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  });
  const res = await call("POST", "", { placeId: PLACE_ID });
  assert.strictEqual(res.status, 409);
  assert.deepStrictEqual(await res.json(), { error: "Already in your favorites" });
});

for (const [label, body, error] of [
  ["a missing placeId", {}, "placeId is invalid"],
  ["an old-style node/123 placeId", { placeId: "node/1234567890" }, "placeId is invalid"],
  ["a placeId under 10 characters", { placeId: "osm-node1" }, "placeId is invalid"],
  ["a placeId that is an object", { placeId: { $ne: null } }, "placeId is invalid"],
  ["a label over 50 characters", { placeId: PLACE_ID, label: "x".repeat(51) }, "Label: 50 characters max"],
  ["a label that isn't text", { placeId: PLACE_ID, label: 5 }, "Label must be text"],
  ["a field the schema doesn't allow", { placeId: PLACE_ID, address: "1 Main St" }, "Unknown field: address"],
]) {
  test(`POST rejects ${label}`, async () => {
    const docs = stubCreate();
    const res = await call("POST", "", body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(docs.length, 0);
  });
}

test("DELETE removes the caller's favorite and answers 204 with no body", async () => {
  let filter;
  mock.method(Favorite, "deleteOne", async (f) => {
    filter = f;
    return { deletedCount: 1 };
  });
  const res = await call("DELETE", `/${FAV_ID}`);
  assert.strictEqual(res.status, 204);
  assert.strictEqual(await res.text(), "");
  assert.deepStrictEqual(filter, { _id: FAV_ID, userId: USER_ID });
});

test("DELETE answers 404 for a missing or someone else's favorite, and for a malformed id", async () => {
  const deleteOne = mock.method(Favorite, "deleteOne", async () => ({ deletedCount: 0 }));
  let res = await call("DELETE", `/${FAV_ID}`);
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "Favorite not found" });

  res = await call("DELETE", "/not-an-id");
  assert.strictEqual(res.status, 404);
  assert.strictEqual(deleteOne.mock.callCount(), 1); // the malformed id never reached Mongo
});
