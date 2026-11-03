const express = require("express");
const requireAuth = require("../middleware/auth");
const mealLogs = require("../controllers/mealLogs");

const router = express.Router();

router.use(requireAuth);
router.get("/", mealLogs.list);
router.post("/", mealLogs.add);
router.patch("/:id", mealLogs.update);
router.delete("/:id", mealLogs.remove);

module.exports = router;
