const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const { findNearbyChainLocations, _clearCache } = require("../../src/integrations/places");

const realFetch = global.fetch;
const realOverpassUrl = process.env.OVERPASS_URL;
afterEach(() => {
  _clearCache();
  global.fetch = realFetch;
  if (realOverpassUrl === undefined) delete process.env.OVERPASS_URL;
  else process.env.OVERPASS_URL = realOverpassUrl;
});
const okBody = (name) => ({ ok: true, json: async () => ({ elements: [{ type: "node", id: 9, lat: 1, lon: 1, tags: { name } }] }) });

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
    placeId: "osm-node-1", name: "McDonald's", address: "1 Main St, Orlando", lat: 28.6, lng: -81.2, distanceMiles: 0,
  });
  assert.strictEqual(rows[1].placeId, "osm-way-2");
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
  for (const lat of ["0);out;nwr(1", null]) {
    await assert.rejects(findNearbyChainLocations({ ...args, lat }), { status: 400 });
  }
});

test("a failing server falls through to the next one, each attempt with a timeout signal", async () => {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push(url);
    assert.ok(opts.signal instanceof AbortSignal);
    if (calls.length === 1) throw new TypeError("fetch failed");
    return okBody("Wendy's");
  };
  const rows = await findNearbyChainLocations({ lat: 1, lng: 1, radiusMiles: 5, chainNames: ["Wendy's"] });
  assert.strictEqual(calls.length, 2);
  assert.notStrictEqual(calls[0], calls[1]);
  assert.strictEqual(rows[0].name, "Wendy's");
});

test("all servers failing is still 502 Places lookup failed, OVERPASS_URL tried first, at most 3 attempts", async () => {
  process.env.OVERPASS_URL = "https://overpass.example.test/api/interpreter";
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 502 };
  };
  await assert.rejects(
    findNearbyChainLocations({ lat: 2, lng: 2, radiusMiles: 5, chainNames: ["Subway"] }),
    { status: 502, message: "Places lookup failed" },
  );
  assert.strictEqual(calls[0], process.env.OVERPASS_URL);
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(new Set(calls).size, 3); // 3 distinct servers, each tried once
});

test("a repeat lookup within the TTL, even after moving a few meters, is served from cache", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return okBody("Taco Bell");
  };
  const args = { lat: 3.0001, lng: 3.0001, radiusMiles: 5, chainNames: ["Taco Bell"] };
  await findNearbyChainLocations(args);
  const rows = await findNearbyChainLocations({ ...args, lat: 3.0002 });
  assert.strictEqual(calls, 1);
  assert.strictEqual(rows[0].name, "Taco Bell");
});

test("concurrent identical lookups share one upstream request", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = () => resolve(okBody("Arby's")); });
  global.fetch = () => {
    calls++;
    return gate;
  };
  const args = { lat: 4, lng: 4, radiusMiles: 5, chainNames: ["Arby's"] };
  const both = Promise.all([findNearbyChainLocations(args), findNearbyChainLocations(args)]);
  await new Promise(setImmediate);
  release();
  const [a, b] = await both;
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a[0].name, "Arby's");
});

test("a failed in-flight lookup is not reused; the next identical call fetches again", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: false, status: 429 };
  };
  const args = { lat: 4, lng: 4, radiusMiles: 5, chainNames: ["Arby's"] };
  await assert.rejects(findNearbyChainLocations(args), { status: 502 });
  const failedCalls = calls;
  global.fetch = async () => {
    calls++;
    return okBody("Arby's");
  };
  const rows = await findNearbyChainLocations(args);
  assert.strictEqual(calls, failedCalls + 1);
  assert.strictEqual(rows[0].name, "Arby's");
});
