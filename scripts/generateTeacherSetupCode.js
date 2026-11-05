
const readline = require("readline");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../src/config/db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function generateTeacherSetupCode() {
  let client;

  try {
    const identifier = (await ask("Enter Teacher ID: ")).trim();

    if (!identifier) {
      throw new Error("Teacher ID is required.");
    }

    client = await pool.connect();

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, identifier, name, role, is_verified, password_hash
       FROM users
       WHERE identifier = $1
       FOR UPDATE`,
      [identifier]
    );

    const teacher = result.rows[0];

    if (!teacher || teacher.role !== "admin") {
      throw new Error("No Teacher account found with this ID.");
    }

    if (!teacher.is_verified) {
      throw new Error("Teacher account is not verified.");
    }

    if (teacher.password_hash) {
      throw new Error(
        "This Teacher already has a password. Use the password reset process instead."
      );
    }

    const setupCode = crypto.randomBytes(16).toString("hex");

    const setupCodeHash = await bcrypt.hash(setupCode, 12);

    await client.query(
      `UPDATE users
       SET password_setup_token_hash = $1,
           password_setup_expires_at = NOW() + INTERVAL '24 hours'
       WHERE id = $2`,
      [setupCodeHash, teacher.id]
    );

    await client.query("COMMIT");

    console.log("\n====================================");
    console.log("TEACHER SETUP CODE GENERATED");
    console.log("====================================");
    console.log("Teacher ID:", teacher.identifier);
    console.log("Teacher Name:", teacher.name || "Not available");
    console.log("\nONE-TIME SETUP CODE:");
    console.log(setupCode);
    console.log("\nValid for: 24 hours");
    console.log("====================================");
    console.log("Send this code privately to the Teacher.");
    console.log("Do not share it publicly.");
    console.log("====================================\n");
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("\nError:", error.message);
  } finally {
    if (client) {
      client.release();
    }

    rl.close();
    await pool.end();
  }
}

generateTeacherSetupCode();
