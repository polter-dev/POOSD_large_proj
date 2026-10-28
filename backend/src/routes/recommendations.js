const express = require("express");
const requireAuth = require("../middleware/auth");
const { recommend } = require("../controllers/recommendations");

const router = express.Router();

router.post("/", requireAuth, recommend);

module.exports = router;
