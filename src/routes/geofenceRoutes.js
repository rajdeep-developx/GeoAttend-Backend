const express = require("express");

const {
  addGeofence,
  listGeofences,
  verifyLocation
} = require("../controllers/geofenceController");

const {
  protect,
  adminOnly
} = require("../middleware/authMiddleware");

const router = express.Router();


// GET all geofences
router.get(
  "/",
  protect,
  listGeofences
);


// Admin creates geofence
router.post(
  "/",
  protect,
  adminOnly,
  addGeofence
);


// Student verifies current GPS location
router.post(
  "/verify",
  protect,
  verifyLocation
);


module.exports = router;