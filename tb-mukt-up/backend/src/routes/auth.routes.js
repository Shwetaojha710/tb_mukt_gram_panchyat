const express = require('express');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.get('/user-types', ctrl.userTypes);
router.post('/register', ...ctrl.registerValidators, ctrl.register);
router.post('/login', ...ctrl.loginValidators, ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

const { authenticate } = require('../middleware/auth');
router.get('/me', authenticate, ctrl.me);

module.exports = router;
