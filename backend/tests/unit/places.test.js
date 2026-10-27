const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const { findNearbyChainLocations } = require("../../src/integrations/places");

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

test("maps nodes and ways (center) and sends the radius in meters", async () => {
  let query;
  global.fetch = async (url, opts) => {
    query = opts.body.get("data");
    return {
      ok: true,
      json: async () => ({
        elements: [
          { type: "way", id: 2, center: { lat: 28.7, lon: -81.2 }, tags: { name: "Chick-fil-A" } },
          {
            type: "node", id: 1, lat: 28.6, lon: -81.2,
            tags: { name: "McDonald's", "addr:housenumber": "1", "addr:street": "Main St", "addr:city": "Orlando" },
          },
        ],
      }),
    };
  };

  const rows = await findNearbyChainLocations({
    lat: 28.6, lng: -81.2, radiusMiles: 10, chainNames: ["McDonald's", "Chick-fil-A"],
  });

  assert.match(query, /\(around:16093,28\.6,-81\.2\)/);
  assert.ok(query.includes("McDonald['’]?s|Chick-fil-A"));
  assert.deepStrictEqual(rows[0], {
    placeId: "node/1", name: "McDonald's", address: "1 Main St, Orlando", lat: 28.6, lng: -81.2, distanceMiles: 0,
  });
  assert.strictEqual(rows[1].placeId, "way/2");
  assert.strictEqual(rows[1].address, null);
  assert.deepStrictEqual([rows[1].lat, rows[1].lng], [28.7, -81.2]);
  assert.ok(Math.abs(rows[1].distanceMiles - 6.9) < 0.1);
});

test("throws 502 Places lookup failed when Overpass errors", async () => {
  global.fetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(
    findNearbyChainLocations({ lat: 0, lng: 0, radiusMiles: 5, chainNames: ["Subway"] }),
    { status: 502, message: "Places lookup failed" },
  );
});

test("bad Overpass bodies throw 502, coordinate-less elements are dropped, no chains means no call", async () => {
  const args = { lat: 0, lng: 0, radiusMiles: 5, chainNames: ["Subway"] };
  for (const body of [{}, null]) {
    global.fetch = async () => ({ ok: true, json: async () => body });
    await assert.rejects(findNearbyChainLocations(args), { status: 502 });
  }
  global.fetch = async () => ({ ok: true, json: async () => ({ elements: [{ type: "way", id: 3, tags: { name: "Subway" } }] }) });
  assert.deepStrictEqual(await findNearbyChainLocations(args), []);
  global.fetch = async () => assert.fail("fetch should not be called");
  assert.deepStrictEqual(await findNearbyChainLocations({ ...args, chainNames: [] }), []);
  await assert.rejects(findNearbyChainLocations({ ...args, lat: "0);out;nwr(1" }), { status: 400 });
});
