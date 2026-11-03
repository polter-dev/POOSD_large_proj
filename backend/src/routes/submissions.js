const express = require("express");
const requireAuth = require("../middleware/auth");
const submissions = require("../controllers/submissions");

const router = express.Router();

router.use(requireAuth);
router.post("/", submissions.create);
router.get("/mine", submissions.mine);

module.exports = router;
