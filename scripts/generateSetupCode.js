const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("../src/config/db");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  try {
    const identifier = await ask("Student roll number: ");

    if (!identifier) {
      throw new Error("Roll number is required.");
    }

    const result = await pool.query(
      `SELECT id, identifier, role, is_verified
       FROM users
       WHERE identifier = $1
       LIMIT 1`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user || user.role !== "student" || !user.is_verified) {
      throw new Error(
        "Verified student account not found. No setup code generated."
      );
    }

    const code = crypto.randomBytes(16).toString("hex");
    const tokenHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE users
       SET password_setup_token_hash = $1,
           password_setup_expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id]
    );

    console.log("\nSetup code generated successfully.");
    console.log("Roll number:", user.identifier);
    console.log("One-time setup code:", code);
    console.log("Expires at:", expiresAt.toISOString());
    console.log("\nShare this code privately with the student.");
    console.log("Generating another code will replace the previous code.");
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});