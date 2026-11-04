const {
  findUserByEmailOrIdentifier,
  findUserByIdentifierAndEmail,
  findUserById,
  createPendingUser,
  setOtp,
  clearOtpAndVerify,
} = require("../models/userModel");
const generateToken = require("../utils/generateToken");
const { generateOtp, hashOtp, getOtpExpiry, verifyOtpHash, OTP_EXPIRY_MINUTES } = require("../utils/otp");
const { sendOtpEmail } = require("../services/emailService");
const pool = require("../config/db");

const COLLEGE_EMAIL_DOMAIN = process.env.COLLEGE_EMAIL_DOMAIN || ""; // e.g. "kiit.ac.in" — leave blank to allow any domain

function isCollegeEmail(email) {
  if (!COLLEGE_EMAIL_DOMAIN) return true;
  return email.toLowerCase().endsWith(`@${COLLEGE_EMAIL_DOMAIN.toLowerCase()}`);
}

// POST /api/auth/send-otp
// body: { identifier, email, role? }
async function sendOtp(req, res, next) {
  try {
    const { identifier, email, role } = req.body;

    if (!identifier || !email) {
      return res.status(400).json({ message: "Roll number and college email are required" });
    }
    if (role !== "admin" && !isCollegeEmail(email)) {
  return res.status(400).json({ message: `Please use your college email (@${COLLEGE_EMAIL_DOMAIN})` });
}

    let user = await findUserByIdentifierAndEmail(identifier, email);

    // Role tab guards (Student / Admin tab on the login page)
    if (role === "admin" && (!user || user.role !== "admin")) {
      return res.status(403).json({ message: "No admin account found for these details" });
    }
    if (role === "student" && user && user.role === "admin") {
      return res.status(403).json({ message: "This is an admin account — use the Admin tab" });
    }

    // First time this roll number + email combo is seen — create a pending student account.
    if (!user) {
      const existingByEmailOrId = await findUserByEmailOrIdentifier(identifier);
      const existingByEmail = await findUserByEmailOrIdentifier(email);
      if (existingByEmailOrId || existingByEmail) {
        return res.status(409).json({ message: "This roll number or email is already registered with different details" });
      }
      user = await createPendingUser({ identifier, email, role: "student" });
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    await setOtp(user.id, otpHash, getOtpExpiry());

    await sendOtpEmail(email, otp, OTP_EXPIRY_MINUTES);

    res.json({ message: `OTP sent to ${email}`, expiresInMinutes: OTP_EXPIRY_MINUTES });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp
// body: { identifier, otp, name? }
async function verifyOtp(req, res, next) {
  try {
    const { identifier, otp, name } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ message: "Roll number and OTP are required" });
    }

    const user = await findUserByEmailOrIdentifier(identifier);
    if (!user || !user.otp_hash || !user.otp_expires_at) {
      return res.status(400).json({ message: "No OTP was requested for this account — request a new one" });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: "OTP has expired — request a new one" });
    }

    const valid = await verifyOtpHash(otp, user.otp_hash);
    if (!valid) {
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    if (name && !user.name) {
      await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, user.id]);
    }

    const verifiedUser = await clearOtpAndVerify(user.id);
    res.json({ user: verifiedUser, token: generateToken(verifiedUser) });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  (protected)
async function getMe(req, res, next) {
  try {
    const user = await findUserById(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendOtp, verifyOtp, getMe };