const { test, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sgMail = require("@sendgrid/mail");
const app = require("../../src/app");
const User = require("../../src/models/User");
const { hashToken } = require("../../src/services/tokens");

// Hash of "Password123!" from db/seed.js.
const SEED_HASH = "$2b$10$fYkTDYUE26dcsyJDdm8T2.ePWbXs35ePgSzevHC1y6fEpOm85Py/u";
const USER_ID = "64b0000000000000000000aa";
const ENV = { JWT_SECRET: "test-secret", CLIENT_URL: "http://app", SENDGRID_API_KEY: "", EMAIL_FROM: "" };

let server;
let base;
let logs;
let errors;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api/auth`;
});

after(() => server.close());

beforeEach(() => {
  Object.assign(process.env, ENV);
  // Without SENDGRID_API_KEY, services/email.js logs the link instead of sending it.
  logs = [];
  errors = [];
  mock.method(console, "log", (...a) => logs.push(a.join(" ")));
  mock.method(console, "error", (...a) => errors.push(a.join(" ")));
});

afterEach(() => mock.restoreAll());

function post(path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The token from the most recently logged email link.
function loggedToken(page) {
  const line = logs.findLast((l) => l.includes(`http://app/${page}?token=`));
  assert.ok(line, `no ${page} link was logged`);
  return line.split("?token=")[1];
}

function failSendGrid() {
  Object.assign(process.env, { SENDGRID_API_KEY: "SG.test", EMAIL_FROM: "from@x.com" });
  return mock.method(sgMail, "send", async () => {
    throw new Error("Unauthorized");
  });
}

function storedUser(extra) {
  return {
    _id: USER_ID,
    firstName: "Jane",
    lastName: "Doe",
    username: "janedoe",
    email: "jane.doe@example.com",
    passwordHash: SEED_HASH,
    isVerified: true,
    verificationTokenHash: null,
    verificationTokenExpires: null,
    resetTokenHash: "secret-reset-hash",
    resetTokenExpires: null,
    profile: null,
    preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

const lean = (value) => () => ({ lean: async () => value });

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
const goodSignup = {
  firstName: " Jane ",
  lastName: "Doe",
  username: " JaneDoe ",
  email: " Jane.Doe@Example.com ",
  password: "Password123!",
};

test("register saves an unverified user with defaults and emails a link whose token matches the stored hash", async () => {
  const created = [];
  mock.method(User, "create", async (doc) => created.push(doc));

  const res = await post("/register", goodSignup);
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), { message: "Verification email sent" });

  assert.strictEqual(created.length, 1);
  const doc = created[0];
  assert.strictEqual(doc.firstName, "Jane");
  assert.strictEqual(doc.username, "janedoe");
  assert.strictEqual(doc.email, "jane.doe@example.com");
  assert.ok(await bcrypt.compare("Password123!", doc.passwordHash));
  assert.strictEqual(doc.isVerified, false);
  assert.strictEqual(doc.profile, null);
  assert.deepStrictEqual(doc.preferences, {
    units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null,
  });
  assert.strictEqual(doc.resetTokenHash, null);
  assert.strictEqual(doc.verificationTokenHash, hashToken(loggedToken("verify-email")));
  const hours = (doc.verificationTokenExpires - Date.now()) / 3.6e6;
  assert.ok(hours > 23.9 && hours <= 24, `expiry ${hours}h`);
});

for (const [label, change, error] of [
  ["missing first name", { firstName: undefined }, "First name is required"],
  ["blank first name", { firstName: "   " }, "First name is required"],
  ["51-char last name", { lastName: "x".repeat(51) }, "Last name: 50 characters max"],
  ["short username", { username: "ab" }, "Username: 3 to 30 letters, numbers, _ or ."],
  ["username with a space", { username: "jane doe" }, "Username: 3 to 30 letters, numbers, _ or ."],
  ["bad email", { email: "jane@example" }, "Email: enter a valid address"],
  ["email as an object", { email: { $ne: null } }, "Email: enter a valid address"],
  ["7-char password", { password: "1234567" }, "Password: at least 8 characters"],
  ["unknown field", { isVerified: true }, "Unknown field: isVerified"],
]) {
  test(`register 400 for ${label}, nothing saved`, async () => {
    const create = mock.method(User, "create", async () => {});
    const res = await post("/register", { ...goodSignup, ...change });
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(create.mock.callCount(), 0);
  });
}

for (const [field, error] of [["email", "Email already registered"], ["username", "Username already taken"]]) {
  test(`register 409 when the ${field} is taken`, async () => {
    mock.method(User, "create", async () => {
      throw Object.assign(new Error("E11000 duplicate key"), { code: 11000, keyPattern: { [field]: 1 } });
    });
    const res = await post("/register", goodSignup);
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(await res.json(), { error });
  });
}

