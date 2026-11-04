
const pool = require("../config/db");

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const THRESHOLD =
  Number(process.env.LOW_ATTENDANCE_THRESHOLD_PERCENT) || 75;

// Optional holidays: "2026-10-12,2026-10-20"
const HOLIDAYS = new Set(
  (process.env.ATTENDANCE_HOLIDAYS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
);

// ---------- Current IST date and time ----------
function getIstNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

// ---------- Date helpers ----------
const toDate = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const toIso = (date) => date.toISOString().slice(0, 10);

function getStartDate(todayIso) {
  const configuredDate = process.env.ATTENDANCE_START_DATE;

  if (
    configuredDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(configuredDate)
  ) {
    return configuredDate;
  }

  // Default: previous 30 days
  const date = toDate(todayIso);
  date.setUTCDate(date.getUTCDate() - 30);

  return toIso(date);
}

// ---------- Time helpers ----------
function timeToMinutes(time) {
  const match = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) return null;

  let hour = Number(match[1]);

  if (hour === 12) hour = 0;
  if (match[3].toUpperCase() === "PM") hour += 12;

  return hour * 60 + Number(match[2]);
}

function classStartMinutes(range) {
  const parts = String(range || "").split(
    /\s*(?:â€“|–|—|-)\s*/
  );

  return parts.length === 2
    ? timeToMinutes(parts[0])
    : null;
}

// ---------- Classes held so far ----------
async function getHeldClasses(section) {
  if (!section) return [];

  const result = await pool.query(
    `SELECT day, time, subject
     FROM timetable_slots
     WHERE section = $1
     ORDER BY id`,
    [section]
  );

  const weekly = {};

  for (const slot of result.rows) {
    const day = DAYS.find(
      (name) => name.toLowerCase() ===
        String(slot.day || "").trim().toLowerCase()
    );

    if (!day) continue;

    if (!weekly[day]) weekly[day] = [];

    weekly[day].push(slot);
  }

  const now = getIstNow();
  const start = toDate(getStartDate(now.date));
  const end = toDate(now.date);

  // One class per date and subject
  const held = new Map();

  for (
    let dateCursor = new Date(start);
    dateCursor <= end;
    dateCursor.setUTCDate(dateCursor.getUTCDate() + 1)
  ) {
    const date = toIso(dateCursor);

    if (HOLIDAYS.has(date)) continue;

    const day = DAYS[dateCursor.getUTCDay()];
    const dailySlots = weekly[day] || [];

    for (const slot of dailySlots) {
      if (!slot.subject) continue;

      // Don't count today's classes that haven't started yet
      if (date === now.date) {
        const startMinutes = classStartMinutes(slot.time);

        if (
          startMinutes === null ||
          startMinutes > now.minutes
        ) {
          continue;
        }
      }

      held.set(`${date}|${slot.subject}`, {
        date,
        subject: slot.subject,
      });
    }
  }

  return [...held.values()];
}

// ---------- Student attendance records ----------
async function getAttendedKeys(userId) {
  const { rows } = await pool.query(
    `SELECT
       subject,
       to_char(
         checked_in_at::timestamptz AT TIME ZONE 'Asia/Kolkata',
         'YYYY-MM-DD'
       ) AS day
     FROM attendance
     WHERE user_id = $1
       AND status IN ('present', 'late')`,
    [userId]
  );

  return new Set(
    rows.map((row) => `${row.day}|${row.subject}`)
  );
}

// ---------- Student attendance summary ----------
async function getStudentSummary(user) {
  const rollNumber = String(user.identifier || "").trim();
  const startDate = getStartDate(getIstNow().date);

  const sectionResult = await pool.query(
    `SELECT section
     FROM student_sections
     WHERE roll_number = $1`,
    [rollNumber]
  );

  const section = sectionResult.rows[0]?.section || null;

  if (!section) {
    return {
      section: null,
      startDate,
      threshold: THRESHOLD,
      total: 0,
      attended: 0,
      percentage: null,
      belowThreshold: false,
      subjects: [],
    };
  }

  const held = await getHeldClasses(section);
  const attendedKeys = await getAttendedKeys(user.id);

  const bySubject = {};
  let attended = 0;

  for (const item of held) {
    if (!bySubject[item.subject]) {
      bySubject[item.subject] = {
        subject: item.subject,
        total: 0,
        attended: 0,
      };
    }

    bySubject[item.subject].total++;

    if (attendedKeys.has(`${item.date}|${item.subject}`)) {
      bySubject[item.subject].attended++;
      attended++;
    }
  }

  const total = held.length;
  const percentage = total
    ? Math.round((attended / total) * 100)
    : null;

  return {
    section,
    startDate,
    threshold: THRESHOLD,
    total,
    attended,
    percentage,
    belowThreshold:
      total > 0 && percentage < THRESHOLD,
    subjects: Object.values(bySubject)
      .map((subject) => ({
        ...subject,
        pct: Math.round(
          (subject.attended / subject.total) * 100
        ),
      }))
      .sort((a, b) =>
        a.subject.localeCompare(b.subject)
      ),
  };
}

module.exports = {
  getStudentSummary,
  getHeldClasses,
};
