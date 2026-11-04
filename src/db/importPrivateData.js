
const pool = require("../config/db");

const timetable = require("../data/timetable.json");
const rollToSection = require("../data/rollToSection.json");
const { TEACHER_MAP } = require("../data/teacherMap.js");

const BATCH_SIZE = 300;

async function insertBatch(client, table, columns, rows) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowPlaceholders = row.map((value, colIndex) => {
        values.push(value);
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }
}

async function main() {
  if (!timetable || typeof timetable !== "object" ||
      !rollToSection || typeof rollToSection !== "object" ||
      !TEACHER_MAP || typeof TEACHER_MAP !== "object") {
    throw new Error("One or more private data files have an invalid format.");
  }

  const studentRows = Object.entries(rollToSection).map(
    ([roll, section]) => [String(roll).trim(), String(section).trim()]
  );

  const timetableRows = [];

  for (const [section, days] of Object.entries(timetable)) {
    for (const [day, slots] of Object.entries(days || {})) {
      if (!Array.isArray(slots)) {
        throw new Error(`Invalid timetable format for section ${section}.`);
      }

      for (const slot of slots) {
       if (!slot || !slot.time || !slot.subject) {
  throw new Error(
    `A timetable entry in section ${section} is missing required fields.`
  );
}
        timetableRows.push([
          String(section).trim(),
          day,
          String(slot.time).trim(),
          String(slot.subject).trim(),
          slot.room == null || slot.room === ""
            ? null
            : String(slot.room).trim(),
          null
        ]);
      }
    }
  }

  const teacherRows = Object.entries(TEACHER_MAP).map(
    ([identity, name]) => [
      String(identity).trim().toLowerCase(),
      String(name).trim()
    ]
  );

  if (
    studentRows.some(row => !row[0] || !row[1]) ||
    teacherRows.some(row => !row[0] || !row[1])
  ) {
    throw new Error("Private data contains an empty required value.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // These are dedicated academic-data tables only.
    // Do not delete users or attendance records.
    await client.query("DELETE FROM timetable_slots");
    await client.query("DELETE FROM student_sections");
    await client.query("DELETE FROM teacher_accounts");

    await insertBatch(
      client,
      "student_sections",
      ["roll_number", "section"],
      studentRows
    );

    await insertBatch(
      client,
      "timetable_slots",
      ["section", "day", "time", "subject", "room", "teacher"],
      timetableRows
    );

    await insertBatch(
      client,
      "teacher_accounts",
      ["identity_key", "teacher_name"],
      teacherRows
    );

    await client.query("COMMIT");

    console.log("Private academic data imported successfully.");
    console.log(`Student-section records: ${studentRows.length}`);
    console.log(`Timetable records: ${timetableRows.length}`);
    console.log(`Teacher mapping records: ${teacherRows.length}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error("Private data import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
