
const {
  createGeofence,
  getAllGeofences
} = require("../models/geofenceModel");

// Calculate distance between two GPS coordinates in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;

  const toRadians = (degree) => (degree * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}

// POST /api/geofences
// Admin only
async function addGeofence(req, res, next) {
  try {
    const {
      name,
      latitude,
      longitude,
      radiusMeters,
      activeFrom,
      activeTo
    } = req.body;

    if (
      !name ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        message: "name, latitude and longitude are required"
      });
    }

    // Validate coordinates
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        message: "Invalid latitude or longitude"
      });
    }

    // Use the manually entered radius.
    // If no radius is supplied, default to 120 meters.
    const finalRadius =
      radiusMeters === undefined || radiusMeters === null ||
      radiusMeters === ""
        ? 120
        : Number(radiusMeters);

    if (
      !Number.isFinite(finalRadius) ||
      finalRadius <= 0
    ) {
      return res.status(400).json({
        message: "Radius must be a positive number"
      });
    }

    const geofence = await createGeofence({
      name,
      latitude: lat,
      longitude: lng,
      radiusMeters: finalRadius,
      activeFrom,
      activeTo
    });

    return res.status(201).json({
      geofence
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/geofences
// Protected
async function listGeofences(req, res, next) {
  try {
    const geofences = await getAllGeofences();

    return res.json({
      geofences
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/geofences/verify
// Protected — student GPS check-in
async function verifyLocation(req, res, next) {
  try {
    const { latitude, longitude } = req.body;

    if (
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        message: "Latitude and longitude are required"
      });
    }

    const userLat = Number(latitude);
    const userLng = Number(longitude);

    if (
      !Number.isFinite(userLat) ||
      userLat < -90 ||
      userLat > 90 ||
      !Number.isFinite(userLng) ||
      userLng < -180 ||
      userLng > 180
    ) {
      return res.status(400).json({
        message: "Invalid latitude or longitude"
      });
    }

    const geofences = await getAllGeofences();

    if (!geofences || geofences.length === 0) {
      return res.status(404).json({
        message: "No geofence configured"
      });
    }

    // Use the first configured geofence (existing behavior)
    const geofence = geofences[0];

    const fenceLat = Number(geofence.latitude);
    const fenceLng = Number(geofence.longitude);

    const radiusValue =
      geofence.radius_meters ?? geofence.radiusMeters;

    const radius =
      radiusValue === undefined || radiusValue === null
        ? 120
        : Number(radiusValue);

    if (
      !Number.isFinite(fenceLat) ||
      !Number.isFinite(fenceLng) ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      return res.status(500).json({
        message: "Geofence configuration is invalid"
      });
    }

    const distance = calculateDistance(
      userLat,
      userLng,
      fenceLat,
      fenceLng
    );

    const inside = distance <= radius;

    if (!inside) {
      return res.status(403).json({
        allowed: false,
        message: "You are outside the allowed attendance area",
        distance: Math.round(distance),
        allowedRadius: radius,
        geofence: {
          id: geofence.id,
          name: geofence.name
        }
      });
    }

    return res.json({
      allowed: true,
      message: "Location verified successfully",
      distance: Math.round(distance),
      allowedRadius: radius,
      geofence: {
        id: geofence.id,
        name: geofence.name
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addGeofence,
  listGeofences,
  verifyLocation
};
