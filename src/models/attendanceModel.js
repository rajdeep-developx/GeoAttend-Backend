const pool = require("../config/db");

// ========================================
// RECORD ATTENDANCE
// ========================================

async function recordAttendance({
  userId,
  geofenceId,
  subject,
  method,
  status,
}) {
  const { rows } = await pool.query(
    `INSERT INTO attendance
      (user_id, geofence_id, subject, method, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      userId,
      geofenceId,
      subject,
      method,
      status,
    ]
  );

  return rows[0];
}


// ========================================
// CHECK DUPLICATE ATTENDANCE TODAY
// ========================================

async function hasCheckedInToday(userId, subject) {
  const { rows } = await pool.query(
    `SELECT id
     FROM attendance
     WHERE user_id = $1
       AND subject = $2
       AND (checked_in_at AT TIME ZONE 'Asia/Kolkata')::date =
           (NOW() AT TIME ZONE 'Asia/Kolkata')::date
     LIMIT 1`,
    [userId, subject]
  );

  return rows.length > 0;
}


// ========================================
// DELETE TODAY'S ATTENDANCE (ADMIN MANUAL UNDO)   NEW
// ========================================

async function deleteTodayAttendance(userId, subject) {
  const { rowCount } = await pool.query(
    `DELETE FROM attendance
     WHERE user_id = $1
       AND subject = $2
       AND (checked_in_at AT TIME ZONE 'Asia/Kolkata')::date =
           (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
    [userId, subject]
  );

  return rowCount;
}


// ========================================
// STUDENT ATTENDANCE HISTORY
// ========================================

async function getHistoryForUser(
  userId,
  { status } = {}
) {
  const params = [userId];

  let query = `
    SELECT
      id,
      subject,
      method,
      status,
      checked_in_at
    FROM attendance
    WHERE user_id = $1
  `;

  if (status && status !== "All") {
    params.push(status.toLowerCase());

    query += `
      AND status = $2
    `;
  }

  query += `
    ORDER BY checked_in_at DESC
  `;

  const { rows } = await pool.query(
    query,
    params
  );

  return rows;
}


// ========================================
// ADMIN TODAY ROSTER
// ========================================

async function getTodayRoster() {
  const { rows } = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.identifier,
      a.method,
      a.status,
      a.checked_in_at

    FROM users u

    LEFT JOIN attendance a
      ON a.user_id = u.id
      AND (
        a.checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )::date =
      (
        NOW() AT TIME ZONE 'Asia/Kolkata'
      )::date

    WHERE u.role = 'student'

    ORDER BY u.name
    `
  );

  return rows;
}


// ========================================
// ADMIN WEEKLY TREND
// ========================================

async function getWeeklyTrend() {
  const { rows } = await pool.query(
    `
    SELECT
      to_char(
        checked_in_at AT TIME ZONE 'Asia/Kolkata',
        'Dy'
      ) AS day,

      ROUND(
        100.0 *
        COUNT(*) FILTER (
          WHERE status = 'present'
        )
        /
        NULLIF(COUNT(*), 0)
      ) AS pct

    FROM attendance

    WHERE (
      checked_in_at AT TIME ZONE 'Asia/Kolkata'
    )::date >=
    (
      NOW() AT TIME ZONE 'Asia/Kolkata'
    )::date - 6

    GROUP BY
      day,
      date_trunc(
        'day',
        checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )

    ORDER BY
      date_trunc(
        'day',
        checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )
    `
  );

  return rows;
}


// ========================================
// ADMIN SUBJECT BREAKDOWN
// ========================================

async function getSubjectBreakdown() {
  const { rows } = await pool.query(
    `
    SELECT
      subject AS cls,

      ROUND(
        100.0 *
        COUNT(*) FILTER (
          WHERE status = 'present'
        )
        /
        NULLIF(COUNT(*), 0)
      ) AS pct

    FROM attendance

    GROUP BY subject

    ORDER BY subject
    `
  );

  return rows;
}


// ========================================
// ADMIN METHOD SPLIT
// ========================================

async function getMethodSplit() {
  const { rows } = await pool.query(
    `
    SELECT
      method AS name,
      COUNT(*) AS value

    FROM attendance

    GROUP BY method

    ORDER BY method
    `
  );

  return rows;
}


// =====================================================
// STUDENT ANALYTICS
// =====================================================


// ========================================
// STUDENT WEEKLY TREND
// ========================================

async function getMyWeeklyTrend(userId) {
  const { rows } = await pool.query(
    `
    SELECT
      to_char(
        checked_in_at AT TIME ZONE 'Asia/Kolkata',
        'Dy'
      ) AS day,

      ROUND(
        100.0 *
        COUNT(*) FILTER (
          WHERE status = 'present'
        )
        /
        NULLIF(COUNT(*), 0)
      ) AS pct

    FROM attendance

    WHERE user_id = $1

      AND (
        checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )::date >=
      (
        NOW() AT TIME ZONE 'Asia/Kolkata'
      )::date - 6

    GROUP BY
      day,
      date_trunc(
        'day',
        checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )

    ORDER BY
      date_trunc(
        'day',
        checked_in_at AT TIME ZONE 'Asia/Kolkata'
      )
    `,
    [userId]
  );

  return rows;
}


// ========================================
// STUDENT SUBJECT BREAKDOWN
// ========================================

async function getMySubjectBreakdown(userId) {
  const { rows } = await pool.query(
    `
    SELECT
      subject AS cls,

      ROUND(
        100.0 *
        COUNT(*) FILTER (
          WHERE status = 'present'
        )
        /
        NULLIF(COUNT(*), 0)
      ) AS pct

    FROM attendance

    WHERE user_id = $1

    GROUP BY subject

    ORDER BY subject
    `,
    [userId]
  );

  return rows;
}


// ========================================
// STUDENT METHOD SPLIT
// ========================================

async function getMyMethodSplit(userId) {
  const { rows } = await pool.query(
    `
    SELECT
      method AS name,
      COUNT(*) AS value

    FROM attendance

    WHERE user_id = $1

    GROUP BY method

    ORDER BY method
    `,
    [userId]
  );

  return rows;
}

async function getMyAttendanceRows(userId) {
  const { rows } = await pool.query(
    `SELECT
       subject,
       status,
       to_char(checked_in_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
     FROM attendance
     WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  recordAttendance,
  hasCheckedInToday,
  deleteTodayAttendance, // NEW
  getHistoryForUser,

  // Admin
  getTodayRoster,
  getWeeklyTrend,
  getSubjectBreakdown,
  getMethodSplit,

  // Student
  getMyWeeklyTrend,
  getMySubjectBreakdown,
  getMyMethodSplit,
  getMyAttendanceRows,
};