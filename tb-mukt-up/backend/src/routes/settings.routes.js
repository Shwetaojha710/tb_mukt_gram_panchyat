const express = require('express');
const ctrl = require('../controllers/settings.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/tb-entry', ctrl.getTbEntrySettings);
router.put('/tb-entry', authorize('STATE'), ...ctrl.updateValidators, ctrl.updateTbEntrySettings);

module.exports = router;