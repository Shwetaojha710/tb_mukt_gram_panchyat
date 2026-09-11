const express = require('express');
const ctrl = require('../controllers/tb.controller');
const { authenticate, authorize, EDIT_ROLES } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/entries', authorize(...EDIT_ROLES), ctrl.list);
router.get('/entry', authorize(...EDIT_ROLES), ctrl.getOne);
router.post('/preview', authorize(...EDIT_ROLES), ctrl.preview);
router.post('/draft', authorize(...EDIT_ROLES), ...ctrl.entryValidators, ctrl.saveDraft);
router.post('/submit', authorize(...EDIT_ROLES), ...ctrl.entryValidators, ctrl.submit);

module.exports = router;
