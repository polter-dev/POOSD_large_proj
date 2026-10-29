const bcrypt = require("bcryptjs");
const User = require("../models/User");
const email = require("../services/email");
const { hashToken, newEmailToken, signJwt } = require("../services/tokens");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");
const toUserJSON = require("../utils/toUserJSON");

// Same cost as the seed accounts' hashes (db/seed.js).
const BCRYPT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const DEFAULT_PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null };
// Compared against when no account has the email, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("no-such-account", BCRYPT_ROUNDS);

// Rules and messages match docs/api-contract.md "Validation" and docs/design-spec.md "Sign up".
const USERNAME = /^[a-z0-9_.]{3,30}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Non-strings read as "" so a value like { "$ne": null } can never reach a Mongo filter.
const str = (v) => (typeof v === "string" ? v : "");
const lower = (v) => str(v).trim().toLowerCase();

function checkName(v, label) {
  const s = str(v).trim();
  if (!s) throw httpError(400, `${label} is required`);
  if (s.length > 50) throw httpError(400, `${label}: 50 characters max`);
  return s;
}

function checkUsername(v) {
  const s = lower(v);
  if (!USERNAME.test(s)) throw httpError(400, "Username: 3 to 30 letters, numbers, _ or .");
  return s;
}

function checkEmail(v) {
  const s = lower(v);
  if (!EMAIL.test(s) || s.length > 254) throw httpError(400, "Email: enter a valid address");
  return s;
}

function checkPassword(v) {
  if (str(v).length < 8) throw httpError(400, "Password: at least 8 characters");
  return v;
}

// Login and resend-verification take `login`: an email or a username. Usernames can't contain "@"
// (USERNAME above), so an "@" means email. `email` is still accepted for clients that send it (mobile).
function loginFilter(b) {
  const s = lower(b.login ?? b.email);
  if (!s) return null;
  return s.includes("@") ? { email: s } : { username: s };
}

function checkToken(v) {
  if (!str(v)) throw httpError(400, "Token is required");
  return v;
}

// A failed send (SendGrid down, bad key, EMAIL_FROM unset) never fails the request (#65): register has
// already saved the user, who can retry with resend-verification; resend and forgot must answer the
// same whether or not the email exists, so an error there would reveal that it does.
async function trySend(send, to, token) {
  try {
    await send({ to, token });
  } catch (err) {
    console.error(`[email] send failed: ${err.message}`);
  }
}

async function register(req, res, next) {
  try {
    const b = readBody(req.body, ["firstName", "lastName", "username", "email", "password"]);
    const firstName = checkName(b.firstName, "First name");
    const lastName = checkName(b.lastName, "Last name");
    const username = checkUsername(b.username);
    const address = checkEmail(b.email);
    const password = checkPassword(b.password);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { token, hash } = newEmailToken();
    try {
      await User.create({
        firstName,
        lastName,
        username,
        email: address,
        passwordHash,
        isVerified: false,
        verificationTokenHash: hash,
        verificationTokenExpires: new Date(Date.now() + VERIFY_TTL_MS),
        resetTokenHash: null,
        resetTokenExpires: null,
        profile: null,
        preferences: DEFAULT_PREFERENCES,
      });
    } catch (err) {
      // The unique indexes on email and username are the real duplicate check (no race between find and insert).
      if (err.code === 11000) {
        throw httpError(409, err.keyPattern?.username ? "Username already taken" : "Email already registered");
      }
      throw err;
    }
    await trySend(email.sendVerificationEmail, address, token);
    res.status(201).json({ message: "Verification email sent" });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const b = readBody(req.body, ["login", "email", "password"]);
    const filter = loginFilter(b);
    const password = str(b.password);
    if (!filter || !password) throw httpError(400, "Email or username and password are required");

    const user = await User.findOne(filter).lean();
    // Password before isVerified, so 403 only ever answers correct credentials.
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) throw httpError(401, "Invalid email/username or password");
    if (!user.isVerified) throw httpError(403, "Email not verified");
    res.json({ token: signJwt(user._id), user: toUserJSON(user) });
  } catch (err) {
    next(err);
  }
}

// Tokens are single use: the lookup and the clearing happen in one atomic update.
async function verifyEmail(req, res, next) {
  try {
    const token = checkToken(req.query.token);
    const user = await User.findOneAndUpdate(
      { verificationTokenHash: hashToken(token), verificationTokenExpires: { $gt: new Date() } },
      { $set: { isVerified: true, verificationTokenHash: null, verificationTokenExpires: null } }
    );
    if (!user) throw httpError(400, "Invalid or expired token");
    res.json({ message: "Email verified" });
  } catch (err) {
    next(err);
  }
}

// Same reply whether or not the account exists (or is already verified), so accounts can't be probed.
// Takes a username too, so the login page can offer it after a 403 on a username login.
async function resendVerification(req, res, next) {
  try {
    const filter = loginFilter(readBody(req.body, ["login", "email"]));
    if (!filter) throw httpError(400, "Email or username is required");
    const { token, hash } = newEmailToken();
    const user = await User.findOneAndUpdate(
      { ...filter, isVerified: false },
      { $set: { verificationTokenHash: hash, verificationTokenExpires: new Date(Date.now() + VERIFY_TTL_MS) } }
    );
    if (user) await trySend(email.sendVerificationEmail, user.email, token);
    res.json({ message: "If that account exists, a verification link was sent" });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const address = lower(readBody(req.body, ["email"]).email);
    if (!address) throw httpError(400, "Email is required");
    const { token, hash } = newEmailToken();
    const user = await User.findOneAndUpdate(
      { email: address },
      { $set: { resetTokenHash: hash, resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) } }
    );
    if (user) await trySend(email.sendResetEmail, address, token);
    res.json({ message: "If that email exists, a reset link was sent" });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const b = readBody(req.body, ["token", "password"]);
    const token = checkToken(b.token);
    const passwordHash = await bcrypt.hash(checkPassword(b.password), BCRYPT_ROUNDS);
    const user = await User.findOneAndUpdate(
      { resetTokenHash: hashToken(token), resetTokenExpires: { $gt: new Date() } },
      { $set: { passwordHash, resetTokenHash: null, resetTokenExpires: null } }
    );
    if (!user) throw httpError(400, "Invalid or expired token");
    res.json({ message: "Password updated" });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, verifyEmail, resendVerification, forgotPassword, resetPassword };