// #65: the account is already saved, so a mail outage must not turn sign-up into an error.
test("register still returns 201 and keeps the user when SendGrid rejects", async () => {
  const create = mock.method(User, "create", async () => {});
  const send = failSendGrid();
  const res = await post("/register", goodSignup);
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), { message: "Verification email sent" });
  assert.strictEqual(create.mock.callCount(), 1);
  assert.strictEqual(send.mock.callCount(), 1);
  assert.match(errors.join("\n"), /\[email\] send failed: Unauthorized/);
});

test("register still returns 201 when EMAIL_FROM is missing", async () => {
  mock.method(User, "create", async () => {});
  process.env.SENDGRID_API_KEY = "SG.test";
  const res = await post("/register", goodSignup);
  assert.strictEqual(res.status, 201);
  assert.match(errors.join("\n"), /EMAIL_FROM is not set/);
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
test("login returns a 7-day JWT for the user and the User object without secrets", async () => {
  let filter;
  mock.method(User, "findOne", (f) => {
    filter = f;
    return { lean: async () => storedUser() };
  });
  const res = await post("/login", { email: " JANE.DOE@example.com ", password: "Password123!" });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(filter, { email: "jane.doe@example.com" });

  const payload = jwt.verify(body.token, "test-secret");
  assert.strictEqual(payload.sub, USER_ID);
  assert.strictEqual(payload.exp - payload.iat, 7 * 24 * 3600);
  assert.deepStrictEqual(body.user, {
    id: USER_ID,
    firstName: "Jane",
    lastName: "Doe",
    username: "janedoe",
    email: "jane.doe@example.com",
    isVerified: true,
    profile: null,
    preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
  });
});

test("login returns birthDate as YYYY-MM-DD", async () => {
  const profile = {
    heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose",
  };
  mock.method(User, "findOne", lean(storedUser({ profile })));
  const res = await post("/login", { email: "jane.doe@example.com", password: "Password123!" });
  assert.deepStrictEqual((await res.json()).user.profile, { ...profile, birthDate: "2006-03-14" });
});

test("login 401 for a wrong password", async () => {
  mock.method(User, "findOne", lean(storedUser()));
  const res = await post("/login", { email: "jane.doe@example.com", password: "wrong-password" });
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(await res.json(), { error: "Invalid email or password" });
});

test("login 401 for an unknown email", async () => {
  mock.method(User, "findOne", lean(null));
  const res = await post("/login", { email: "nobody@example.com", password: "Password123!" });
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(await res.json(), { error: "Invalid email or password" });
});

test("login 403 for an unverified user, but only with the right password", async () => {
  mock.method(User, "findOne", lean(storedUser({ isVerified: false })));
  const right = await post("/login", { email: "jane.doe@example.com", password: "Password123!" });
  assert.strictEqual(right.status, 403);
  assert.deepStrictEqual(await right.json(), { error: "Email not verified" });
  const wrong = await post("/login", { email: "jane.doe@example.com", password: "wrong-password" });
  assert.strictEqual(wrong.status, 401);
});

for (const [label, body] of [
  ["missing password", { email: "jane.doe@example.com" }],
  ["no body", undefined],
  ["email as a Mongo operator", { email: { $ne: null }, password: "Password123!" }],
]) {
  test(`login 400 for ${label}, without a lookup`, async () => {
    const findOne = mock.method(User, "findOne", lean(storedUser()));
    const res = await post("/login", body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: "Email and password are required" });
    assert.strictEqual(findOne.mock.callCount(), 0);
  });
}

test("login 500 Server error when JWT_SECRET is not set", async () => {
  delete process.env.JWT_SECRET;
  mock.method(User, "findOne", lean(storedUser()));
  const res = await post("/login", { email: "jane.doe@example.com", password: "Password123!" });
  assert.strictEqual(res.status, 500);
  assert.deepStrictEqual(await res.json(), { error: "Server error" });
});

// ---------------------------------------------------------------------------
// verify-email
// ---------------------------------------------------------------------------
test("verify-email marks the user verified and clears the token in one update", async () => {
  let args;
  mock.method(User, "findOneAndUpdate", async (...a) => {
    args = a;
    return storedUser();
  });
  const res = await fetch(`${base}/verify-email?token=demo-verify-token`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { message: "Email verified" });
  const [filter, update] = args;
  assert.strictEqual(filter.verificationTokenHash, hashToken("demo-verify-token"));
  assert.ok(filter.verificationTokenExpires.$gt instanceof Date);
  assert.deepStrictEqual(update, {
    $set: { isVerified: true, verificationTokenHash: null, verificationTokenExpires: null },
  });
});

test("verify-email 400 for an unknown, used or expired token", async () => {
  mock.method(User, "findOneAndUpdate", async () => null);
  const res = await fetch(`${base}/verify-email?token=nope`);
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Invalid or expired token" });
});

for (const [label, query] of [["missing token", ""], ["repeated token", "?token=a&token=b"]]) {
  test(`verify-email 400 for ${label}`, async () => {
    const update = mock.method(User, "findOneAndUpdate", async () => storedUser());
    const res = await fetch(`${base}/verify-email${query}`);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: "Token is required" });
    assert.strictEqual(update.mock.callCount(), 0);
  });
}

