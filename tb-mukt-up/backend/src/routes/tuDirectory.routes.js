const express = require('express');
const ctrl = require('../controllers/tuDirectory.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'));

router.get('/meta', ctrl.meta);
router.get('/summary', ctrl.summary);
router.get('/district', ctrl.districtDetail);

module.exports = router;