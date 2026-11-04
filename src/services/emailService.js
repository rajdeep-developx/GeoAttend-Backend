
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  if (!to) {
    throw new Error("Recipient email is missing.");
  }

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  const from =
    process.env.RESEND_FROM_EMAIL ||
    "GeoAttend <onboarding@resend.dev>";

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("Resend email failed:", error.message);
      throw new Error(error.message);
    }

    console.log("Email sent successfully to:", to);
    console.log("Resend message ID:", data?.id);

    return data;
  } catch (err) {
    console.error("Email send failed:", err.message);
    throw err;
  }
}

function sendWelcomeEmail(user) {
  return sendMail({
    to: user.email,
    subject: "Welcome to GeoAttend",
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Welcome to GeoAttend</h2>
        <p>Hi ${user.name},</p>
        <p>Your GeoAttend account has been created as a
          <b>${user.role}</b>.</p>
        <p>ID: <b>${user.identifier}</b></p>
        <p>You can now use GeoAttend for attendance.</p>
      </div>
    `,
  });
}

function sendLowAttendanceAlert(user, percentage) {
  return sendMail({
    to: user.email,
    subject: "GeoAttend - Attendance below threshold",
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Attendance Alert</h2>
        <p>Hi ${user.name},</p>
        <p>Your attendance has dropped to <b>${percentage}%</b>.</p>
        <p>This is below the required minimum attendance.</p>
        <p>Please check your attendance history in GeoAttend.</p>
      </div>
    `,
  });
}

function sendCheckInReceipt(user, subject, status) {
  return sendMail({
    to: user.email,
    subject: `GeoAttend - Checked in for ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Attendance Recorded</h2>
        <p>Hi ${user.name},</p>
        <p>Your attendance has been marked <b>${status}</b>.</p>
        <p>Subject: <b>${subject}</b></p>
        <p>Time: <b>${new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        })}</b></p>
      </div>
    `,
  });
}

function sendOtpEmail(email, otp, minutesValid) {
  return sendMail({
    to: email,
    subject: "GeoAttend - Your OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px;">
        <h2>GeoAttend Account Activation</h2>
        <p>Your one-time verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 25px 0;">
          ${otp}
        </div>
        <p>This OTP is valid for <b>${minutesValid} minutes</b>.</p>
        <p>If you did not request this code, you can safely ignore this email.</p>
        <hr />
        <p style="font-size: 12px; color: #777;">
          GeoAttend Attendance System
        </p>
      </div>
    `,
  });
}

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendLowAttendanceAlert,
  sendCheckInReceipt,
  sendOtpEmail,
};
