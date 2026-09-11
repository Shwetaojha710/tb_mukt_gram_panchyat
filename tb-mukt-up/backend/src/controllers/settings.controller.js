const settingsService = require('../services/settings.service');
const { validate, tbEntrySettingsSchema } = require('../validators');

async function getTbEntrySettings(req, res, next) {
  try {
    const data = await settingsService.getEntrySettings();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function updateTbEntrySettings(req, res, next) {
  try {
    const data = await settingsService.updateEntrySettings(req.user, req.body);
    res.json({ success: true, message: 'Settings saved', data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTbEntrySettings,
  updateTbEntrySettings,
  updateValidators: [validate(tbEntrySettingsSchema)],
};