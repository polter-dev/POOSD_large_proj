const express = require("express");
const requireAuth = require("../middleware/auth");
const { nearby } = require("../controllers/restaurants");

const router = express.Router();

router.post("/nearby", requireAuth, nearby);

module.exports = router;
