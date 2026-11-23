const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

const USER_TYPE_TB_UNIT = 15;
const SUBTYPE_TB = 34;

function genPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

(async () => {
  const fac = await query(`
    SELECT TOP 5
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
      b.BlockName,
      CASE WHEN EXISTS (
        SELECT 1 FROM dbo.FacililtySubtype fs
        WHERE fs.Fk_FacilityId = f.FK_FacilityCode
          AND fs.Fk_SubtypeId = 34 AND ISNULL(fs.IsDeleted,0)=0
      ) THEN 1 ELSE 0 END AS isTb
    FROM dbo.Facility f
    LEFT JOIN dbo.FacilityType ft ON ft.PK_UniqueID = f.FK_Facilitytype
    LEFT JOIN dbo.District d ON d.PK_UniqueID = f.FK_DistrictID
    LEFT JOIN dbo.Block b ON b.PK_UniqueID = f.FK_BlockID
    WHERE ISNULL(f.IsDeleted,0)=0
      AND (f.FacilityName LIKE N'%Tindwari%' OR b.BlockName LIKE N'%Tindwari%')
    ORDER BY isTb DESC, f.FacilityName
  `);
  console.log('FACILITIES', JSON.stringify(fac.recordset, null, 2));

  // Prefer TB-linked facility named Tindwari; else first TB in Tindwari block
  const f =
    fac.recordset.find((x) => x.isTb && /Tindwari/i.test(x.FacilityName)) ||
    fac.recordset.find((x) => x.isTb) ||
    fac.recordset.find((x) => /Tindwari/i.test(x.FacilityName));

  if (!f) {
    console.error('No Tindwari facility found');
    process.exit(1);
  }
  console.log('SELECTED', f.FacilityName, f.facilityCode);

  const loginId = `TBU${f.facilityCode}`;
  const existing = await query(
    `
    SELECT TOP 1 Pk_AdminId, LoginId, LogPassword, FacilityId, Fk_Usertype
    FROM dbo.AdminLogin
    WHERE (FacilityId = @fid AND Fk_Usertype = @ut) OR LoginId = @loginId
    ORDER BY Pk_AdminId DESC
    `,
    { fid: f.facilityPk, ut: USER_TYPE_TB_UNIT, loginId }
  );

  if (existing.recordset[0]) {
    const e = existing.recordset[0];
    console.log(
      JSON.stringify(
        {
          status: 'exists',
          district: f.DistrictName,
          sheetName: 'Tindwari',
          facilityName: f.FacilityName,
          facilityType: f.FacilityType,
          blockName: f.BlockName,
          loginId: e.LoginId,
          password: e.LogPassword,
          userType: 15,
          userTypeName: 'TBUnitfacilityType',
          blockRef: { loginId: 'BLU94110', password: 'AC67UT140' },
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const password = genPassword(8);
  const mobile = String(9000000000 + (Number(f.facilityCode) % 100000000)).slice(0, 10);

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
      @stateCode, 0, 0, 0, @blockCode,
      @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
      1, 0, 1, 0,
      @facilityTypeId, @facilityId,
      @facilityDivisionId, @facilityDistrictId, @facilityTehsilId,
      @facilityBlockId, @facilityGpId, @facilityVillageId,
      @subtypeId, 0, 0, 0
    )
    `,
    {
      loginId,
      password,
      firstName: 'TB Unit Tindwari',
      lastName: f.DistrictName || '',
      userType: USER_TYPE_TB_UNIT,
      stateCode: f.stateId || 1,
      blockCode: f.blockId || 0,
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
    }
  );

  const out = ins.recordset[0];
  console.log(
    JSON.stringify(
      {
        status: 'created',
        district: f.DistrictName,
        sheetName: 'Tindwari',
        facilityName: f.FacilityName,
        facilityType: f.FacilityType,
        blockName: f.BlockName,
        loginId: out.LoginId,
        password: out.LogPassword,
        adminId: out.Pk_AdminId,
        userType: 15,
        userTypeName: 'TBUnitfacilityType',
        blockRef: { loginId: 'BLU94110', password: 'AC67UT140' },
      },
      null,
      2
    )
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
