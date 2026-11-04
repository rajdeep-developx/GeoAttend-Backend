const express = require("express");

const {
  checkIn,
  myHistory,
  myAnalytics,
  myTimetable,

  // Admin
  roster,
  analytics,
  triggerLowAttendanceAlert,
  qrContext,
  manualMark, // NEW

  // QR
  generateQr,
} = require("../controllers/attendanceController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// ========================================
// STUDENT
// ========================================
router.post("/checkin", protect, checkIn);
router.get("/history", protect, myHistory);
router.get("/my-analytics", protect, myAnalytics);
router.get("/my-timetable", protect, myTimetable);

// ========================================
// ADMIN
// ========================================

// Teacher ki abhi ki class + sections + subject (QR auto-fill ke liye)
router.get("/qr/context", protect, adminOnly, qrContext);

// Generate classroom QR
router.post("/qr", protect, adminOnly, generateQr);

// Teacher ke students ka live roster
router.get("/roster", protect, adminOnly, roster);

// Manual present / absent (galti sudhaarne ke liye)  NEW
router.post("/manual", protect, adminOnly, manualMark);

router.get("/analytics", protect, adminOnly, analytics);
router.post("/alert-low", protect, adminOnly, triggerLowAttendanceAlert);

module.exports = router;