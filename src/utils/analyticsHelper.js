
const pool = require("../config/db");

const SEMESTER_START = process.env.SEMESTER_START || "2026-08-01";

const key = (s) => String(s || "").trim().toLowerCase();

function toMinutes(t) {
  const m = String(t || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!m) return null;

  let h = Number(m[1]);

  if (h === 12) h = 0;
  if (m[3].toUpperCase() === "PM") h += 12;

  return h * 60 + Number(m[2]);
}

function weekdayOf(dateStr, style = "long") {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(
    "en-US",
    {
      weekday: style,
      timeZone: "UTC",
    }
  );
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function buildStudentAnalytics({
  section,
  rows,
  today,
  nowMin,
}) {
  // Load this section's timetable only once.
  const result = await pool.query(
    `SELECT time, subject, day
     FROM timetable_slots
     WHERE section = $1`,
    [section]
  );

  // Group timetable slots by weekday.
  const timetableByDay = new Map();

  for (const slot of result.rows) {
    const day = key(slot.day);

    if (!timetableByDay.has(day)) {
      timetableByDay.set(day, []);
    }

    timetableByDay.get(day).push(slot);
  }

  // Build a set of subjects attended by this student on each date.
  const presentSet = new Set(
    rows
      .filter((r) => key(r.status) === "present")
      .map(
        (r) =>
          `${String(r.date).slice(0, 10)}|${key(r.subject)}`
      )
  );

  const perSubject = new Map();
  const daily = [];

  for (
    let d = SEMESTER_START;
    d <= today;
    d = addDays(d, 1)
  ) {
    const day = key(weekdayOf(d));
    const slots = timetableByDay.get(day) || [];
    const heldSubjects = new Map();

    for (const slot of slots) {
      // For today, count only classes whose start time has passed.
      if (d === today) {
        const start = toMinutes(
          String(slot.time || "").split(/\s*[–-]\s*/)[0]
        );

        if (start === null || start > nowMin) {
          continue;
        }
      }

      const subjectKey = key(slot.subject);

      if (subjectKey) {
        heldSubjects.set(subjectKey, slot.subject);
      }
    }

    if (heldSubjects.size === 0) {
      continue;
    }

    let dayPresent = 0;

    for (const [subjectKey, subjectName] of heldSubjects) {
      const entry = perSubject.get(subjectKey) || {
        cls: subjectName,
        held: 0,
        present: 0,
      };

      entry.held += 1;

      if (presentSet.has(`${d}|${subjectKey}`)) {
        entry.present += 1;
        dayPresent += 1;
      }

      perSubject.set(subjectKey, entry);
    }

    daily.push({
      date: d,
      held: heldSubjects.size,
      present: dayPresent,
    });
  }

  const subjects = [...perSubject.values()]
    .map((entry) => ({
      cls: entry.cls,
      pct: Math.round(
        (100 * entry.present) / entry.held
      ),
      present: entry.present,
      held: entry.held,
    }))
    .sort((a, b) => a.cls.localeCompare(b.cls));

  const cutoff = addDays(today, -6);

  const trend = daily
    .filter((entry) => entry.date >= cutoff)
    .map((entry) => ({
      date: entry.date,
      day: weekdayOf(entry.date, "short"),
      label: `${weekdayOf(entry.date, "short")} ${entry.date.slice(8)}`,
      pct: Math.round(
        (100 * entry.present) / entry.held
      ),
    }));

  return { subjects, trend };
}

module.exports = { buildStudentAnalytics };
