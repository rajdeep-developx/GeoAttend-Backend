
const pool = require("../config/db");

// .env me SEMESTER_START=2026-08-01 daalna
const SEMESTER_START = process.env.SEMESTER_START || "2026-08-01";

const key = (s) => String(s || "").trim().toLowerCase();

function toMinutes(t) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  let h = Number(m[1]);
  if (h === 12) h = 0;
  if (m[3].toUpperCase() === "PM") h += 12;

  return h * 60 + Number(m[2]);
}

function weekdayOf(dateStr, style = "long") {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: style,
    timeZone: "UTC",
  });
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function subjectsHeldOn(section, dateStr, today, nowMin) {
  const day = weekdayOf(dateStr);

  const result = await pool.query(
    `SELECT time, subject
     FROM timetable_slots
     WHERE section = $1
       AND LOWER(day) = LOWER($2)`,
    [section, day]
  );

  const subjects = new Map();

  for (const c of result.rows) {
    if (dateStr === today) {
      const start = toMinutes(
        String(c.time || "").split(/\s*[–-]\s*/)[0]
      );

      if (start === null || start > nowMin) continue;
    }

    subjects.set(key(c.subject), c.subject);
  }

  return subjects;
}

async function buildStudentAnalytics({ section, rows, today, nowMin }) {
  const presentSet = new Set(
    rows
      .filter((r) => r.status === "present")
      .map((r) => `${String(r.date).slice(0, 10)}|${key(r.subject)}`)
  );

  const perSubject = new Map();
  const daily = [];

  for (
    let d = SEMESTER_START;
    d <= today;
    d = addDays(d, 1)
  ) {
    const held = await subjectsHeldOn(section, d, today, nowMin);

    if (!held.size) continue;

    let dayPresent = 0;

    for (const [k, name] of held) {
      const e = perSubject.get(k) || {
        cls: name,
        held: 0,
        present: 0,
      };

      e.held += 1;

      if (presentSet.has(`${d}|${k}`)) {
        e.present += 1;
        dayPresent += 1;
      }

      perSubject.set(k, e);
    }

    daily.push({
      date: d,
      held: held.size,
      present: dayPresent,
    });
  }

  const subjects = [...perSubject.values()]
    .map((e) => ({
      cls: e.cls,
      pct: Math.round((100 * e.present) / e.held),
      present: e.present,
      held: e.held,
    }))
    .sort((a, b) => a.cls.localeCompare(b.cls));

  const cutoff = addDays(today, -6);

  const trend = daily
    .filter((x) => x.date >= cutoff)
    .map((x) => ({
      date: x.date,
      day: weekdayOf(x.date, "short"),
      label: `${weekdayOf(x.date, "short")} ${x.date.slice(8)}`,
      pct: Math.round((100 * x.present) / x.held),
    }));

  return { subjects, trend };
}

module.exports = { buildStudentAnalytics };
