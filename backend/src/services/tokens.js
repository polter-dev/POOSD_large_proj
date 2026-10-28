const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Emailed verify/reset tokens: the raw token goes in the link, only its SHA-256 is stored.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newEmailToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

// Checked when used, not at startup, like EMAIL_FROM in services/email.js. No status, so it's a 500.
function jwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return process.env.JWT_SECRET;
}

// Payload { sub: userId }, 7-day expiry (docs/api-contract.md "Auth").
function signJwt(userId) {
  return jwt.sign({}, jwtSecret(), { subject: String(userId), expiresIn: "7d", algorithm: "HS256" });
}

// The userId from a valid token, or null if it's expired, tampered with or malformed.
// Only a missing JWT_SECRET throws, so callers can tell a server problem from a bad token.
function verifyJwt(token) {
  const secret = jwtSecret();
  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] }).sub ?? null;
  } catch {
    return null;
  }
}

module.exports = { hashToken, newEmailToken, signJwt, verifyJwt };
