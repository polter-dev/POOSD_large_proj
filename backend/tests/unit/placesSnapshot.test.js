// db/places-snapshot.json is data the API serves when every Overpass server is down (#128), so check it like code.
const { test } = require("node:test");
const assert = require("node:assert");
const snapshot = require("../../db/places-snapshot.json");
const { seededChains } = require("../../scripts/capture-places-snapshot");
const { matchChain } = require("../../src/services/chainMatch");

function distanceMiles(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

test("covers 20 miles around UCF and says where it came from", () => {
  assert.ok(distanceMiles(28.6024, -81.2001, snapshot.center.lat, snapshot.center.lng) < 0.1);
  assert.strictEqual(snapshot.radiusMiles, 20);
  assert.ok(!Number.isNaN(Date.parse(snapshot.capturedAt)), snapshot.capturedAt);
  assert.match(snapshot.attribution, /OpenStreetMap contributors/); // ODbL requires it
  assert.ok(snapshot.places.length > 100, `${snapshot.places.length} places`);
});

test("every place has the shape the Overpass mapper produces, a unique favorite-safe placeId, and lies in the circle", () => {
  const ids = new Set();
  for (const p of snapshot.places) {
    assert.deepStrictEqual(Object.keys(p), ["placeId", "name", "address", "lat", "lng"], p.placeId);
    // favorites.placeId in db/schema.js, so a fallback result can be saved like a live one
    assert.match(p.placeId, /^osm-(node|way|relation)-\d+$/);
    assert.match(p.placeId, /^[A-Za-z0-9_-]{10,300}$/);
    assert.ok(!ids.has(p.placeId), `duplicate ${p.placeId}`);
    ids.add(p.placeId);
    assert.ok(typeof p.name === "string" && p.name.trim(), p.placeId);
    assert.ok(p.address === null || (typeof p.address === "string" && p.address.trim()), p.placeId);
    // A way's center can sit a little outside "around" (it matches when any of its nodes is inside).
    assert.ok(distanceMiles(snapshot.center.lat, snapshot.center.lng, p.lat, p.lng) < snapshot.radiusMiles + 0.5, p.placeId);
  }
});

test("every place matches a seeded chain, and every seeded chain has places (re-capture after adding a chain)", () => {
  const chains = seededChains();
  const counts = Object.fromEntries(chains.map((c) => [c.name, 0]));
  for (const p of snapshot.places) {
    const chain = matchChain(p.name, chains);
    assert.ok(chain, `${p.placeId} "${p.name}" matches no chain, so it would have no nutrition data`);
    counts[chain.name]++;
  }
  const missing = Object.keys(counts).filter((name) => !counts[name]);
  assert.deepStrictEqual(missing, [], "run: node scripts/capture-places-snapshot.js");
});
