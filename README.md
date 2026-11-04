# GeoAttend — Backend

Cloud-Based Attendance Management System Using Geo-Fencing — REST API (Node.js + Express + PostgreSQL).

Covers: REST APIs, JWT authentication, attendance logic (geo-fence + QR + face check-in), email notifications, and PostgreSQL database integration.

## Run in VS Code

1. Open this folder in VS Code.
2. Make sure PostgreSQL is installed and running locally (or use a hosted DB like Neon/Supabase/Render).
3. Copy `.env.example` to `.env` and fill in your real values:
   ```
   cp .env.example .env
   ```
   At minimum set `DATABASE_URL` (or the `PG*` fields) and `JWT_SECRET`. Email fields are optional in dev — if left blank, email sending will just log an error and the request still succeeds.
4. Install dependencies:
   ```
   npm install
   ```
5. Create the database (if it doesn't exist yet), then initialize the schema:
   ```
   createdb geoattend        # or create it via your DB tool of choice
   npm run db:init
   ```
   This creates the `users`, `geofences`, and `attendance` tables and seeds one starter "Main Campus" geofence — edit its lat/lng in `src/db/init.js` (or via the API) to match your real campus.
6. Start the dev server:
   ```
   npm run dev
   ```
   API runs at `http://localhost:5000` by default. Check `GET /api/health` to confirm it's up.

## Folder structure

```
server.js                     app entry point, mounts routes
src/
  config/db.js                 PostgreSQL connection pool
  db/schema.sql                table definitions
  db/init.js                   run once to create tables + seed a geofence
  models/                      raw SQL queries per table
    userModel.js
    geofenceModel.js
    attendanceModel.js
  middleware/
    authMiddleware.js           JWT verification (protect) + role check (adminOnly)
    errorMiddleware.js          404 + centralized error handler
  utils/
    generateToken.js            JWT signing
    geoUtils.js                 haversine distance, geofence + late-check logic
  services/
    emailService.js             nodemailer — welcome email, check-in receipt, low-attendance alert
  controllers/
    authController.js           register / login / me
    geofenceController.js       admin creates/lists geofences
    attendanceController.js     check-in logic, history, roster, analytics
  routes/
    authRoutes.js
    geofenceRoutes.js
    attendanceRoutes.js
```

## API reference

All protected routes need `Authorization: Bearer <token>` (token comes back from register/login).

### Auth
| Method | Route | Access | Body |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{ name, email, password, role: "student"|"admin", identifier }` |
| POST | `/api/auth/login` | public | `{ identifier, password }` — identifier is email, roll number, or staff ID |
| GET | `/api/auth/me` | protected | — |

### Geofences
| Method | Route | Access | Body |
|---|---|---|---|
| GET | `/api/geofences` | protected | — |
| POST | `/api/geofences` | admin | `{ name, latitude, longitude, radiusMeters, activeFrom, activeTo }` |

### Attendance
| Method | Route | Access | Body / Query |
|---|---|---|---|
| POST | `/api/attendance/checkin` | protected (student) | `{ subject, method: "gps"|"qr"|"face", geofenceId, latitude, longitude }` — lat/lng only required for `gps` |
| GET | `/api/attendance/history?status=Present\|Late\|Absent` | protected | own history only |
| GET | `/api/attendance/roster` | admin | today's live roster, every student |
| GET | `/api/attendance/analytics` | admin | weekly trend, per-subject %, method split — matches the frontend's Analytics charts |
| POST | `/api/attendance/alert-low` | admin | `{ userId, percentage }` — sends an email if below `LOW_ATTENDANCE_THRESHOLD_PERCENT` |

## How the geo-fence check-in decides present vs late vs rejected

1. Looks up the geofence (by `geofenceId`, or the first one configured).
2. For `method: "gps"` — computes the haversine distance between the submitted lat/lng and the geofence center. Outside `radius_meters` → request is rejected (403) with the distance in the message.
3. For `method: "qr"` or `"face"` — treated as already verified on the device/frontend, so the distance check is skipped (these are the fallback paths for low-GPS-signal rooms).
4. If the current time is past the geofence's `active_from` + a 15-minute grace period, status is `"late"` instead of `"present"`.
5. One check-in per student per subject per day is enforced (`409 Conflict` on a repeat).

## Next steps

- Connect the frontend's `src/data/mock.js` reads to these endpoints (`/api/attendance/roster`, `/api/attendance/history`, `/api/attendance/analytics`) once both are running.
- Wire the frontend `Login.jsx` `handleSubmit` to `POST /api/auth/login` and store the returned JWT.
- For face recognition, the actual face-match should happen in a separate service/model (Member 4's smart-features work) — this backend just accepts `method: "face"` as an already-verified signal and logs it.
- Deploy: set real `DATABASE_URL`, `JWT_SECRET`, and SMTP credentials as environment variables on your host (Render/Railway/EC2), then `npm start`.
