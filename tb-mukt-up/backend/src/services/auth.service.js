const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, sql } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

const ROLES = ['STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK', 'GP', 'VILLAGE'];

function inferRole(body) {
  if (body.role && ROLES.includes(body.role)) return body.role;
  if (body.villageId) return 'VILLAGE';
  if (body.gpId) return 'GP';
  if (body.blockId) return 'BLOCK';
  if (body.tehsilId) return 'TEHSIL';
  if (body.districtId) return 'DISTRICT';
  if (body.divisionId) return 'DIVISION';
  return 'STATE';
}

function signToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    stateId: user.state_id,
    divisionId: user.division_id,
    districtId: user.district_id,
    tehsilId: user.tehsil_id,
    blockId: user.block_id,
    gpId: user.gp_id,
    villageId: user.village_id,
    userTypeId: user.user_type_id || null,
    userTypeName: user.user_type_name || null,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    mobile: user.mobile,
    email: user.email,
    username: user.username,
    designation: user.designation,
    role: user.role,
    stateId: user.state_id,
    divisionId: user.division_id,
    districtId: user.district_id,
    tehsilId: user.tehsil_id,
    blockId: user.block_id,
    gpId: user.gp_id,
    villageId: user.village_id,
    userTypeId: user.user_type_id || null,
    userTypeName: user.user_type_name || null,
    // Optional names (filled by enrichUserWithNames)
    stateName: user.state_name || user.stateName || null,
    divisionName: user.division_name || user.divisionName || null,
    districtName: user.district_name || user.districtName || null,
    districtCode: user.district_code || user.districtCode || null,
    tehsilName: user.tehsil_name || user.tehsilName || null,
    tehsilCode: user.tehsil_code || user.tehsilCode || null,
    blockName: user.block_name || user.blockName || null,
    blockCode: user.block_code || user.blockCode || null,
    gpName: user.gp_name || user.gpName || null,
    gpCode: user.gp_code || user.gpCode || null,
    villageName: user.village_name || user.villageName || null,
    villageCode: user.village_code || user.villageCode || null,
  };
}

/**
 * Resolve location IDs → names/codes for login + /me responses.
 * Accepts either JWT-style camelCase or internal snake_case user objects.
 */
async function enrichUserWithNames(userLike = {}) {
  const locationService = require('./location.service');

  const stateId = nz(userLike.stateId ?? userLike.state_id);
  const divisionId = nz(userLike.divisionId ?? userLike.division_id);
  let districtId = nz(userLike.districtId ?? userLike.district_id);
  const blockId = nz(userLike.blockId ?? userLike.block_id ?? userLike.tehsilId ?? userLike.tehsil_id);
  const gpId = nz(userLike.gpId ?? userLike.gp_id);
  const villageId = nz(userLike.villageId ?? userLike.village_id);

  // If district missing but block known, resolve parent district
  if (!districtId && blockId) {
    try {
      const resolved = await locationService.resolveFromBlock(blockId);
      districtId = nz(resolved.districtId);
    } catch (_) {
      /* ignore */
    }
  }

  const [state, division, district, block, gp, village] = await Promise.all([
    stateId ? locationService.getById('state', stateId) : null,
    divisionId ? locationService.getById('division', divisionId) : null,
    districtId ? locationService.getById('district', districtId) : null,
    blockId ? locationService.getById('block', blockId) : null,
    gpId ? locationService.getById('gp', gpId) : null,
    villageId ? locationService.getById('village', villageId) : null,
  ]);

  return {
    ...userLike,
    // Keep both shapes so publicUser + JWT consumers work
    state_id: stateId,
    division_id: divisionId,
    district_id: districtId,
    tehsil_id: blockId,
    block_id: blockId,
    gp_id: gpId,
    village_id: villageId,
    stateId,
    divisionId,
    districtId,
    tehsilId: blockId,
    blockId,
    gpId,
    villageId,
    stateName: state?.name || null,
    divisionName: division?.name || null,
    districtName: district?.name || null,
    districtCode: district?.code || null,
    tehsilName: block?.name || null,
    tehsilCode: block?.code || null,
    blockName: block?.name || null,
    blockCode: block?.code || null,
    gpName: gp?.name || null,
    gpCode: gp?.code || null,
    villageName: village?.name || null,
    villageCode: village?.code || null,
  };
}

