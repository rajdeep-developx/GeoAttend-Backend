require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { notFound, errorHandler } = require("./src/middleware/errorMiddleware");
const authRoutes = require("./src/routes/authRoutes");
const attendanceRoutes = require("./src/routes/attendanceRoutes");
const geofenceRoutes = require("./src/routes/geofenceRoutes");
const settingsRoutes = require("./src/routes/settingsRoutes");
const summaryRoutes = require("./src/routes/summaryRoutes");

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "GeoAttend API" }));

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/geofences", geofenceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/summary", summaryRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`GeoAttend API running on http://localhost:${PORT}`));