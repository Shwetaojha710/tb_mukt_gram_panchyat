const express = require('express');
const ctrl = require('../controllers/location.controller');

const router = express.Router();

// District → Tehsil(Block) → GP → Village
router.get('/districts', ctrl.districts);
router.get('/districts/:divisionId', ctrl.districts); // backward compatible (ignored)
router.get('/tehsils/:districtId', ctrl.tehsils);
router.get('/blocks/resolve/:blockId', ctrl.resolveBlock); // block → district ancestors
router.get('/blocks/:districtId', ctrl.blocks); // same Block source by district
router.get('/gps/:blockId', ctrl.gps);
router.get('/villages/:gpId', ctrl.villages);
router.get('/tb-units/:gpId', ctrl.tbUnits);
router.get('/context', ctrl.context);

module.exports = router;
