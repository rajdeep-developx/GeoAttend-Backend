const express = require("express");
const { getSettings, saveSettings } = require("../controllers/settingsController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/checkin", protect, getSettings);
router.put("/checkin", protect, adminOnly, saveSettings);

module.exports = router;