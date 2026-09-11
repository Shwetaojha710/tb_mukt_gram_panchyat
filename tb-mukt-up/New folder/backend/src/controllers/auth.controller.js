const authService = require('../services/auth.service');
const { validate, registerSchema, loginSchema } = require('../validators');
const Joi = require('joi');
const { AppError } = require('../middleware/errorHandler');

async function register(req, res, next) {
  try {
    const data = await authService.register(req.body);
    res.status(201).json({ success: true, message: 'Registration successful', data });
  } catch (err) {
    next(err);
  }
}
 
async function login(req, res, next) {
  try {
    const data = await authService.login(req.body);
    res.json({ success: true, message: 'Login successful', data });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const schema = Joi.object({
      mobile: Joi.string().allow('', null),
      email: Joi.string().email().allow('', null),
    }).or('mobile', 'email');
    const { error, value } = schema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const data = await authService.forgotPassword(value);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const schema = Joi.object({
      token: Joi.string().required(),
      newPassword: require('../validators').strongPassword.required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);
    const data = await authService.resetPassword(value);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ success: true, data: { user: req.user } });
}

async function userTypes(_req, res, next) {
  try {
    const userTypeService = require('../services/userType.service');
    const data = await userTypeService.listActiveUserTypes();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  me,
  userTypes,
  registerValidators: [validate(registerSchema)],
  loginValidators: [validate(loginSchema)],
};
