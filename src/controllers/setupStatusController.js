
const pool = require("../config/db");

async function checkSetupStatus(req, res) {
  try {
    const identifier = String(req.body.identifier || "").trim();

    if (!identifier) {
      return res.status(400).json({
        message: "Roll number is required.",
      });
    }

    // Step 1: Verify roll number from academic student records
    const studentResult = await pool.query(
      `SELECT roll_number
       FROM student_sections
       WHERE TRIM(roll_number) = $1
       LIMIT 1`,
      [identifier]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        message: "Unable to verify this roll number.",
      });
    }

    // Step 2: Find the student's GeoAttend account
    const userResult = await pool.query(
      `SELECT password_hash, is_verified
       FROM users
       WHERE TRIM(identifier) = $1
         AND role = 'student'
       LIMIT 1`,
      [identifier]
    );

    const user = userResult.rows[0];

    // Valid academic roll number, but no account exists yet
    if (!user) {
      return res.status(200).json({
        status: "pending",
        message:
          "Password setup is pending. Please contact the GeoAttend developer to get your one-time setup code.",
      });
    }

    if (!user.is_verified) {
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
