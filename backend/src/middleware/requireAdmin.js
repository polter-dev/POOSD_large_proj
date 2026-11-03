const User = require("../models/User");
const httpError = require("../utils/httpError");

// Goes after requireAuth. Reads role from the database, not the JWT, so make-admin.js --revoke takes effect
// on the next request.
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId, { role: 1 }).lean();
    if (!user) throw httpError(404, "User not found"); // the token outlived a deleted account
    if (user.role !== "admin") throw httpError(403, "Admin only");
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAdmin;