function nz(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function passwordsMatch(stored, provided) {
  const s = String(stored || '').trim();
  const p = String(provided || '').trim();
  if (!s || !p) return false;
  if (s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')) {
    return bcrypt.compare(p, s);
  }
  return s === p;
}

function mapAdminLoginRow(row) {
  const { mapUserTypeToRole } = require('./userType.service');
  const userTypeName = row.UserType || '';
  const fullName = [row.FirstName, row.LastName].filter(Boolean).join(' ').trim();
  return {
    id: row.Pk_AdminId,
    username: row.LoginId,
    full_name: fullName || row.LoginId,
    mobile: row.ProfileMobile || row.Mobile || null,
    email: row.Email || null,
    designation: userTypeName || null,
    role: mapUserTypeToRole(userTypeName),
    state_id: nz(row.StateCode),
    division_id: nz(row.DivisionCode) || nz(row.FacilityDivisionId),
    // Prefer Facility* IDs (match master PKs); fall back to Code fields
    district_id: nz(row.FacilityDistrictId) || nz(row.DistrictCode),
    tehsil_id: nz(row.FacilityTehsilId) || nz(row.TehsilCode),
    block_id: nz(row.FacilityBlockId) || nz(row.BlockCode),
    gp_id: nz(row.FacilityGrampanchayatId),
    village_id: nz(row.FacilityVillageId),
    user_type_id: nz(row.Fk_Usertype),
    user_type_name: userTypeName || null,
  };
}

/** Resolve missing district from Block master when user has block_id only */
async function enrichUserLocation(user) {
  if (user.district_id || !user.block_id) return user;
  try {
    const result = await query(
      `
      SELECT TOP 1 FK_DistrictID AS districtId
      FROM dbo.Block
      WHERE PK_UniqueID = @blockId AND ISNULL(IsDeleted, 0) = 0
      `,
      { blockId: user.block_id }
    );
    const districtId = nz(result.recordset[0]?.districtId);
    if (districtId) user.district_id = districtId;
  } catch (err) {
    console.warn('enrichUserLocation failed:', err.message);
  }
  return user;
}

async function register(body) {
  const role = inferRole(body);
  const passwordHash = await bcrypt.hash(body.password, 12);

  try {
    const result = await query(
      `
      INSERT INTO dbo.tb_mukt_users
        (full_name, mobile, email, username, password_hash, designation, role,
         state_id, division_id, district_id, tehsil_id, block_id, gp_id, village_id)
      OUTPUT INSERTED.*
      VALUES
        (@fullName, @mobile, @email, @username, @passwordHash, @designation, @role,
         @stateId, @divisionId, @districtId, @tehsilId, @blockId, @gpId, @villageId)
      `,
      {
        fullName: body.fullName,
        mobile: body.mobile,
        email: body.email,
        username: body.username,
        passwordHash,
        designation: body.designation || null,
        role,
        stateId: body.stateId || null,
        divisionId: body.divisionId || null,
        districtId: body.districtId || null,
        tehsilId: body.tehsilId || null,
        blockId: body.blockId || null,
        gpId: body.gpId || null,
        villageId: body.villageId || null,
      }
    );
    const user = result.recordset[0];
    return { user: publicUser(user), token: signToken(user) };
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      throw new AppError('Username, mobile or email already exists', 409);
    }
    throw err;
  }
}

