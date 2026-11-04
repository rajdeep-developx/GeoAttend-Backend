const { getCheckinSettings, updateCheckinSettings } = require("../models/settingsModel");

// GET /api/settings/checkin  (any logged-in user)
async function getSettings(req, res, next) {
  try {
    res.json({ methods: await getCheckinSettings() });
  } catch (err) {
    next(err);
  }
}

// PUT /api/settings/checkin  (admin) body: { gps, qr, face }
async function saveSettings(req, res, next) {
  try {
    const current = await getCheckinSettings();
    const { gps, qr, face } = req.body;
    const merged = {
      gps: gps ?? current.gps,
      qr: qr ?? current.qr,
      face: face ?? current.face,
    };
    res.json({ methods: await updateCheckinSettings(merged) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, saveSettings };