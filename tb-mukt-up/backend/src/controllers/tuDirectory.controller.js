const tuDirectory = require('../services/tuDirectory.service');

async function meta(req, res, next) {
  try {
    const data = await tuDirectory.getMeta(req.user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const data = await tuDirectory.getSummary(req.user, {
      year: req.query.year,
      q: req.query.q,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function districtDetail(req, res, next) {
  try {
    const data = await tuDirectory.getDistrictDetail(req.user, {
      year: req.query.year,
      district: req.query.district,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { meta, summary, districtDetail };
