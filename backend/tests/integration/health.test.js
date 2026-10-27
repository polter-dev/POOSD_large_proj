const { test, before, after } = require("node:test");
const assert = require("node:assert");
const app = require("../../src/app");

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test("GET /api/health returns ok with db false when not connected", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true, db: false });
});

test("unknown path returns 404 Not found", async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: "Not found" });
});

test("bad JSON body returns 400 Invalid JSON", async () => {
  const res = await fetch(`${base}/api/health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Invalid JSON" });
});
