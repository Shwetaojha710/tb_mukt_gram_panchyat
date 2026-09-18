const express = require('express');
const ctrl = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/summary', authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'), ctrl.summary);
router.get('/rankings', authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'), ctrl.rankings);
router.get('/periods', authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'), ctrl.periods);
router.get('/export', authorize('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'), ctrl.exportExcel);

module.exports = router;
