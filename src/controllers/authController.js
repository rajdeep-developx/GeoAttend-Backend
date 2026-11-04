
const {
  findUserByEmailOrIdentifier,
  findUserByIdentifierAndEmail,
  findUserById,
  createPendingUser,
  setOtp,
  clearOtpAndVerify,
  findUserByLoginIdentifier,
} = require("../models/userModel");

const generateToken = require("../utils/generateToken");
const bcrypt = require("bcryptjs");

const {
  generateOtp,
  hashOtp,
  getOtpExpiry,
  verifyOtpHash,
  OTP_EXPIRY_MINUTES,
} = require("../utils/otp");

const { sendOtpEmail } = require("../services/emailService");
const pool = require("../config/db");

const COLLEGE_EMAIL_DOMAIN = process.env.COLLEGE_EMAIL_DOMAIN || "";

function isCollegeEmail(email) {
  if (!COLLEGE_EMAIL_DOMAIN) return true;

  return email
    .toLowerCase()
    .endsWith(`@${COLLEGE_EMAIL_DOMAIN.toLowerCase()}`);
}

// POST /api/auth/send-otp
// Body: { identifier, email, role? }
async function sendOtp(req, res, next) {
  try {
    const { identifier, email, role } = req.body;

    if (!identifier || !email) {
      return res.status(400).json({
        message: "Roll number and college email are required",
      });
    }

    if (
      typeof identifier !== "string" ||
      typeof email !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid identifier or email",
      });
    }

    const normalizedIdentifier = identifier.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      role !== "admin" &&
      !isCollegeEmail(normalizedEmail)
    ) {
      return res.status(400).json({
        message: `Please use your college email (@${COLLEGE_EMAIL_DOMAIN})`,
      });
    }

    let user = await findUserByIdentifierAndEmail(
      normalizedIdentifier,
      normalizedEmail
    );

    if (role === "admin" && (!user || user.role !== "admin")) {
      return res.status(403).json({
        message: "No admin account found for these details",
      });
    }

    if (role === "student" && user && user.role === "admin") {
      return res.status(403).json({
        message: "This is an admin account — use the Admin tab",
      });
    }

    if (!user) {
      const existingByIdentifier =
        await findUserByEmailOrIdentifier(normalizedIdentifier);

      const existingByEmail =
        await findUserByEmailOrIdentifier(normalizedEmail);

      if (existingByIdentifier || existingByEmail) {
        return res.status(409).json({
          message:
            "This roll number or email is already registered with different details",
        });
      }

      user = await createPendingUser({
        identifier: normalizedIdentifier,
        email: normalizedEmail,
        role: "student",
      });
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await setOtp(user.id, otpHash, getOtpExpiry());

    await sendOtpEmail(
      normalizedEmail,
      otp,
      OTP_EXPIRY_MINUTES
    );

    return res.json({
      message: `OTP sent to ${normalizedEmail}`,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp
// Body: { identifier, otp, name? }
async function verifyOtp(req, res, next) {
  try {
    const { identifier, otp, name } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        message: "Roll number and OTP are required",
      });
    }

    const user = await findUserByEmailOrIdentifier(
      String(identifier).trim()
    );

    if (!user || !user.otp_hash || !user.otp_expires_at) {
      return res.status(400).json({
        message:
          "No OTP was requested for this account — request a new one",
      });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({
        message: "OTP has expired — request a new one",
      });
    }

    const valid = await verifyOtpHash(otp, user.otp_hash);

    if (!valid) {
      return res.status(400).json({
        message: "Incorrect OTP",
      });
    }

    if (name && !user.name) {
      await pool.query(
        `UPDATE users SET name = $1 WHERE id = $2`,
        [String(name).trim(), user.id]
      );
    }

    const verifiedUser = await clearOtpAndVerify(user.id);

    return res.json({
      user: verifiedUser,
      token: generateToken(verifiedUser),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
// Body: { identifier, password }
async function loginWithPassword(req, res, next) {
  try {
    const { identifier, password } = req.body;

    if (
      typeof identifier !== "string" ||
      typeof password !== "string" ||
      !identifier.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Identifier and password are required",
      });
    }

    const user = await findUserByLoginIdentifier(
      identifier.trim()
    );

    if (!user || !user.password_hash || !user.is_verified) {
      return res.status(401).json({
        message: "Invalid identifier or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid identifier or password",
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      identifier: user.identifier,
      is_verified: user.is_verified,
      created_at: user.created_at,
    };

    return res.status(200).json({
      message: "Login successful",
      user: safeUser,
      token: generateToken(safeUser),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me (protected)
async function getMe(req, res, next) {
  try {
    const user = await findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  loginWithPassword,
  getMe,
};
