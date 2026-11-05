
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
  const client = await pool.connect();

  try {
    const identifier = (await ask("Student roll number: ")).trim();
    const email = (await ask("Manually verified college email: "))
      .trim()
      .toLowerCase();

    if (!identifier || !email) {
      throw new Error("Roll number and email are required.");
    }

    const emailDomain = (
      process.env.COLLEGE_EMAIL_DOMAIN || "kiit.ac.in"
    ).toLowerCase();

    if (!email.endsWith(`@${emailDomain}`)) {
      throw new Error(`Use a valid @${emailDomain} email address.`);
    }

    await client.query("BEGIN");

    // Confirm that the student exists in academic records.
    const sectionResult = await client.query(
      `SELECT roll_number
       FROM student_sections
       WHERE roll_number = $1
       LIMIT 1`,
      [identifier]
    );

    if (sectionResult.rowCount === 0) {
      throw new Error("Student roll number not found in academic records.");
    }

    // Find existing account.
    const userResult = await client.query(
      `SELECT id, identifier, email, role, is_verified, password_hash
       FROM users
       WHERE identifier = $1
       LIMIT 1
       FOR UPDATE`,
      [identifier]
    );

    let user = userResult.rows[0];

    if (user) {
      if (user.role !== "student") {
        throw new Error("This roll number does not belong to a student.");
      }

      if (user.email.toLowerCase() !== email) {
        throw new Error("Email does not match the existing account.");
      }

      if (user.password_hash) {
        throw new Error("This student has already set a password.");
      }

      // Developer has manually verified the sender's email.
      await client.query(
        `UPDATE users
         SET is_verified = TRUE,
             otp_hash = NULL,
             otp_expires_at = NULL
         WHERE id = $1`,
        [user.id]
      );
    } else {
      // Prevent an email already linked to another account.
      const emailResult = await client.query(
        `SELECT id
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email]
      );

      if (emailResult.rowCount > 0) {
        throw new Error("This email is already linked to another account.");
      }

      // Create account after manual developer verification.
      const newUser = await client.query(
        `INSERT INTO users
           (identifier, email, role, is_verified)
         VALUES ($1, $2, 'student', TRUE)
         RETURNING id, identifier`,
        [identifier, email]
      );

      user = newUser.rows[0];
    }

    // Generate a cryptographically random one-time code.
    const code = crypto.randomBytes(16).toString("hex");
    const tokenHash = await bcrypt.hash(code, 12);

    // Exactly 24 hours from generation.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const updated = await client.query(
      `UPDATE users
       SET password_setup_token_hash = $1,
           password_setup_expires_at = $2
       WHERE id = $3
         AND role = 'student'
         AND is_verified = TRUE
         AND password_hash IS NULL
       RETURNING identifier`,
      [tokenHash, expiresAt, user.id]
    );

    if (updated.rowCount !== 1) {
      throw new Error("Could not generate setup code.");
    }

    await client.query("COMMIT");

    console.log("\nSetup code generated successfully.");
    console.log("Roll number:", identifier);
    console.log("One-time setup code:", code);
    console.log("Expires at:", expiresAt.toISOString());
    console.log("\nSend this code privately to the verified student.");
    console.log("The code can be used only once.");
    console.log("Generating another code replaces the previous code.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    rl.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nError:", error.message);
  process.exitCode = 1;
});
