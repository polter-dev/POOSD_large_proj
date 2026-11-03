const express = require("express");
const requireAuth = require("../middleware/auth");
const { getMealPlan } = require("../controllers/mealPlans");

const router = express.Router();

router.get("/", requireAuth, getMealPlan);

module.exports = router;
