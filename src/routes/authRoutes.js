
const express = require("express");
const {
  sendOtp,
  verifyOtp,
  loginWithPassword,
setupPassword,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Existing OTP routes — preserved
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// New password login route
router.post("/login", loginWithPassword);

router.post("/setup-password", setupPassword);

// Protected user profile route
router.get("/me", protect, getMe);

module.exports = router;
