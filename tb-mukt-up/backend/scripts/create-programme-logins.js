/**
 * Create STATE-level programme logins:
 * GM NHM, DGM NHM, STC, UPTSU
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

const USER_TYPE_STATE = 3;

const ACCOUNTS = [
  { loginId: 'GMNHM001', firstName: 'GM', lastName: 'NHM', label: 'GM, NHM' },
  { loginId: 'DGMNHM001', firstName: 'DGM', lastName: 'NHM', label: 'DGM, NHM' },
  { loginId: 'STCUP001', firstName: 'STC', lastName: 'State TB Cell', label: 'STC' },
  { loginId: 'UPTSU001', firstName: 'UPTSU', lastName: 'Technical Support Unit', label: 'UPTSU' },
];

function genPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function upsertAccount(acc) {
  const existing = await query(
    `
    SELECT TOP 1
      Pk_AdminId AS adminId,
      LoginId AS loginId,
      LogPassword AS password,
      FirstName AS firstName,
      LastName AS lastName,
      Fk_Usertype AS userType
    FROM dbo.AdminLogin
    WHERE LOWER(LTRIM(RTRIM(LoginId))) = LOWER(@loginId)
      AND ISNULL(isDeleted, 0) = 0
    `,
    { loginId: acc.loginId }
  );

  if (existing.recordset[0]) {
    const row = existing.recordset[0];
    // Ensure STATE type + active + names
    await query(
      `
      UPDATE dbo.AdminLogin
      SET FirstName = @firstName,
          LastName = @lastName,
          Fk_Usertype = @userType,
          StateCode = 1,
          IsActive = 1,
          IsBlock = 0,
          isDeleted = 0,
          IsChangePassword = 1
      WHERE Pk_AdminId = @adminId
      `,
      {
        adminId: row.adminId,
        firstName: acc.firstName,
        lastName: acc.lastName,
        userType: USER_TYPE_STATE,
      }
    );
    return {
      status: 'existing',
      label: acc.label,
      role: 'STATE',
      adminId: row.adminId,
      loginId: row.loginId,
      password: String(row.password || ''),
      name: `${acc.firstName} ${acc.lastName}`.trim(),
    };
  }

  const password = genPassword(10);
  const mobile = String(9500000000 + (Date.now() % 100000000)).slice(0, 10);

  const ins = await query(
    `
    INSERT INTO dbo.AdminLogin (
      LoginId, LogPassword, FirstName, LastName, Fk_Usertype,
      StateCode, DivisionCode, DistrictCode, TehsilCode, BlockCode,
      Mobile, Email, Address, City, State, PinCode,
      CreatedBy, isDeleted, IsActive, OfflineData,
      Fk_FacilityTypeId, FacilityId,
      FacilityDivisionId, FacilityDistrictId, FacilityTehsilId,
      FacilityBlockId, FacilityGrampanchayatId, FacilityVillageId,
      SubtypeId, IsInterNational, IsBlock, IsChangePassword
    )
    OUTPUT INSERTED.Pk_AdminId, INSERTED.LoginId, INSERTED.LogPassword
    VALUES (
      @loginId, @password, @firstName, @lastName, @userType,
      1, 0, 0, 0, 0,
      @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
      1, 0, 1, 0,
      0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0, 1
    )
    `,
    {
      loginId: acc.loginId,
      password,
      firstName: acc.firstName,
      lastName: acc.lastName,
      userType: USER_TYPE_STATE,
      mobile,
    }
  );

  const out = ins.recordset[0];
  return {
    status: 'created',
    label: acc.label,
    role: 'STATE',
    adminId: out.Pk_AdminId,
    loginId: out.LoginId,
    password: String(out.LogPassword || ''),
    name: `${acc.firstName} ${acc.lastName}`.trim(),
  };
}

(async () => {
  const rows = [];
  for (const acc of ACCOUNTS) {
    const cred = await upsertAccount(acc);
    rows.push(cred);
    console.log(`${cred.status.toUpperCase()}: ${cred.label} → ${cred.loginId} / ${cred.password}`);
  }

  const outDir = path.join(__dirname, '..', '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'Programme_Logins_GM_DGM_STC_UPTSU.json');
  fs.writeFileSync(outPath, JSON.stringify({ website: 'https://tbmukht.demoquaeretech.in', createdAt: new Date().toISOString(), accounts: rows }, null, 2));
  console.log('\nWrote', outPath);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
