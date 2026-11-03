const express = require('express');
const ctrl = require('../controllers/newDashboard.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'));

router.get('/summary', ctrl.summary);
router.get('/drilldown', ctrl.drilldown);
router.get('/actions', ctrl.actions);
router.get('/export', ctrl.exportExcel);

module.exports = router;