async function login(body) {
  const loginId = String(body.username || body.mobile || '').trim();
  if (!loginId || !body.password) {
    throw new AppError('Username/Mobile and password are required', 400);
  }

  const result = await query(
    `
    SELECT TOP 1
      a.*,
      ut.UserType
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted, 0) = 0
      AND ISNULL(a.IsActive, 1) = 1
      AND ISNULL(a.IsBlock, 0) = 0
      AND (
        LOWER(LTRIM(RTRIM(a.LoginId))) = LOWER(@loginId)
        OR LTRIM(RTRIM(ISNULL(a.Mobile, ''))) = @loginId
        OR LTRIM(RTRIM(ISNULL(a.ProfileMobile, ''))) = @loginId
      )
    `,
    { loginId }
  );
  const row = result.recordset[0];
  if (!row) throw new AppError('Invalid credentials', 401);

  const ok = await passwordsMatch(row.LogPassword, body.password);
  if (!ok) throw new AppError('Invalid credentials', 401);

  const user = await enrichUserLocation(mapAdminLoginRow(row));
  // Keep tehsil_id aligned with block_id (Block master)
  if (user.block_id && !user.tehsil_id) user.tehsil_id = user.block_id;
  if (user.tehsil_id && !user.block_id) user.block_id = user.tehsil_id;

  // Portal access policy: State / District / Block teams can login.
  // Tehsil is treated as Block scope because Block master is used for hierarchy.
  const normalizedRole = String(user.role || '').toUpperCase();
  const allowedRoles = new Set(['STATE', 'DISTRICT', 'BLOCK', 'TEHSIL']);
  if (!allowedRoles.has(normalizedRole)) {
    throw new AppError('Access denied. Only State, District, and Block users can login to this application.', 403);
  }

  const enriched = await enrichUserWithNames(user);
  return { user: publicUser(enriched), token: signToken(enriched) };
}

async function getMe(jwtUser) {
  const enriched = await enrichUserWithNames(jwtUser || {});
  return publicUser({
    id: enriched.userId || enriched.id,
    full_name: enriched.fullName || enriched.full_name,
    mobile: enriched.mobile || null,
    email: enriched.email || null,
    username: enriched.username,
    designation: enriched.designation || enriched.userTypeName || null,
    role: enriched.role,
    state_id: enriched.stateId,
    division_id: enriched.divisionId,
    district_id: enriched.districtId,
    tehsil_id: enriched.tehsilId,
    block_id: enriched.blockId,
    gp_id: enriched.gpId,
    village_id: enriched.villageId,
    user_type_id: enriched.userTypeId || null,
    user_type_name: enriched.userTypeName || null,
    stateName: enriched.stateName,
    divisionName: enriched.divisionName,
    districtName: enriched.districtName,
    districtCode: enriched.districtCode,
    tehsilName: enriched.tehsilName,
    tehsilCode: enriched.tehsilCode,
    blockName: enriched.blockName,
    blockCode: enriched.blockCode,
    gpName: enriched.gpName,
    gpCode: enriched.gpCode,
    villageName: enriched.villageName,
    villageCode: enriched.villageCode,
  });
}

async function forgotPassword({ mobile, email }) {
  const result = await query(
    `
    SELECT TOP 1 id, email, mobile, full_name FROM dbo.tb_mukt_users
    WHERE is_active = 1 AND (mobile = @mobile OR email = @email)
    `,
    { mobile: mobile || '', email: email || '' }
  );
  const user = result.recordset[0];
  // Always return generic message to avoid account enumeration
  if (!user) {
    return { message: 'If the account exists, reset instructions were generated.' };
  }

  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  await query(
    `
    INSERT INTO dbo.tb_mukt_password_resets (user_id, token_hash, expires_at)
    VALUES (@userId, @tokenHash, @expiresAt)
    `,
    { userId: user.id, tokenHash, expiresAt: expires }
  );

  return {
    message: 'Password reset token generated. Use it with /api/auth/reset-password.',
    // Exposed only in non-production for demo/testing without email gateway
    ...(process.env.NODE_ENV !== 'production' ? { resetToken: token } : {}),
  };
}

async function resetPassword({ token, newPassword }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await query(
    `
    SELECT TOP 1 * FROM dbo.tb_mukt_password_resets
    WHERE token_hash = @tokenHash AND used = 0 AND expires_at > SYSUTCDATETIME()
    ORDER BY id DESC
    `,
    { tokenHash }
  );
  const row = result.recordset[0];
  if (!row) throw new AppError('Invalid or expired reset token', 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await query(`UPDATE dbo.tb_mukt_users SET password_hash = @passwordHash, updated_at = SYSUTCDATETIME() WHERE id = @userId`, {
    passwordHash,
    userId: row.user_id,
  });
  await query(`UPDATE dbo.tb_mukt_password_resets SET used = 1 WHERE id = @id`, { id: row.id });
  return { message: 'Password updated successfully' };
}

module.exports = {
  register,
  login,
  getMe,
  enrichUserWithNames,
  forgotPassword,
  resetPassword,
  publicUser,
  ROLES,
};
