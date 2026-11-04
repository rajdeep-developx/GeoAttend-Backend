const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const { getGeofenceById, getAllGeofences } = require("../models/geofenceModel");

const {
  recordAttendance,
  hasCheckedInToday,
  getHistoryForUser,

  // Admin
  getTodayRoster,
  getWeeklyTrend,
  getSubjectBreakdown,
  getMethodSplit,
  deleteTodayAttendance, // NEW (model me add karna hai)

  // Student
  getMyWeeklyTrend,
  getMySubjectBreakdown,
  getMyMethodSplit,
  getMyAttendanceRows,
} = require("../models/attendanceModel");

const { findUserByIdentifier } = require("../models/userModel"); // NEW (model me add karna hai)

const { isWithinGeofence } = require("../utils/geoUtils");
const { generateAttendanceQr, verifyAttendanceQr } = require("../utils/attendanceQR");
const { sendCheckInReceipt, sendLowAttendanceAlert } = require("../services/emailService");
const { getCheckinSettings } = require("../models/settingsModel");
const { buildStudentAnalytics } = require("../utils/analyticsHelper");

const { resolveTeacherName } = require("../utils/teacherMap");
const {
  getQrContext,
  getStudentsForSections,
} = require("../utils/teacherSchedule");


const LOW_ATTENDANCE_THRESHOLD =
  Number(process.env.LOW_ATTENDANCE_THRESHOLD_PERCENT) || 75;

// =========================================================
// INDIA TIME
// =========================================================

function getIndiaDateTime() {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    day: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    date: `${values.year}-${values.month}-${values.day}`,
  };
}

// =========================================================
// TIME TO MINUTES
// =========================================================

function timeToMinutes(timeString) {
  if (!timeString) return null;

  const match = timeString.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;

  return hour * 60 + minute;
}

// =========================================================
// CHECK CURRENT CLASS
// =========================================================

