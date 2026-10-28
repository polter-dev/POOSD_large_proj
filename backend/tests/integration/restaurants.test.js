const { test, before, after, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");
const Chain = require("../../src/models/Chain");
const User = require("../../src/models/User");
const places = require("../../src/integrations/places");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";
process.env.JWT_SECRET = "test-secret";

let server;
let base;
let auth;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
  auth = `Bearer ${signJwt(USER_ID)}`;
});

after(() => server.close());
afterEach(() => mock.restoreAll());

function post(body, authorization = auth) {
  return fetch(`${base}/api/restaurants/nearby`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization && { Authorization: authorization }) },
    body: JSON.stringify(body),
  });
}

function stubSavedRadius(searchRadius) {
  return mock.method(User, "findById", () => ({ lean: async () => searchRadius && { preferences: { searchRadius } } }));
}

const chains = [
  { _id: "64b000000000000000000001", name: "Panda Express", nameKey: "panda express", alternateNames: ["panda"] },
  { _id: "64b000000000000000000002", name: "Subway", nameKey: "subway", alternateNames: [] },
];

function stubChains() {
  mock.method(Chain, "find", () => ({ lean: async () => chains }));
}

test("returns matched places with chainId, null for no match, and sends numbers to places", async () => {
  stubChains();
  const calls = [];
  mock.method(places, "findNearbyChainLocations", async (args) => {
    calls.push(args);
    return [
      { placeId: "osm-node-1", name: "Panda Express - UCF", address: null, lat: 28.6, lng: -81.2, distanceMiles: 0.4 },
      { placeId: "osm-way-2", name: "Not Subway Cafe", address: "1 Main St", lat: 28.7, lng: -81.2, distanceMiles: 6.9 },
    ];
  });

  const findById = stubSavedRadius(5);

  const res = await post({ lat: 28.6, lng: -81.2, radiusMiles: 10 });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    restaurants: [
      { placeId: "osm-node-1", name: "Panda Express - UCF", address: null, distanceMiles: 0.4, chainId: chains[0]._id },
      { placeId: "osm-way-2", name: "Not Subway Cafe", address: "1 Main St", distanceMiles: 6.9, chainId: null },
    ],
  });
  assert.deepStrictEqual(calls, [
    { lat: 28.6, lng: -81.2, radiusMiles: 10, chainNames: ["Panda Express", "panda", "Subway"] },
  ]);
  // An explicit radius needs no user lookup.
  assert.strictEqual(findById.mock.callCount(), 0);
});

test("radiusMiles defaults to the caller's preferences.searchRadius", async () => {
  stubChains();
  const findById = stubSavedRadius(15);
  let radius;
  mock.method(places, "findNearbyChainLocations", async (args) => {
    radius = args.radiusMiles;
    return [];
  });
  const res = await post({ lat: 0, lng: 0 });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { restaurants: [] });
  assert.strictEqual(radius, 15);
  assert.strictEqual(findById.mock.calls[0].arguments[0], USER_ID);
});

test("404 when the token's user no longer exists and no radius is given", async () => {
  stubSavedRadius(null);
  const spy = mock.method(places, "findNearbyChainLocations", async () => []);
  const res = await post({ lat: 0, lng: 0 });
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "User not found" });
  assert.strictEqual(spy.mock.callCount(), 0);
});

for (const [label, authorization, error] of [
  ["no token", null, "Not logged in"],
  ["a bad token", "Bearer not.a.jwt", "Invalid or expired session"],
]) {
  test(`401 with ${label}, without calling places`, async () => {
    const spy = mock.method(places, "findNearbyChainLocations", async () => []);
    const res = await post({ lat: 0, lng: 0, radiusMiles: 5 }, authorization);
    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(spy.mock.callCount(), 0);
  });
}

for (const [label, body, error] of [
  ["missing lat", { lng: -81.2 }, "lat must be a number from -90 to 90"],
  ["missing lng", { lat: 28.6 }, "lng must be a number from -180 to 180"],
  ["string lat", { lat: "28.6", lng: -81.2 }, "lat must be a number from -90 to 90"],
  ["injection string lng", { lat: 28.6, lng: "0);out;nwr(1" }, "lng must be a number from -180 to 180"],
  ["lat out of range", { lat: 91, lng: 0 }, "lat must be a number from -90 to 90"],
  ["lng out of range", { lat: 0, lng: -180.5 }, "lng must be a number from -180 to 180"],
  ["string radius", { lat: 0, lng: 0, radiusMiles: "10" }, "radiusMiles must be 5, 10, 15 or 20"],
  ["radius not allowed", { lat: 0, lng: 0, radiusMiles: 7 }, "radiusMiles must be 5, 10, 15 or 20"],
  ["null radius", { lat: 0, lng: 0, radiusMiles: null }, "radiusMiles must be 5, 10, 15 or 20"],
  ["unknown field", { lat: 0, lng: 0, userId: "x" }, "Unknown field: userId"],
]) {
  test(`400 for ${label}, without calling places`, async () => {
    const spy = mock.method(places, "findNearbyChainLocations", async () => []);
    const res = await post(body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(spy.mock.callCount(), 0);
  });
}

test("400, not 500, when the request has no body", async () => {
  const res = await fetch(`${base}/api/restaurants/nearby`, { method: "POST", headers: { Authorization: auth } });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "lat must be a number from -90 to 90" });
});

test("Overpass failure surfaces as 502 Places lookup failed", async () => {
  stubChains();
  mock.method(places, "findNearbyChainLocations", async () => {
    throw Object.assign(new Error("Places lookup failed"), { status: 502 });
  });
  const res = await post({ lat: 0, lng: 0, radiusMiles: 20 });
  assert.strictEqual(res.status, 502);
  assert.deepStrictEqual(await res.json(), { error: "Places lookup failed" });
});
