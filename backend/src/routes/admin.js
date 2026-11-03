const express = require("express");
const requireAuth = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");
const admin = require("../controllers/admin");

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get("/submissions", admin.list);
router.patch("/submissions/:id", admin.review);

module.exports = router;
