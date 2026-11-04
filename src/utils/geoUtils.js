// Haversine formula — distance between two lat/lng points, in meters.
function distanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius, meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isWithinGeofence(userLat, userLng, geofence) {
  const distance = distanceInMeters(userLat, userLng, geofence.latitude, geofence.longitude);
  return { withinRadius: distance <= geofence.radius_meters, distance: Math.round(distance) };
}

// Compares current time (HH:MM) against a geofence's active window to flag "late".
function isLate(activeFrom, graceMinutes = 15) {
  if (!activeFrom) return false;
  const [h, m] = activeFrom.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const cutoff = new Date(start.getTime() + graceMinutes * 60000);
  return new Date() > cutoff;
}

module.exports = { distanceInMeters, isWithinGeofence, isLate };
