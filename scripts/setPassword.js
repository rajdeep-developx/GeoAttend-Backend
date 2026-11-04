
const bcrypt = require("bcryptjs");
const readline = require("readline");
const pool = require("../src/config/db");

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error("Run this script directly in a terminal."));
      return;
    }

    const stdin = process.stdin;
    const stdout = process.stdout;
    let password = "";

    stdout.write(question);
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    function cleanup() {
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(false);
      stdout.write("\n");
    }

    function onKeypress(char, key) {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }

      if (key && key.name === "return") {
        cleanup();
        resolve(password);
        return;
      }

      if (key && key.name === "backspace") {
        password = password.slice(0, -1);
        return;
      }

      if (char && !key?.ctrl && !key?.meta) {
        password += char;
      }
    }

    stdin.on("keypress", onKeypress);
  });
}

async function main() {
  try {
    const identifier = (await ask("Account identifier: ")).trim();
    const password = await askHidden(
      "New password (minimum 12 characters; input hidden): "
    );

    if (!identifier || password.length < 12 || !password.trim()) {
      throw new Error(
        "Identifier required; password must be at least 12 characters."
      );
    }

    const result = await pool.query(
      `SELECT id, role, is_verified
       FROM users
       WHERE identifier = $1
       LIMIT 1`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user || !user.is_verified) {
      throw new Error(
        "Account not found or not verified. No password was changed."
      );
    }

    const confirmation = await ask(
      `Set password for verified ${user.role} account "${identifier}"? Type YES to confirm: `
    );

    if (confirmation.trim() !== "YES") {
      console.log("Cancelled. No password was changed.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    console.log("Password updated successfully.");
  } catch (error) {
    console.error("Password setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
