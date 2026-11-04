
const pool = require("../config/db");

const norm = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const numSort = (a, b) =>
  String(a).localeCompare(String(b), undefined, { numeric: true });

const toMin = (t) => {
  if (!t) return null;

  const m = String(t)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!m) return null;

  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;

  return h * 60 + Number(m[2]);
};

const parseRange = (range) => {
  const parts = String(range || "").split(/\s*[–—-]\s*/);

  if (parts.length !== 2) return [null, null];

  return [toMin(parts[0]), toMin(parts[1])];
};

function nowIST() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type).value;

  return {
    day: get("weekday"),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

async function getTeacherSlots(teacherName) {
  const result = await pool.query(
    `SELECT section, day, time, subject, room, teacher
     FROM timetable_slots
     WHERE LOWER(TRIM(teacher)) = LOWER(TRIM($1))
     ORDER BY section, day, id`,
    [teacherName]
  );

  return result.rows.map((slot) => {
    const [start, end] = parseRange(slot.time);

    return {
      section: slot.section,
      day: slot.day,
      time: slot.time,
      start,
      end,
      subject: slot.subject,
      room: slot.room,
      teacher: slot.teacher,
    };
  });
}

async function getQrContext(teacherName) {
  const slots = await getTeacherSlots(teacherName);
  const { day, minutes } = nowIST();

  const today = slots
    .filter((slot) => slot.day === day)
    .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));

  const current =
    today.find(
      (slot) =>
        slot.start !== null &&
        slot.end !== null &&
        minutes >= slot.start &&
        minutes < slot.end
    ) || null;

  const next =
    today.find(
      (slot) => slot.start !== null && slot.start > minutes
    ) || null;

  const sectionSubject = {};

  slots.forEach((slot) => {
    if (!sectionSubject[slot.section]) {
      sectionSubject[slot.section] = slot.subject;
    }
  });

  return {
    teacher: teacherName,
    today: day,
    current,
    next,
    todaySlots: today,
    sections: Object.keys(sectionSubject).sort(numSort),
    sectionSubject,
  };
}

async function getStudentsForSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }

  const result = await pool.query(
    `SELECT roll_number AS "rollNo", section
     FROM student_sections
     WHERE section = ANY($1::varchar[])
     ORDER BY roll_number`,
    [sections]
  );

  return result.rows.sort((a, b) => numSort(a.rollNo, b.rollNo));
}

module.exports = {
  getTeacherSlots,
  getQrContext,
  getStudentsForSections,
};
