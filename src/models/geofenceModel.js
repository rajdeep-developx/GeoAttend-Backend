
const pool = require("../config/db");

// Create a new geofence
async function createGeofence({
  name,
  latitude,
  longitude,
  radiusMeters,
  activeFrom,
  activeTo
}) {
  // Preserve the radius entered by the admin.
  // Use 120 only when radius is missing.
  const finalRadius =
    radiusMeters === undefined ||
    radiusMeters === null ||
    radiusMeters === ""
      ? 120
      : Number(radiusMeters);

  if (!Number.isFinite(finalRadius) || finalRadius <= 0) {
    throw new Error("Radius must be a positive number");
  }

  const { rows } = await pool.query(
    `INSERT INTO geofences
      (name, latitude, longitude, radius_meters, active_from, active_to)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      name,
      latitude,
      longitude,
      finalRadius,
      activeFrom || null,
      activeTo || null
    ]
  );

  return rows[0];
}

// Get all geofences
async function getAllGeofences() {
  const { rows } = await pool.query(
    `SELECT * FROM geofences ORDER BY id DESC`
  );

  return rows;
}

// Get a geofence by ID
async function getGeofenceById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM geofences WHERE id = $1`,
    [id]
  );

  return rows[0];
}

module.exports = {
  createGeofence,
  getAllGeofences,
  getGeofenceById
};
