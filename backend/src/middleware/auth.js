const httpError = require("../utils/httpError");
const { verifyJwt } = require("../services/tokens");

// Protected routes: needs "Authorization: Bearer <JWT>", sets req.userId, otherwise a 401.
function requireAuth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get("Authorization") || "");
  if (!match) return next(httpError(401, "Not logged in"));
  let userId;
  try {
    userId = verifyJwt(match[1]);
  } catch (err) {
    return next(err); // JWT_SECRET not set: 500
  }
  // We only sign Mongo ids, so anything else is a forged or foreign token.
  if (!/^[0-9a-f]{24}$/.test(userId || "")) return next(httpError(401, "Invalid or expired session"));
  req.userId = userId;
  next();
}

module.exports = requireAuth;
