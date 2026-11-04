const bcrypt = require("bcryptjs");

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

// Generates a 6-digit numeric OTP, e.g. "042917"
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

function getOtpExpiry() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
}

async function verifyOtpHash(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOtp, hashOtp, getOtpExpiry, verifyOtpHash, OTP_EXPIRY_MINUTES };
