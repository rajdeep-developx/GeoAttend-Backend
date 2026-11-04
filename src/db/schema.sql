-- =========================================================
-- GeoAttend Database Schema
-- =========================================================

-- =========================
-- USERS
-- =========================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120),                         -- NULL until the user's first verification
    email VARCHAR(160) UNIQUE NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'admin')),
    identifier VARCHAR(40) UNIQUE NOT NULL,    -- roll number / staff ID
    otp_hash TEXT,
    otp_expires_at TIMESTAMPTZ,
    password_hash TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- GEOFENCES
-- =========================
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 120,
    active_from TIME,
    active_to TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- ATTENDANCE
-- subject = timetable.json ka subject name
-- =========================
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL,
    subject VARCHAR(120) NOT NULL,
    method VARCHAR(10) NOT NULL
        CHECK (method IN ('gps', 'qr', 'face', 'manual')),
    status VARCHAR(10) NOT NULL
        CHECK (status IN ('present', 'late', 'absent')),
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- ADMIN CHECK-IN SETTINGS
-- Ek hi row (id = 1): admin kaunse methods on rakhta hai
-- =========================
CREATE TABLE IF NOT EXISTS checkin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    gps_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    qr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    face_enabled BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO checkin_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(checked_in_at);
CREATE INDEX IF NOT EXISTS idx_attendance_subject ON attendance(subject);

-- Private academic data: keep the source records out of GitHub.

CREATE TABLE IF NOT EXISTS student_sections (
    roll_number VARCHAR(40) PRIMARY KEY,
    section VARCHAR(80) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_sections_section
    ON student_sections(section);

CREATE TABLE IF NOT EXISTS timetable_slots (
    id BIGSERIAL PRIMARY KEY,
    section VARCHAR(80) NOT NULL,
    day VARCHAR(12) NOT NULL
        CHECK (day IN (
            'Monday', 'Tuesday', 'Wednesday',
            'Thursday', 'Friday', 'Saturday', 'Sunday'
        )),
    time VARCHAR(60) NOT NULL,
    subject VARCHAR(120) NOT NULL,
    room VARCHAR(80),
    teacher VARCHAR(160),
    UNIQUE (section, day, time, subject, room, teacher)
);

CREATE INDEX IF NOT EXISTS idx_timetable_section_day
    ON timetable_slots(section, day);

CREATE INDEX IF NOT EXISTS idx_timetable_teacher
    ON timetable_slots(teacher);

CREATE TABLE IF NOT EXISTS teacher_accounts (
    identity_key VARCHAR(320) PRIMARY KEY,
    teacher_name VARCHAR(160) NOT NULL
);