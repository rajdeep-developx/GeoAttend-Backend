const jwt = require("jsonwebtoken");

function generateAttendanceQr({
  subject,
  section,
  time,
  room,
}) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured in environment variables."
    );
  }

  const token = jwt.sign(
    {
      type: "attendance_qr",
      subject,
      section,
      time,
      room: room || null,
    },
    secret,
    {
      expiresIn: "2h",
    }
  );

  return token;
}

function verifyAttendanceQr(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured."
    );
  }

  const decoded = jwt.verify(
    token,
    secret
  );

  if (
    decoded.type !==
    "attendance_qr"
  ) {
    throw new Error(
      "Invalid attendance QR code."
    );
  }

  return decoded;
}

module.exports = {
  generateAttendanceQr,
  verifyAttendanceQr,
};