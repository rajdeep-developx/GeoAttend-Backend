const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getStudentSummary } = require("../utils/attendanceStats");

const router = express.Router();

// GET /api/summary/me  (student)
router.get("/me", protect, async (req, res, next) => {
  try {
    res.json(await getStudentSummary(req.user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;