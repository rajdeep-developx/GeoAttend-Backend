const pool = require("../config/db");

async function getCheckinSettings() {
  const { rows } = await pool.query(
    `SELECT gps_enabled, qr_enabled, face_enabled FROM checkin_settings WHERE id = 1`
  );
  const r = rows[0] || { gps_enabled: true, qr_enabled: true, face_enabled: false };
  return { gps: r.gps_enabled, qr: r.qr_enabled, face: r.face_enabled };
}

async function updateCheckinSettings({ gps, qr, face }) {
  await pool.query(
    `INSERT INTO checkin_settings (id, gps_enabled, qr_enabled, face_enabled)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
     SET gps_enabled = $1, qr_enabled = $2, face_enabled = $3`,
    [!!gps, !!qr, !!face]
  );
  return getCheckinSettings();
}

module.exports = { getCheckinSettings, updateCheckinSettings };