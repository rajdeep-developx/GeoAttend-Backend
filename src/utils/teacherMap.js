
const pool = require("../config/db");

const key = (value) => String(value || "").trim().toLowerCase();

async function resolveTeacherName(user = {}) {
  const candidates = [
    user.email,
    user.identifier,
    user.adminId,
    user.admin_id,
    user.username,
    user.loginId,
  ]
    .map(key)
    .filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  const result = await pool.query(
    `SELECT teacher_name
     FROM teacher_accounts
     WHERE LOWER(TRIM(identity_key)) = ANY($1::text[])
     LIMIT 1`,
    [candidates]
  );

  return result.rows[0]?.teacher_name || null;
}

module.exports = { resolveTeacherName };
