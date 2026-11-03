const express = require("express");
const requireAuth = require("../middleware/auth");
const { analyze } = require("../controllers/photoAnalyses");
const httpError = require("../utils/httpError");

const router = express.Router();

// Own parser with a 3 MiB limit (mounted before the global 100 kB one in app.js); auth first so
// anonymous uploads are never read.
router.post("/", requireAuth, express.json({ limit: "3mb" }), analyze);
router.use((err, req, res, next) => next(err.type === "entity.too.large" ? httpError(413, "Image too large") : err));

module.exports = router;
