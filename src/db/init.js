// One-off script: creates tables and a starter campus geofence.
// Run with: npm run db:init
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Schema created (or already existed).");

  const { rows } = await pool.query("SELECT id FROM geofences LIMIT 1");
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO geofences (name, latitude, longitude, radius_meters, active_from, active_to)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["KIIT Campus 25", 20.36473779569759, 85.81734480417342, 100, null, null]
    );
    console.log("Seeded a default 'Main Campus' geofence — update its lat/lng for your real campus.");
  }

  await pool.end();
  console.log("Done.");
}

init().catch((err) => {
  console.error("DB init failed:", err);
  process.exit(1);
});
