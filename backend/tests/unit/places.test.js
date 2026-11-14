const { test, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { findNearbyChainLocations, _clearCache } = require("../../src/integrations/places");

const realFetch = global.fetch;
const realOverpassUrl = process.env.OVERPASS_URL;
afterEach(() => {
  _clearCache();
  mock.restoreAll();
  global.fetch = realFetch;
  if (realOverpassUrl === undefined) delete process.env.OVERPASS_URL;
  else process.env.OVERPASS_URL = realOverpassUrl;
});
const okBody = (name) => ({ ok: true, json: async () => ({ elements: [{ type: "node", id: 9, lat: 1, lon: 1, tags: { name } }] }) });

test("maps nodes and ways (center) and sends the radius in meters", async () => {
  // Far from the UCF snapshot, so Overpass is asked.
  let query;
  global.fetch = async (url, opts) => {
    query = opts.body.get("data");
    return {
      ok: true,
      json: async () => ({
        elements: [
          { type: "way", id: 2, center: { lat: 38.7, lon: -81.2 }, tags: { name: "Chick-fil-A" } },
          {
            type: "node", id: 1, lat: 38.6, lon: -81.2,
            tags: { name: "McDonald's", "addr:housenumber": "1", "addr:street": "Main St", "addr:city": "Orlando" },
          },
        ],
      }),
    };
  };

  const rows = await findNearbyChainLocations({
    lat: 38.6, lng: -81.2, radiusMiles: 10, chainNames: ["McDonald's", "Chick-fil-A"],
  });

  assert.match(query, /\(around:16093,38\.6,-81\.2\)/);
  assert.ok(query.includes("McDonald['’]?s|Chick-fil-A"));
  assert.deepStrictEqual(rows[0], {
    placeId: "osm-node-1", name: "McDonald's", address: "1 Main St, Orlando", lat: 38.6, lng: -81.2, distanceMiles: 0,
  });
  assert.strictEqual(rows[1].placeId, "osm-way-2");
  assert.strictEqual(rows[1].address, null);
  assert.deepStrictEqual([rows[1].lat, rows[1].lng], [38.7, -81.2]);
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

test("servers are asked at once: a hanging one and an unusable body don't delay or beat the one that answers", async () => {
  const calls = [];
  global.fetch = (url, opts) => {
    calls.push(url);
    assert.ok(opts.signal instanceof AbortSignal);
    if (calls.length === 1) return new Promise(() => {}); // hangs (the mock ignores its 15 s abort)
    if (calls.length === 2) return Promise.resolve({ ok: false, status: 502 }); // fast but unusable: must not win
    return Promise.resolve(okBody("Wendy's"));
  };
  const rows = await findNearbyChainLocations({ lat: 1, lng: 1, radiusMiles: 5, chainNames: ["Wendy's"] });
  assert.strictEqual(new Set(calls).size, 3);
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
  const firstCalls = calls;
  const rows = await findNearbyChainLocations({ ...args, lat: 3.0002 });
  assert.strictEqual(calls, firstCalls);
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
  assert.strictEqual(calls, 3); // one per server, not one per caller
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
  assert.strictEqual(calls, failedCalls + 3);
  assert.strictEqual(rows[0].name, "Arby's");
});

// ---------------------------------------------------------------------------
// Inside the snapshot's circle (#163): the snapshot at once, Overpass in the background. Outside it, every server
// down (#128): an expired cache entry, then db/places-snapshot.json, then the 502.
// UCF with radiusMiles <= 19 lies inside the snapshot's 20 miles; 25 does not.
// ---------------------------------------------------------------------------
const UCF = { lat: 28.6024, lng: -81.2001 };
const hanging = () => {
  const calls = [];
  global.fetch = (url) => {
    calls.push(url);
    return new Promise(() => {});
  };
  return calls;
};
const failing = () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 502 };
  };
  return calls;
};
const quiet = () => mock.method(console, "error", () => {});
const sortedByDistance = (rows) => rows.every((r, i) => i === 0 || rows[i - 1].distanceMiles <= r.distanceMiles);

