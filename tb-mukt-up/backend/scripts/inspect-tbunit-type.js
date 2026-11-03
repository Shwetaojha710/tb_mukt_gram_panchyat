const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  // FacilityType table
  const ftCols = await query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'FacilityType'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('=== FacilityType COLS ===');
  console.log(ftCols.recordset.map((c) => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join(', '));

  const ftSample = await query(`SELECT TOP 30 * FROM dbo.FacilityType ORDER BY 1`);
  console.log('=== FacilityType SAMPLE ===');
  console.log(JSON.stringify(ftSample.recordset, null, 2));

  // FacilityTypeLogin
  const ftlCols = await query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'FacilityTypeLogin'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('=== FacilityTypeLogin COLS ===');
  console.log(ftlCols.recordset.map((c) => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join(', '));
  const ftl = await query(`SELECT TOP 20 * FROM dbo.FacilityTypeLogin`);
  console.log('=== FacilityTypeLogin SAMPLE ===');
  console.log(JSON.stringify(ftl.recordset, null, 2));

  // Existing UT15 logins
  const ut15 = await query(`
    SELECT TOP 10
      a.Pk_AdminId, a.LoginId, a.LogPassword, a.FirstName, a.LastName,
      a.Fk_Usertype, a.FacilityId, a.FacilityDistrictId, a.FacilityBlockId,
      a.FacilityTehsilId, a.FacilityDivisionId, a.BlockCode, a.DistrictCode,
      a.StateCode, a.DivisionCode, a.FacilityGrampanchayatId, a.FacilityVillageId,
      a.IsActive, a.isDeleted, a.IsBlock
    FROM dbo.AdminLogin a
    WHERE a.Fk_Usertype = 15
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('=== EXISTING UT15 (TBUnitfacilityType) ===');
  console.log(JSON.stringify(ut15.recordset, null, 2));
  const ut15Count = await query(`SELECT COUNT(*) AS c FROM dbo.AdminLogin WHERE Fk_Usertype = 15 AND ISNULL(isDeleted,0)=0`);
  console.log('UT15 count active:', ut15Count.recordset[0].c);

  // Facility User sample (UT9)
  const ut9 = await query(`
    SELECT TOP 3
      a.Pk_AdminId, a.LoginId, a.LogPassword, a.FirstName, a.LastName,
      a.Fk_Usertype, a.FacilityId, a.FacilityDistrictId, a.FacilityBlockId,
      a.FacilityTehsilId, a.BlockCode, a.DistrictCode, a.StateCode
    FROM dbo.AdminLogin a
    WHERE a.Fk_Usertype = 9 AND ISNULL(a.FacilityId,0) > 0
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('=== SAMPLE UT9 WITH FacilityId ===');
  console.log(JSON.stringify(ut9.recordset, null, 2));

  // AdminLogin identity / defaults for insert
  const adminCols = await query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'AdminLogin'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('=== ADMINLOGIN COLS ===');
  console.log(JSON.stringify(adminCols.recordset, null, 2));

  // Facility cols related to type
  const facCols = await query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Facility'
      AND (COLUMN_NAME LIKE '%Type%' OR COLUMN_NAME LIKE '%Facility%' OR COLUMN_NAME LIKE 'FK_%' OR COLUMN_NAME LIKE 'PK_%' OR COLUMN_NAME = 'FacilityName')
    ORDER BY ORDINAL_POSITION
  `);
  console.log('=== FACILITY KEY COLS ===');
  console.log(facCols.recordset.map((c) => c.COLUMN_NAME).join(', '));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
