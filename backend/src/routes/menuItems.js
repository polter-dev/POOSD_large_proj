const express = require("express");
const { search } = require("../controllers/menuItems");

const router = express.Router();

router.get("/search", search);

module.exports = router;