test("inside the snapshot's circle with an empty cache, the snapshot answers without waiting on fetch: asked-for chains only, within the radius, nearest first", async () => {
  const calls = hanging();
  const log = quiet();
  const rows = await findNearbyChainLocations({ ...UCF, radiusMiles: 5, chainNames: ["Panda Express", "Chick-fil-A"] });
  assert.strictEqual(calls.length, 3); // the background refresh was started on every server
  assert.ok(rows.length > 2, `${rows.length} rows`);
  assert.ok(rows.every((r) => /^(Panda Express|Chick-fil-A)$/.test(r.name)), rows.map((r) => r.name).join(", "));
  assert.ok(rows.every((r) => r.distanceMiles <= 5));
  assert.ok(sortedByDistance(rows));
  // Same shape as a live answer. The Student Union Panda Express is 0.03 mi from the UCF point.
  assert.deepStrictEqual(Object.keys(rows[0]), ["placeId", "name", "address", "lat", "lng", "distanceMiles"]);
  assert.deepStrictEqual([rows[0].placeId, rows[0].name, rows[0].address], ["osm-node-9661240581", "Panda Express", "12715 Pegasus Drive, Orlando"]);
  assert.strictEqual(log.mock.callCount(), 0);
});

test("the background refresh warms the cache: the next tap gets the live answer, ahead of the snapshot", async () => {
  global.fetch = async () => okBody("Subway");
  const args = { ...UCF, radiusMiles: 5, chainNames: ["Subway"] };
  const first = await findNearbyChainLocations(args);
  assert.ok(first.length > 1 && !first.some((r) => r.placeId === "osm-node-9")); // the snapshot
  await new Promise(setImmediate); // let the background lookup settle
  global.fetch = async () => assert.fail("a fresh cache entry needs no fetch");
  assert.deepStrictEqual((await findNearbyChainLocations(args)).map((r) => r.placeId), ["osm-node-9"]);
});

test("a failing background refresh is logged once and never surfaces", async () => {
  failing();
  const log = quiet();
  const rows = await findNearbyChainLocations({ ...UCF, radiusMiles: 5, chainNames: ["Subway"] });
  assert.ok(rows.length > 1);
  await new Promise(setImmediate);
  assert.strictEqual(log.mock.callCount(), 1);
  assert.strictEqual(log.mock.calls[0].arguments[0], "[places] background Overpass refresh failed; served the snapshot");
});

test("outside the snapshot's circle with every server failing, the snapshot's places within the radius answer, logged", async () => {
  const calls = failing();
  const log = quiet();
  const rows = await findNearbyChainLocations({ ...UCF, radiusMiles: 25, chainNames: ["Panda Express"] });
  assert.strictEqual(calls.length, 3); // Overpass was tried first, every server
  assert.ok(rows.length > 2 && rows.every((r) => r.name === "Panda Express" && r.distanceMiles <= 25));
  assert.strictEqual(log.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /^\[places\] every Overpass server failed; answered from the snapshot captured .+ \(\d+ places\)$/);
});

test("the snapshot is filtered with the query's own name pattern: case-insensitive, apostrophe optional", async () => {
  hanging();
  const args = { ...UCF, radiusMiles: 10 };
  const ids = async (chainNames) => (await findNearbyChainLocations({ ...args, chainNames })).map((r) => r.placeId);
  const exact = await ids(["McDonald's"]);
  assert.ok(exact.length > 0);
  assert.deepStrictEqual(await ids(["mcdonald"]), exact); // a normalized alternate name, as the controller sends them
  assert.deepStrictEqual(await ids(["Wendy"]), await ids(["Wendy's"]));
});

