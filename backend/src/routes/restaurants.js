const express = require("express");
const { nearby } = require("../controllers/restaurants");

const router = express.Router();

// TODO(#13): add the auth middleware here; the contract marks this endpoint auth: yes.
router.post("/nearby", nearby);

module.exports = router;
