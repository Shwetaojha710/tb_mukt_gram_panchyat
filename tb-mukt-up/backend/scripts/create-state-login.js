/**
 * Create a new State User login (Fk_Usertype = 3).
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

const USER_TYPE_STATE = 3;

function genPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function genLoginId() {
  const n = crypto.randomBytes(3).readUIntBE(0, 3) % 1000000;
  return `STU${String(n).padStart(6, '0')}`;
}

(async () => {
  const sample = await query(`
    SELECT TOP 3
      a.LoginId, a.LogPassword, a.FirstName, a.LastName, a.Fk_Usertype, ut.UserType,
      a.StateCode, a.FacilityDistrictId, a.DistrictCode
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
      AND a.Fk_Usertype = @ut
    ORDER BY a.Pk_AdminId DESC
  `, { ut: USER_TYPE_STATE });
  console.log('Existing state samples:', sample.recordset);

  let loginId = genLoginId();
  for (let i = 0; i < 5; i++) {
    const dup = await query(
      `SELECT TOP 1 Pk_AdminId FROM dbo.AdminLogin WHERE LoginId = @loginId`,
      { loginId }
    );
    if (!dup.recordset[0]) break;
    loginId = genLoginId();
  }

  const password = genPassword(8);
  const firstName = 'State User';
  const lastName = 'Uttar Pradesh';
  const mobile = String(9400000000 + (Date.now() % 100000000)).slice(0, 10);

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
    OUTPUT INSERTED.Pk_AdminId, INSERTED.LoginId, INSERTED.LogPassword, INSERTED.FirstName, INSERTED.LastName
    VALUES (
      @loginId, @password, @firstName, @lastName, @userType,
      1, 0, 0, 0, 0,
      @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
      1, 0, 1, 0,
      0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0, 0
    )
    `,
    {
      loginId,
      password,
      firstName,
      lastName,
      userType: USER_TYPE_STATE,
      mobile,
    }
  );

  const out = ins.recordset[0];
  const cred = {
    status: 'created',
    role: 'STATE',
    userType: USER_TYPE_STATE,
    userTypeName: 'State User',
    adminId: out.Pk_AdminId,
    loginId: out.LoginId,
    password: String(out.LogPassword || ''),
    name: [out.FirstName, out.LastName].filter(Boolean).join(' '),
  };
  console.log('\n=== NEW STATE LOGIN ===');
  console.log(JSON.stringify(cred, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