test("a bigger radius from the snapshot reaches further, but never past it", async () => {
  hanging();
  const near = await findNearbyChainLocations({ ...UCF, radiusMiles: 5, chainNames: ["Starbucks"] });
  const far = await findNearbyChainLocations({ ...UCF, radiusMiles: 15, chainNames: ["Starbucks"] });
  assert.ok(far.length > near.length);
  assert.ok(far.every((r) => r.distanceMiles <= 15));
  assert.ok(sortedByDistance(far));
});

test("inside the snapshot's area with nothing matching, the answer is an empty list, not a 502", async () => {
  failing();
  quiet();
  assert.deepStrictEqual(await findNearbyChainLocations({ ...UCF, radiusMiles: 25, chainNames: ["Nonexistent Burger"] }), []);
  hanging();
  assert.deepStrictEqual(await findNearbyChainLocations({ ...UCF, radiusMiles: 5, chainNames: ["Nonexistent Burger"] }), []);
});

test("outside the snapshot's 20 miles but overlapping it, the snapshot's places within the radius are returned", async () => {
  failing();
  quiet();
  // 25 mi west of UCF (Clermont): its 20-mile circle still covers west Orlando.
  const rows = await findNearbyChainLocations({ lat: 28.602, lng: -81.613, radiusMiles: 20, chainNames: ["Starbucks", "Subway"] });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.distanceMiles <= 20));
});

test("far from UCF with every server failing is still 502 Places lookup failed, with nothing logged", async () => {
  failing();
  const log = quiet();
  // Tampa, about 80 mi away
  await assert.rejects(
    findNearbyChainLocations({ lat: 27.9506, lng: -82.4572, radiusMiles: 20, chainNames: ["Starbucks"] }),
    { status: 502, message: "Places lookup failed" },
  );
  assert.strictEqual(log.mock.callCount(), 0);
});

test("an expired cache entry is served when every server fails, ahead of the snapshot", async () => {
  let now = Date.parse("2026-11-03T12:00:00Z");
  mock.method(Date, "now", () => now);
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ elements: [{ type: "node", id: 77, lat: 28.6025, lon: -81.2002, tags: { name: "Panda Express (cached)" } }] }),
  });
  const args = { ...UCF, radiusMiles: 25, chainNames: ["Panda Express"] }; // outside the snapshot's circle
  const live = await findNearbyChainLocations(args);

  now += 60 * 60 * 1000; // an hour later: past the 10-minute TTL
  const calls = failing();
  const log = quiet();
  const rows = await findNearbyChainLocations({ ...args, lat: UCF.lat + 0.00001 }); // a step away: same query
  assert.strictEqual(calls.length, 3); // expired, so Overpass was asked again first
  assert.deepStrictEqual(rows.map((r) => r.placeId), ["osm-node-77"]); // not the snapshot's Panda Express
  assert.deepStrictEqual(rows[0].name, live[0].name);
  assert.strictEqual(log.mock.callCount(), 1);
  assert.strictEqual(log.mock.calls[0].arguments[0], "[places] every Overpass server failed; answered from a cached result 60 min old");
});

test("outside the snapshot's circle a server that answers is always used, even with no places", async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ elements: [] }) });
  const log = quiet();
  assert.deepStrictEqual(await findNearbyChainLocations({ ...UCF, radiusMiles: 25, chainNames: ["Starbucks"] }), []);
  assert.strictEqual(log.mock.callCount(), 0);
});

test("a fallback answer is never cached: the next lookup asks Overpass again and gets the live answer", async () => {
  const calls = failing();
  quiet();
  const args = { ...UCF, radiusMiles: 25, chainNames: ["Subway"] };
  const fromSnapshot = await findNearbyChainLocations(args);
  assert.ok(fromSnapshot.length > 1);
  global.fetch = async (url) => {
    calls.push(url);
    return okBody("Subway");
  };
  const rows = await findNearbyChainLocations(args);
  assert.strictEqual(calls.length, 6);
  assert.deepStrictEqual(rows.map((r) => r.placeId), ["osm-node-9"]);
});