function isCurrentClass(classItem, indiaTime) {
  if (!classItem?.time) return false;

  const parts = classItem.time.split(/\s+[–-]\s+/);
  if (parts.length !== 2) return false;

  const startMinutes = timeToMinutes(parts[0]);
  const endMinutes = timeToMinutes(parts[1]);
  if (startMinutes === null || endMinutes === null) return false;

  const currentMinutes = indiaTime.hour * 60 + indiaTime.minute;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// =========================================================
// GET CURRENT CLASS FOR STUDENT
// =========================================================

async function getCurrentClassForStudent(identifier) {
  const rollNumber = String(identifier || "").trim();

  if (!rollNumber) {
    return {
      error: "Student roll number is missing from your account.",
    };
  }

  const sectionResult = await pool.query(
    `SELECT section
     FROM student_sections
     WHERE roll_number = $1`,
    [rollNumber]
  );

  const section = sectionResult.rows[0]?.section;

  if (!section) {
    return {
      error: "No section found for your account.",
    };
  }

  const indiaTime = getIndiaDateTime();

  const timetableResult = await pool.query(
    `SELECT time, subject, room
     FROM timetable_slots
     WHERE section = $1
       AND LOWER(day) = LOWER($2)
     ORDER BY id`,
    [section, indiaTime.day]
  );

  const todayClasses = timetableResult.rows;

  if (!todayClasses.length) {
    return {
      error: `You have no classes scheduled today for Section ${section}.`,
      section,
      indiaTime,
    };
  }

  const currentClass = todayClasses.find((c) =>
    isCurrentClass(c, indiaTime)
  );

  if (!currentClass) {
    return {
      error:
        `Attendance is not available right now. ` +
        `There is no active class for Section ${section}.`,
      section,
      indiaTime,
    };
  }

  return { section, currentClass, indiaTime };
}

// =========================================================
// POST /api/attendance/checkin
// STUDENT CHECK-IN
// =========================================================

async function checkIn(req, res, next) {
  try {
    const { method, geofenceId, latitude, longitude, qrCode } = req.body;

    const userId = req.user.id;
    const identifier = req.user.identifier;

    if (!method) {
      return res.status(400).json({ message: "Attendance method is required." });
    }

    if (!["gps", "qr", "face"].includes(method)) {
      return res.status(400).json({ message: "method must be 'gps', 'qr' or 'face'." });
    }

    const enabled = await getCheckinSettings();

    if (!enabled[method]) {
      return res.status(403).json({
        message: `${method.toUpperCase()} check-in is disabled by the admin.`,
      });
    }

    const classInfo = await getCurrentClassForStudent(identifier);

    if (classInfo.error) {
      return res.status(403).json({
        message: classInfo.error,
        section: classInfo.section || null,
        indiaTime: classInfo.indiaTime || null,
      });
    }

    const { section, currentClass, indiaTime } = classInfo;
    const subject = currentClass.subject;

    const alreadyIn = await hasCheckedInToday(userId, subject);

    if (alreadyIn) {
      return res.status(409).json({
        message: `You have already marked attendance for ${subject} today.`,
        subject,
        section,
      });
    }

    // ---------- GPS VALIDATION ----------
    let geofence = null;

    if (method === "gps") {
      if (
        latitude === undefined ||
        longitude === undefined ||
        latitude === null ||
        longitude === null
      ) {
        return res.status(400).json({
          message: "Latitude and longitude are required for GPS check-in.",
        });
      }

      if (geofenceId) {
        geofence = await getGeofenceById(geofenceId);
      } else {
        const geofences = await getAllGeofences();
        geofence = geofences[0];
      }

      if (!geofence) {
        return res.status(400).json({
          message: "No geofence configured. Ask an admin to configure the campus location.",
        });
      }

      const { withinRadius, distance } = isWithinGeofence(latitude, longitude, geofence);

      if (!withinRadius) {
        return res.status(403).json({
          message:
            `You are ${distance}m away from the campus attendance zone. ` +
            `Maximum allowed distance is ${geofence.radius_meters}m.`,
          distance,
          allowedRadius: geofence.radius_meters,
        });
      }
    }

    // ---------- QR VALIDATION ----------
    if (method === "qr") {
      if (!qrCode) {
        return res.status(400).json({ message: "QR code is required." });
      }

      let qrData;

      try {
        qrData = verifyAttendanceQr(qrCode);
      } catch (error) {
        console.error("QR verification error:", error);
        return res.status(403).json({
          message: error.message || "Invalid or expired QR code.",
        });
      }

      const norm = (s) => String(s || "").trim().toLowerCase();

      if (norm(qrData.subject) !== norm(subject)) {
        return res.status(403).json({
          message: "This QR code is not for your current class.",
          qrSubject: qrData.subject,
          currentSubject: subject,
        });
      }

      if (qrData.section && norm(qrData.section) !== norm(section)) {
        return res.status(403).json({
          message: "This QR code is not for your section.",
        });
      }

      if (qrData.room && currentClass.room && qrData.room !== currentClass.room) {
        return res.status(403).json({
          message: "This QR code belongs to a different classroom.",
        });
      }
    }

    if (method === "face") {
      // Face verification can be connected later.
    }

    // ---------- SAVE ATTENDANCE ----------
    const status = "present";

    const record = await recordAttendance({
      userId,
      geofenceId: geofence?.id || null,
      subject,
      method,
      status,
    });

    try {
      await sendCheckInReceipt(req.user, subject, status);
    } catch (emailError) {
      console.error("Check-in receipt email failed:", emailError.message);
    }

    return res.status(201).json({
      message: "Attendance check-in successful.",
      attendance: record,
      class: {
        section,
        subject,
        time: currentClass.time,
        room: currentClass.room || null,
      },
      indiaTime:
        indiaTime.date +
        " " +
        String(indiaTime.hour).padStart(2, "0") +
        ":" +
        String(indiaTime.minute).padStart(2, "0"),
    });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// POST /api/attendance/manual                     (NEW)
// ADMIN: manual present / absent (galti sudhaarne ke liye)
// body: { identifier, section, status: "present" | "absent" }
// =========================================================

async function manualMark(req, res, next) {
  try {
    const { identifier, section, status } = req.body;

    const teacherName = await resolveTeacherName(req.user);
    if (!teacherName) {
      return res.status(403).json({
        message: "Is admin account ke liye teacher mapped nahi hai (teacherMap.js check karo).",
      });
    }

    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ message: "status 'present' ya 'absent' hona chahiye." });
    }

    const roll = String(identifier || "").trim();
    if (!roll) {
      return res.status(400).json({ message: "Student roll number required hai." });
    }

    const ctx = await getQrContext(teacherName);

    const sectionResult = await pool.query(
  `SELECT section
   FROM student_sections
   WHERE roll_number = $1`,
  [roll]
);

const studentSection = sectionResult.rows[0]?.section;

if (!studentSection || (section && studentSection !== section)) {
  return res.status(400).json({
    message: `Roll ${roll} is section ka student nahi hai.`,
  });
}

    if (!ctx.sections.includes(studentSection)) {
      return res.status(403).json({ message: `Section ${studentSection} aapke timetable me nahi hai.` });
    }

    // subject: us section ka subject (timetable se)
    const subject = ctx.sectionSubject?.[studentSection];
    if (!subject) {
      return res.status(400).json({ message: `Section ${studentSection} ka subject nahi mila.` });
    }

    // roll no. se user account dhoondo
    const user = await findUserByIdentifier(roll);
    if (!user) {
      return res.status(404).json({
        message: `Roll ${roll} ka account nahi bana hai. Pehle student ko sign up karna hoga.`,
      });
    }

    if (status === "present") {
      if (await hasCheckedInToday(user.id, subject)) {
        return res.status(409).json({ message: `Roll ${roll} already ${subject} me present hai.` });
      }

      const record = await recordAttendance({
        userId: user.id,
        geofenceId: null,
        subject,
        method: "manual",
        status: "present",
      });

      return res.status(201).json({ message: "Marked present.", attendance: record });
    }

    // absent: aaj ka record hata do
    await deleteTodayAttendance(user.id, subject);
    return res.json({ message: "Attendance removed." });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// GET /api/attendance/qr/context
// ADMIN: abhi ki class, sections, section -> subject
// =========================================================

async function qrContext(req, res, next) {
  try {
    const teacherName = await resolveTeacherName(req.user);

    if (!teacherName) {
      return res.status(403).json({
        message: "Is admin account ke liye teacher mapped nahi hai (teacherMap.js check karo).",
      });
    }

    const ctx = await getQrContext(teacherName);
return res.json(ctx);

  } catch (err) {
    next(err);
  }
}

// =========================================================
// POST /api/attendance/qr
// ADMIN GENERATES QR (khali ho to timetable se auto-fill)
// =========================================================

async function generateQr(req, res, next) {
  try {
    let { subject, section } = req.body;
    const { room, time } = req.body;

    const teacherName = await resolveTeacherName(req.user);
    const ctx = teacherName ? await getQrContext(teacherName) : null;

    if ((!subject || !section) && ctx) {
      const slot = ctx.current || ctx.next;
      if (slot) {
        section = section || slot.section;
        subject = subject || ctx.sectionSubject[section] || slot.subject;
      } else if (section) {
        subject = subject || ctx.sectionSubject[section];
      }
    }

    if (!subject) {
      return res.status(400).json({ message: "Subject is required." });
    }

    if (!section) {
      return res.status(400).json({ message: "Section is required." });
    }

    if (ctx && !ctx.sections.includes(section)) {
      return res.status(403).json({
        message: `Section ${section} aapke timetable me nahi hai.`,
      });
    }

    const qrCode = generateAttendanceQr({
      subject,
      section,
      room: room || null,
      time: time || null,
    });

    return res.status(201).json({
      success: true,
      message: "Attendance QR generated successfully.",
      qrCode,
      qr: {
        subject,
        section,
        room: room || null,
        time: time || null,
      },
    });
  } catch (err) {
    console.error("QR generation error:", err);
    next(err);
  }
}

// =========================================================
// GET /api/attendance/history
// =========================================================

async function myHistory(req, res, next) {
  try {
    const rows = await getHistoryForUser(req.user.id, {
      status: req.query.status,
    });

    return res.json({ history: rows });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// GET /api/attendance/my-analytics
// =========================================================


async function myAnalytics(req, res, next) {
  try {
    const userId = req.user.id;
    const rollNumber = String(req.user.identifier || "").trim();

const sectionResult = await pool.query(
  `SELECT section
   FROM student_sections
   WHERE roll_number = $1`,
  [rollNumber]
);

const section = sectionResult.rows[0]?.section;

    const [rows, methods] = await Promise.all([
      getMyAttendanceRows(userId),
      getMyMethodSplit(userId),
    ]);

    if (!section) {
      return res.json({ trend: [], subjects: [], methodSplit: methods, weekly: [], methods });
    }

    const t = getIndiaDateTime();
    const { trend, subjects } = await buildStudentAnalytics({
      section,
      rows,
      today: t.date,
      nowMin: t.hour * 60 + t.minute,
    });

    return res.json({
      trend,
      subjects,
      methodSplit: methods,
      weekly: trend,
      methods,
    });
  } catch (err) {
    console.error("Student analytics error:", err);
    next(err);
  }
}

// =========================================================
// GET /api/attendance/roster
// ADMIN: sirf us teacher ke sections ke saare students
// =========================================================

async function roster(req, res, next) {
  try {
    const teacherName = await resolveTeacherName(req.user);

    if (!teacherName) {
      return res.status(403).json({
        message: "Is admin account ke liye teacher mapped nahi hai (teacherMap.js check karo).",
      });
    }

    const { sections } = await getQrContext(teacherName);
    const students = await getStudentsForSections(sections);

    const todayRows = await getTodayRoster();
    const byRoll = new Map(
      (todayRows || []).map((r) => [String(r.identifier || "").trim(), r])
    );

    const rows = students.map((s) => {
      const r = byRoll.get(s.rollNo);
      return {
        name: r?.name || null,
        identifier: s.rollNo,
        section: s.section,
        method: r?.method || null,
        checked_in_at: r?.checked_in_at || null,
        status: r?.status || null,
      };
    });

    return res.json({ teacher: teacherName, sections, roster: rows });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// GET /api/attendance/analytics
// =========================================================

async function analytics(req, res, next) {
  try {
    const [trend, subjects, methodSplit] = await Promise.all([
      getWeeklyTrend(),
      getSubjectBreakdown(),
      getMethodSplit(),
    ]);

    return res.json({ trend, subjects, methodSplit });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// POST /api/attendance/alert-low
// =========================================================

async function triggerLowAttendanceAlert(req, res, next) {
  try {
    const { findUserById } = require("../models/userModel");
    const { userId, percentage } = req.body;

    if (userId === undefined || percentage === undefined) {
      return res.status(400).json({ message: "userId and percentage are required" });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const numericPercentage = Number(percentage);

    if (Number.isNaN(numericPercentage)) {
      return res.status(400).json({ message: "percentage must be a valid number" });
    }

    let sent = false;

    if (numericPercentage < LOW_ATTENDANCE_THRESHOLD) {
      await sendLowAttendanceAlert(user, numericPercentage);
      sent = true;
    }

    return res.json({
      message: `Alert evaluated against ${LOW_ATTENDANCE_THRESHOLD}% threshold`,
      sent,
    });
  } catch (err) {
    next(err);
  }
}

// =========================================================
// GET STUDENT WEEKLY TIMETABLE
// =========================================================

async function myTimetable(req, res, next) {
  try {
    const identifier = String(
      req.user?.identifier ||
      req.user?.roll_number ||
      req.user?.rollNumber ||
      ""
    ).trim();

    if (!identifier) {
      return res.status(400).json({
        message: "Student roll number is missing from your account.",
      });
    }

    const sectionResult = await pool.query(
      `SELECT section
       FROM student_sections
       WHERE roll_number = $1`,
      [identifier]
    );

    const section = sectionResult.rows[0]?.section;

    if (!section) {
      return res.status(404).json({
        message: "No section found for your account.",
      });
    }

    const timetableResult = await pool.query(
      `SELECT day, time, subject, room, teacher
       FROM timetable_slots
       WHERE section = $1
       ORDER BY
         CASE day
           WHEN 'Monday' THEN 1
           WHEN 'Tuesday' THEN 2
           WHEN 'Wednesday' THEN 3
           WHEN 'Thursday' THEN 4
           WHEN 'Friday' THEN 5
           WHEN 'Saturday' THEN 6
           WHEN 'Sunday' THEN 7
         END,
         id`,
      [section]
    );

    const timetable = {};

    for (const row of timetableResult.rows) {
      if (!timetable[row.day]) {
        timetable[row.day] = [];
      }

      timetable[row.day].push({
        time: row.time,
        subject: row.subject,
        room: row.room,
        teacher: row.teacher,
      });
    }

    return res.json({ section, timetable });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Student
  checkIn,
  myHistory,
  myAnalytics,
  myTimetable,

  // Admin
  roster,
  analytics,
  triggerLowAttendanceAlert,
  qrContext,
  manualMark, // NEW

  // QR
  generateQr,
};