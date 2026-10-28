const express = require("express");
const auth = require("../controllers/auth");

const router = express.Router();

router.post("/register", auth.register);
router.post("/login", auth.login);
router.get("/verify-email", auth.verifyEmail);
router.post("/resend-verification", auth.resendVerification);
router.post("/forgot-password", auth.forgotPassword);
router.post("/reset-password", auth.resetPassword);

module.exports = router;
