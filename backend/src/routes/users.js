const express = require("express");
const requireAuth = require("../middleware/auth");
const users = require("../controllers/users");

const router = express.Router();

router.use(requireAuth);
router.get("/me", users.getMe);
router.put("/me/profile", users.updateProfile);
router.put("/me/goal", users.updateGoal);
router.patch("/me/preferences", users.updatePreferences);
router.get("/me/calories", users.getCalories);

module.exports = router;
