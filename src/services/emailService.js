const nodemailer = require("nodemailer");

// =========================================================
// EMAIL TRANSPORTER
// =========================================================

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,

  // 465 = SSL
  // 587 = STARTTLS
  secure: Number(process.env.EMAIL_PORT) === 465,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


// =========================================================
// VERIFY EMAIL CONFIG
// =========================================================

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ EMAIL CONFIG ERROR:");
    console.error(error.message);
  } else {
    console.log("✅ Email server is ready");
  }
});


// =========================================================
// GENERIC SEND MAIL
// =========================================================

async function sendMail({ to, subject, html }) {
  if (!to) {
    throw new Error("Recipient email is missing.");
  }

  if (!process.env.EMAIL_USER) {
    throw new Error("EMAIL_USER is missing in .env");
  }

  if (!process.env.EMAIL_PASS) {
    throw new Error("EMAIL_PASS is missing in .env");
  }

  try {
    const info = await transporter.sendMail({
      from:
        process.env.EMAIL_FROM ||
        `"GeoAttend" <${process.env.EMAIL_USER}>`,

      to,

      subject,

      html,
    });

    console.log("✅ Email sent successfully");
    console.log("To:", to);
    console.log("Message ID:", info.messageId);

    return info;
  } catch (err) {
    console.error("❌ Email send failed:");
    console.error(err.message);

    // IMPORTANT:
    // Don't hide the error.
    throw err;
  }
}


// =========================================================
// WELCOME EMAIL
// =========================================================

function sendWelcomeEmail(user) {
  return sendMail({
    to: user.email,

    subject: "Welcome to GeoAttend",

    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Welcome to GeoAttend</h2>

        <p>Hi ${user.name},</p>

        <p>
          Your GeoAttend account has been created as a
          <b>${user.role}</b>.
        </p>

        <p>
          ID: <b>${user.identifier}</b>
        </p>

        <p>
          You can now use GeoAttend for attendance.
        </p>
      </div>
    `,
  });
}


// =========================================================
// LOW ATTENDANCE ALERT
// =========================================================

function sendLowAttendanceAlert(user, percentage) {
  return sendMail({
    to: user.email,

    subject:
      "GeoAttend — Attendance below threshold",

    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Attendance Alert</h2>

        <p>Hi ${user.name},</p>

        <p>
          Your attendance has dropped to
          <b>${percentage}%</b>.
        </p>

        <p>
          This is below the required minimum attendance.
        </p>

        <p>
          Please check your attendance history in GeoAttend.
        </p>
      </div>
    `,
  });
}


// =========================================================
// CHECK-IN RECEIPT
// =========================================================

function sendCheckInReceipt(
  user,
  subject,
  status
) {
  return sendMail({
    to: user.email,

    subject:
      `GeoAttend — Checked in for ${subject}`,

    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Attendance Recorded</h2>

        <p>Hi ${user.name},</p>

        <p>
          Your attendance has been marked
          <b>${status}</b>.
        </p>

        <p>
          Subject:
          <b>${subject}</b>
        </p>

        <p>
          Time:
          <b>
            ${new Date().toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
          </b>
        </p>
      </div>
    `,
  });
}


// =========================================================
// OTP EMAIL
// =========================================================

function sendOtpEmail(
  email,
  otp,
  minutesValid
) {
  return sendMail({
    to: email,

    subject:
      "GeoAttend — Your OTP",

    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 500px;
          margin: auto;
          padding: 20px;
        "
      >

        <h2>GeoAttend Account Activation</h2>

        <p>
          Your one-time verification code is:
        </p>

        <div
          style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 25px 0;
          "
        >
          ${otp}
        </div>

        <p>
          This OTP is valid for
          <b>${minutesValid} minutes</b>.
        </p>

        <p>
          If you did not request this code,
          you can safely ignore this email.
        </p>

        <hr />

        <p style="font-size: 12px; color: #777;">
          GeoAttend Attendance System
        </p>

      </div>
    `,
  });
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendLowAttendanceAlert,
  sendCheckInReceipt,
  sendOtpEmail,
};