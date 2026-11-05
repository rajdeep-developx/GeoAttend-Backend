const pool = require("../config/db");

async function checkSetupStatus(req, res) {
  try {
    const identifier = String(req.body.identifier || "").trim();

    if (!identifier) {
      return res.status(400).json({
        message: "Roll number is required.",
      });
    }

    const result = await pool.query(
      `SELECT password_hash
       FROM users
       WHERE identifier = $1
         AND role = 'student'
         AND is_verified = TRUE
       LIMIT 1`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        message: "Unable to verify this roll number.",
      });
    }

    if (user.password_hash) {
      return res.status(200).json({
        status: "completed",
        message: "Your password setup is already completed.",
      });
    }

    return res.status(200).json({
      status: "pending",
      message:
        "Password setup is pending. Please contact the GeoAttend developer to get your one-time setup code.",
    });
  } catch (error) {
    console.error("Setup status check failed:", error.message);

    return res.status(500).json({
      message: "Unable to check setup status right now.",
    });
  }
}

module.exports = { checkSetupStatus };