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

test("Mongo duplicate key error returns 409 Already exists", async () => {
  // The exported app already ends in the 404 handler, so use a throwaway app with the same error handler.
  const express = require("express");
  const errorHandler = require("../../src/middleware/error");
  const dupApp = express();
  dupApp.get("/dup", (req, res, next) => next(Object.assign(new Error("dup"), { code: 11000 })));
  dupApp.use(errorHandler);
  const dupServer = dupApp.listen(0);
  await new Promise((resolve) => dupServer.once("listening", resolve));
  try {
    const res = await fetch(`http://localhost:${dupServer.address().port}/dup`);
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(await res.json(), { error: "Already exists" });
  } finally {
    dupServer.close();
  }
});
