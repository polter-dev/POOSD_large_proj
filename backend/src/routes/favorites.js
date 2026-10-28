const express = require("express");
const requireAuth = require("../middleware/auth");
const favorites = require("../controllers/favorites");

const router = express.Router();

router.use(requireAuth);
router.get("/", favorites.list);
router.post("/", favorites.add);
router.delete("/:id", favorites.remove);

module.exports = router;
