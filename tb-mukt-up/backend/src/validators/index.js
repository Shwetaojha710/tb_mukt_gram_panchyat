const Joi = require('joi');
const { AppError } = require('../middleware/errorHandler');

const strongPassword = Joi.string()
  .min(8)
  .max(64)
  .pattern(/[A-Z]/)
  .pattern(/[a-z]/)
  .pattern(/[0-9]/)
  .pattern(/[^A-Za-z0-9]/)
  .messages({
    'string.pattern.base': 'Password must include upper, lower, number and special character',
  });

const registerSchema = Joi.object({
  fullName: Joi.string().min(2).max(150).required(),
  mobile: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(4).max(80).required(),
  password: strongPassword.required(),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
  designation: Joi.string().max(120).allow('', null),
  role: Joi.string().valid('STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK', 'GP', 'VILLAGE'),
  stateId: Joi.number().integer().allow(null),
  divisionId: Joi.number().integer().allow(null),
  districtId: Joi.number().integer().required(),
  tehsilId: Joi.number().integer().required(),
  blockId: Joi.number().integer().allow(null),
  gpId: Joi.number().integer().required(),
  villageId: Joi.number().integer().allow(null),
});

const loginSchema = Joi.object({
  username: Joi.string().allow('', null),
  mobile: Joi.string().allow('', null),
  password: Joi.string().required(),
  userTypeId: Joi.number().integer().allow(null),
  stateId: Joi.number().integer().allow(null),
  divisionId: Joi.number().integer().allow(null),
  districtId: Joi.number().integer().allow(null),
  tehsilId: Joi.number().integer().allow(null),
  blockId: Joi.number().integer().allow(null),
  gpId: Joi.number().integer().allow(null),
  villageId: Joi.number().integer().allow(null),
}).or('username', 'mobile');

const tbEntrySchema = Joi.object({
  entryId: Joi.number().integer().allow(null),
  stateId: Joi.number().integer().allow(null),
  divisionId: Joi.number().integer().allow(null),
  districtId: Joi.number().integer().required(),
  tehsilId: Joi.number().integer().allow(null),
  blockId: Joi.number().integer().allow(null),
  gpId: Joi.number().integer().required(),
  villageId: Joi.number().integer().allow(null),
  gpPopulation: Joi.number().integer().min(0),
  reportingMonth: Joi.number().integer().min(1).max(12).required(),
  reportingYear: Joi.number().integer().min(2020).max(2100).required(),
  // Digit limits are soft UI warnings only — do not reject save
  testedNaat: Joi.number().integer().min(0).required(),
  tbDiagnosed: Joi.number().integer().min(0).required(),
  prevYearSuccessTreatment: Joi.number().min(0).max(100).required(),
  previousYearCases: Joi.number().min(0).allow(null),
  treatmentSuccessPct: Joi.number().min(0).max(100).allow(null),
  poshanEligible: Joi.number().integer().min(0).required(),
  poshanReceived: Joi.number().integer().min(0).required(),
}).or('blockId', 'tehsilId');

const tbEntrySettingsSchema = Joi.object({
  reportingMonthsBack: Joi.number().integer().min(1).max(24).required(),
  submitDeadlineDay: Joi.number().integer().min(1).max(28).required(),
  editDeadlineDay: Joi.number().integer().min(1).max(28).required(),
});

function validate(schema) {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(
        new AppError('Validation failed', 400, error.details.map((d) => d.message))
      );
    }
    req.body = value;
    return next();
  };
}

module.exports = {
  registerSchema,
  loginSchema,
  tbEntrySchema,
  tbEntrySettingsSchema,
  validate,
  strongPassword,
};
