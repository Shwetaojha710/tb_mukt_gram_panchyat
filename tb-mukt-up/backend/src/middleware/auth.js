const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(new AppError('Authentication required', 401));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
}

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    return next();
  };
}

/** Roles that can view/edit at block and below for data entry */
const EDIT_ROLES = ['STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK', 'GP', 'VILLAGE'];
const VIEW_ROLES = EDIT_ROLES;

function hasScope(id) {
  return id != null && id !== '' && Number.isFinite(Number(id)) && Number(id) > 0;
}

function canAccessLocation(user, loc = {}) {
  if (!user) return false;
  const role = String(user.role || 'STATE').toUpperCase();

  // State / super-admin style roles: full access
  if (role === 'STATE') return true;

  if (role === 'DIVISION') {
    // No assigned division in AdminLogin (0/null) => do not block entry
    if (!hasScope(user.divisionId)) return true;
    return !hasScope(loc.divisionId) || Number(loc.divisionId) === Number(user.divisionId);
  }

  if (role === 'DISTRICT') {
    if (!hasScope(user.districtId)) return true;
    return !hasScope(loc.districtId) || Number(loc.districtId) === Number(user.districtId);
  }

  // Tehsil list is sourced from dbo.Block — treat TEHSIL/BLOCK the same
  if (role === 'TEHSIL' || role === 'BLOCK') {
    const userScope = hasScope(user.blockId) ? user.blockId : user.tehsilId;
    if (!hasScope(userScope)) return true;
    const locScope = loc.blockId || loc.tehsilId;
    return !hasScope(locScope) || Number(locScope) === Number(userScope);
  }

  if (role === 'GP') {
    if (!hasScope(user.gpId)) return true;
    return !hasScope(loc.gpId) || Number(loc.gpId) === Number(user.gpId);
  }

  if (role === 'VILLAGE') {
    if (!hasScope(user.villageId)) return true;
    return !hasScope(loc.villageId) || Number(loc.villageId) === Number(user.villageId);
  }

  // Unknown role: allow authenticated users (AdminLogin may have custom types)
  return true;
}

function enforceGeography(req, _res, next) {
  const loc = {
    stateId: req.body.stateId || req.query.stateId || req.user.stateId,
    divisionId: req.body.divisionId || req.query.divisionId,
    districtId: req.body.districtId || req.query.districtId,
    tehsilId: req.body.tehsilId || req.query.tehsilId,
    blockId: req.body.blockId || req.query.blockId,
    gpId: req.body.gpId || req.query.gpId,
    villageId: req.body.villageId || req.query.villageId,
  };

  if (!canAccessLocation(req.user, loc)) {
    return next(new AppError('Access denied for selected geography', 403));
  }
  req.geoScope = buildGeoScope(req.user);
  return next();
}

function buildGeoScope(user) {
  const scope = { role: user.role };
  if (user.stateId) scope.stateId = user.stateId;
  if (user.divisionId) scope.divisionId = user.divisionId;
  if (user.districtId) scope.districtId = user.districtId;
  if (user.tehsilId) scope.tehsilId = user.tehsilId;
  if (user.blockId) scope.blockId = user.blockId;
  if (user.gpId) scope.gpId = user.gpId;
  if (user.villageId) scope.villageId = user.villageId;
  return scope;
}

module.exports = {
  authenticate,
  authorize,
  canAccessLocation,
  enforceGeography,
  buildGeoScope,
  EDIT_ROLES,
  VIEW_ROLES,
};
