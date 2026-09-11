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

  // TB Mukt portal: only Block User accounts may sign in
  const typeName = String(user.user_type_name || '').toLowerCase();
  const isBlockUser =
    typeName.includes('block user') ||
    (typeName.includes('block') && !typeName.includes('unblock')) ||
    Number(user.user_type_id) === 7;
  if (!isBlockUser) {
    throw new AppError('Access denied. Only Block users can login to this application.', 403);
  }

  return { user: publicUser(user), token: signToken(user) };
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
  forgotPassword,
  resetPassword,
  publicUser,
  ROLES,
};