// ---------------------------------------------------------------------------
// resend-verification and forgot-password
// ---------------------------------------------------------------------------
const RESEND_MSG = "If that email exists, a verification link was sent";
const FORGOT_MSG = "If that email exists, a reset link was sent";

test("resend-verification gives an unverified user a new 24h token and emails it", async () => {
  let args;
  mock.method(User, "findOneAndUpdate", async (...a) => {
    args = a;
    return storedUser({ isVerified: false });
  });
  const res = await post("/resend-verification", { email: " Jane.Doe@example.com" });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { message: RESEND_MSG });
  const [filter, { $set }] = args;
  assert.deepStrictEqual(filter, { email: "jane.doe@example.com", isVerified: false });
  assert.strictEqual($set.verificationTokenHash, hashToken(loggedToken("verify-email")));
  const hours = ($set.verificationTokenExpires - Date.now()) / 3.6e6;
  assert.ok(hours > 23.9 && hours <= 24);
});

test("forgot-password sets a 1h reset token and emails the reset link", async () => {
  let args;
  mock.method(User, "findOneAndUpdate", async (...a) => {
    args = a;
    return storedUser();
  });
  const res = await post("/forgot-password", { email: "jane.doe@example.com" });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { message: FORGOT_MSG });
  const [filter, { $set }] = args;
  assert.deepStrictEqual(filter, { email: "jane.doe@example.com" });
  assert.strictEqual($set.resetTokenHash, hashToken(loggedToken("reset-password")));
  const minutes = ($set.resetTokenExpires - Date.now()) / 60000;
  assert.ok(minutes > 59.9 && minutes <= 60);
});

for (const [path, message] of [["/resend-verification", RESEND_MSG], ["/forgot-password", FORGOT_MSG]]) {
  test(`${path} gives the same reply and sends nothing for an unknown (or verified) email`, async () => {
    mock.method(User, "findOneAndUpdate", async () => null);
    const res = await post(path, { email: "nobody@example.com" });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { message });
    assert.deepStrictEqual(logs, []);
  });

  // #65: an error here would only happen for real accounts, which would reveal that the email exists.
  test(`${path} gives the same 200 when SendGrid rejects`, async () => {
    mock.method(User, "findOneAndUpdate", async () => storedUser({ isVerified: false }));
    const send = failSendGrid();
    const res = await post(path, { email: "jane.doe@example.com" });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { message });
    assert.strictEqual(send.mock.callCount(), 1);
    assert.match(errors.join("\n"), /\[email\] send failed: Unauthorized/);
  });

  test(`${path} 400 for a missing email`, async () => {
    const res = await post(path, {});
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: "Email is required" });
  });
}

// ---------------------------------------------------------------------------
// reset-password
// ---------------------------------------------------------------------------
test("reset-password stores the new hash and clears the reset token in one update", async () => {
  let args;
  mock.method(User, "findOneAndUpdate", async (...a) => {
    args = a;
    return storedUser();
  });
  const res = await post("/reset-password", { token: "demo-reset-token", password: "NewPassword1" });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { message: "Password updated" });
  const [filter, { $set }] = args;
  assert.strictEqual(filter.resetTokenHash, hashToken("demo-reset-token"));
  assert.ok(filter.resetTokenExpires.$gt instanceof Date);
  assert.ok(await bcrypt.compare("NewPassword1", $set.passwordHash));
  assert.strictEqual($set.resetTokenHash, null);
  assert.strictEqual($set.resetTokenExpires, null);
});

test("reset-password 400 for an unknown, used or expired token", async () => {
  mock.method(User, "findOneAndUpdate", async () => null);
  const res = await post("/reset-password", { token: "nope", password: "NewPassword1" });
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "Invalid or expired token" });
});

for (const [label, body, error] of [
  ["short password", { token: "demo-reset-token", password: "short" }, "Password: at least 8 characters"],
  ["missing token", { password: "NewPassword1" }, "Token is required"],
]) {
  test(`reset-password 400 for ${label}, without an update`, async () => {
    const update = mock.method(User, "findOneAndUpdate", async () => storedUser());
    const res = await post("/reset-password", body);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error });
    assert.strictEqual(update.mock.callCount(), 0);
  });
}
