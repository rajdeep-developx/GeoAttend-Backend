const pool = require("../config/db");

async function findUserByEmailOrIdentifier(value) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1 OR identifier = $1 LIMIT 1`,
    [value]
  );
  return rows[0];
}

async function findUserByIdentifierAndEmail(identifier, email) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE identifier = $1 AND email = $2 LIMIT 1`,
    [identifier, email]
  );
  return rows[0];
}

// NEW: sirf roll no. se student dhoondo (admin manual check-in ke liye)
async function findUserByIdentifier(identifier) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, identifier
     FROM users
     WHERE identifier = $1 AND role = 'student'
     LIMIT 1`,
    [identifier]
  );
  return rows[0];
}

async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, identifier, is_verified, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0];
}

// Creates a not-yet-verified user the first time they request an OTP.
// role defaults to 'student' — admins are expected to be pre-seeded with role='admin'.
async function createPendingUser({ identifier, email, role = "student" }) {
  const { rows } = await pool.query(
    `INSERT INTO users (identifier, email, role, is_verified)
     VALUES ($1, $2, $3, FALSE)
     RETURNING *`,
    [identifier, email, role]
  );
  return rows[0];
}

async function setOtp(userId, otpHash, expiresAt) {
  await pool.query(
    `UPDATE users SET otp_hash = $1, otp_expires_at = $2 WHERE id = $3`,
    [otpHash, expiresAt, userId]
  );
}

async function clearOtpAndVerify(userId) {
  const { rows } = await pool.query(
    `UPDATE users SET otp_hash = NULL, otp_expires_at = NULL, is_verified = TRUE
     WHERE id = $1
     RETURNING id, name, email, role, identifier, is_verified, created_at`,
    [userId]
  );
  return rows[0];
}

async function listStudents() {
  const { rows } = await pool.query(
    `SELECT id, name, email, identifier FROM users WHERE role = 'student' ORDER BY identifier`
  );
  return rows;
}

async function setUserPassword(userId, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2
     RETURNING id`,
    [passwordHash, userId]
  );

  return rows[0];
}

async function findUserByLoginIdentifier(identifier) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, identifier,
            password_hash, is_verified, created_at
     FROM users
     WHERE identifier = $1
     LIMIT 1`,
    [identifier]
  );

  return rows[0];
}

module.exports = {
  findUserByEmailOrIdentifier,
  findUserByIdentifierAndEmail,
  findUserByIdentifier, // NEW
  findUserById,
  createPendingUser,
  setOtp,
  clearOtpAndVerify,
  listStudents,
  setUserPassword,
  findUserByLoginIdentifier,
};