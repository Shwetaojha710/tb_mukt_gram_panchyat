const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');
const crypto = require('crypto');

/** Sheet TB Units → Facility match targets */
const TARGETS = [
  { district: 'Banda', sheetName: 'TU Mataundh', facilityCode: 520 }, // PHC Mataundh
  { district: 'Banda', sheetName: 'DTC', facilityCode: 23141 }, // Divisional Hospital Banda
  { district: 'Basti', sheetName: 'TU Saughat', facilityCode: 24352 },
  { district: 'Basti', sheetName: 'TU Bhanpur', facilityCode: 24350 },
  { district: 'Hathras', sheetName: 'TU Sadabad', facilityCode: 24581 },
  { district: 'Hathras', sheetName: 'TU Sahpau', facilityCode: 24583 },
  { district: 'Unnao', sheetName: 'Acalganj', facilityCode: 25651 }, // CHC Achalganj
  { district: 'Unnao', sheetName: 'Bighapur', facilityCode: 3335 },
  { district: 'Shamli', sheetName: 'Jhinjhana', facilityCode: 25582 },
  { district: 'Shamli', sheetName: 'Kandhla', facilityCode: 25577 },
];

const USER_TYPE_TB_UNIT = 15; // TBUnitfacilityType
const SUBTYPE_TB = 34;

function genPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function genLoginId(facilityCode) {
  return `TBU${facilityCode}`;
}

(async () => {
  const dryRun = process.argv.includes('--dry');
  const force = process.argv.includes('--force');

  // identity check
  const idCheck = await query(`
    SELECT COLUMNPROPERTY(OBJECT_ID('dbo.AdminLogin'), 'Pk_AdminId', 'IsIdentity') AS isIdentity
  `);
  console.log('Pk_AdminId identity:', idCheck.recordset[0]);

  const created = [];

  for (const t of TARGETS) {
    const fac = await query(
      `
      SELECT TOP 1
        f.PK_UniqueID AS facilityPk,
        f.FK_FacilityCode AS facilityCode,
        f.FacilityName,
        ISNULL(f.FK_Facilitytype, 0) AS facilityTypeId,
        ft.FacilityType,
        ISNULL(f.FK_StateID, 1) AS stateId,
        ISNULL(f.FK_DivisionID, 0) AS divisionId,
        ISNULL(f.FK_DistrictID, 0) AS districtId,
        ISNULL(f.FK_TehsilID, 0) AS tehsilId,
        ISNULL(f.FK_BlockID, 0) AS blockId,
        ISNULL(f.FK_GrampanchayatID, 0) AS gpId,
        ISNULL(f.FK_VillageID, 0) AS villageId,
        d.DistrictName,
        b.BlockName
      FROM dbo.Facility f
      LEFT JOIN dbo.FacilityType ft ON ft.PK_UniqueID = f.FK_Facilitytype
      LEFT JOIN dbo.District d ON d.PK_UniqueID = f.FK_DistrictID
      LEFT JOIN dbo.Block b ON b.PK_UniqueID = f.FK_BlockID
      WHERE f.FK_FacilityCode = @code AND ISNULL(f.IsDeleted, 0) = 0
      `,
      { code: t.facilityCode }
    );
    const f = fac.recordset[0];
    if (!f) {
      console.error('MISSING facility', t);
      continue;
    }

    const loginId = genLoginId(f.facilityCode);

    const existing = await query(
      `
      SELECT TOP 5 Pk_AdminId, LoginId, LogPassword, FacilityId, Fk_Usertype, IsActive, isDeleted
      FROM dbo.AdminLogin
      WHERE FacilityId = @fid AND Fk_Usertype = @ut
         OR LoginId = @loginId
      ORDER BY Pk_AdminId DESC
      `,
      { fid: f.facilityPk, ut: USER_TYPE_TB_UNIT, loginId }
    );

    if (existing.recordset.length && !force) {
      const e = existing.recordset[0];
      created.push({
        status: 'exists',
        district: f.DistrictName,
        sheetName: t.sheetName,
        facilityName: f.FacilityName,
        facilityCode: f.facilityCode,
        facilityType: f.FacilityType,
        facilityTypeId: f.facilityTypeId,
        blockName: f.BlockName,
        loginId: e.LoginId,
        password: e.LogPassword,
        adminId: e.Pk_AdminId,
        userType: USER_TYPE_TB_UNIT,
      });
      console.log('EXISTS', loginId, e.LoginId);
      continue;
    }

    const password = genPassword(8);
    const firstName = `TB Unit ${t.sheetName}`.slice(0, 80);
    const mobile = String(9000000000 + (Number(f.facilityCode) % 100000000)).slice(0, 10);

    const row = {
      loginId,
      password,
      firstName,
      lastName: f.DistrictName || '',
      userType: USER_TYPE_TB_UNIT,
      stateCode: f.stateId || 1,
      divisionCode: 0,
      districtCode: 0,
      tehsilCode: 0,
      blockCode: f.blockId || 0, // keep block for cascade scope
      mobile,
      facilityTypeId: f.facilityTypeId || 0,
      facilityId: f.facilityPk,
      facilityDivisionId: f.divisionId || 0,
      facilityDistrictId: f.districtId || 0,
      facilityTehsilId: f.tehsilId || 0,
      facilityBlockId: f.blockId || 0,
      facilityGpId: f.gpId || 0,
      facilityVillageId: f.villageId || 0,
      subtypeId: SUBTYPE_TB,
    };

    if (dryRun) {
      created.push({ status: 'dry', ...t, ...f, ...row });
      console.log('DRY', JSON.stringify(row));
      continue;
    }

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
        @stateCode, @divisionCode, @districtCode, @tehsilCode, @blockCode,
        @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
        1, 0, 1, 0,
        @facilityTypeId, @facilityId,
        @facilityDivisionId, @facilityDistrictId, @facilityTehsilId,
        @facilityBlockId, @facilityGpId, @facilityVillageId,
        @subtypeId, 0, 0, 0
      )
      `,
      row
    );

    const out = ins.recordset[0];
    created.push({
      status: 'created',
      district: f.DistrictName,
      sheetName: t.sheetName,
      facilityName: f.FacilityName,
      facilityCode: f.facilityCode,
      facilityType: f.FacilityType,
      facilityTypeId: f.facilityTypeId,
      blockName: f.BlockName,
      loginId: out.LoginId,
      password: out.LogPassword,
      adminId: out.Pk_AdminId,
      userType: USER_TYPE_TB_UNIT,
      userTypeName: 'TBUnitfacilityType',
    });
    console.log('CREATED', out.LoginId, out.LogPassword);
  }

  console.log('\n=== CREDENTIALS ===');
  console.log(JSON.stringify(created, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
