const locationService = require('../services/location.service');

async function districts(req, res, next) {
  try {
    // No parent — load all active districts
    const data = await locationService.fetchChildren('district');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function tehsils(req, res, next) {
  try {
    // Tehsil list comes from dbo.Block by district
    const data = await locationService.fetchChildren('tehsil', req.params.districtId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function blocks(req, res, next) {
  try {
    // Same as tehsil (Block table), for TB entry / dashboard filters
    const parentId = req.params.districtId || req.params.tehsilId;
    const data = await locationService.fetchChildren('block', parentId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function gps(req, res, next) {
  try {
    // GP under Block (selected Tehsil id is Block PK)
    const data = await locationService.fetchChildren('gp', req.params.blockId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function villages(req, res, next) {
  try {
    const data = await locationService.fetchChildren('village', req.params.gpId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function tbUnits(req, res, next) {
  try {
    const gpId = req.params.gpId;
    const blockId = req.query.blockId;
    const data = await locationService.fetchTbUnits({ gpId, blockId });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function context(req, res, next) {
  try {
    const data = await locationService.getContextBundle({
      districtId: req.query.districtId,
      tehsilId: req.query.tehsilId,
      blockId: req.query.blockId,
      gpId: req.query.gpId,
      villageId: req.query.villageId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function resolveBlock(req, res, next) {
  try {
    const data = await locationService.resolveFromBlock(req.params.blockId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  districts,
  tehsils,
  blocks,
  gps,
  villages,
  tbUnits,
  context,
  resolveBlock,
};
