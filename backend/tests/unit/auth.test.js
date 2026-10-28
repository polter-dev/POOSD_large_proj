const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const requireAuth = require("../../src/middleware/auth");
const { signJwt } = require("../../src/services/tokens");

const USER_ID = "64b0000000000000000000aa";

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret";
});

// Runs the middleware with this Authorization header; returns { err, userId }.
function run(header) {
  const req = { get: (name) => (name === "Authorization" ? header : undefined) };
  let err;
  requireAuth(req, {}, (e) => {
    err = e;
  });
  return { err, userId: req.userId };
}

test("a token from signJwt sets req.userId", () => {
  assert.deepStrictEqual(run(`Bearer ${signJwt(USER_ID)}`), { err: undefined, userId: USER_ID });
});

for (const [label, header] of [["no header", undefined], ["not Bearer", `Token ${USER_ID}`], ["empty Bearer", "Bearer "]]) {
  test(`401 Not logged in for ${label}`, () => {
    const { err, userId } = run(header);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.message, "Not logged in");
    assert.strictEqual(userId, undefined);
  });
}

for (const [label, token] of [
  ["garbage", "not.a.jwt"],
  ["expired", jwt.sign({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) - 10 }, "test-secret")],
  ["wrong secret", jwt.sign({ sub: USER_ID }, "other-secret")],
  ["alg none", jwt.sign({ sub: USER_ID }, null, { algorithm: "none" })],
  ["sub not a Mongo id", jwt.sign({ sub: "admin" }, "test-secret")],
  ["no sub", jwt.sign({}, "test-secret")],
]) {
  test(`401 Invalid or expired session for a ${label} token`, () => {
    const { err, userId } = run(`Bearer ${token}`);
    assert.strictEqual(err.status, 401);
    assert.strictEqual(err.message, "Invalid or expired session");
    assert.strictEqual(userId, undefined);
  });
}

test("a missing JWT_SECRET is a 500 (no status), not a 401", () => {
  const header = `Bearer ${signJwt(USER_ID)}`;
  delete process.env.JWT_SECRET;
  const { err } = run(header);
  assert.strictEqual(err.message, "JWT_SECRET is not set");
  assert.strictEqual(err.status, undefined);
});
