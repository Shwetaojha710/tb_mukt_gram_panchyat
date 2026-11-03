const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  const r = await query(`
    SELECT
      f.PK_UniqueID AS facilityPk,
      f.FK_FacilityCode AS facilityCode,
      f.FacilityName,
      f.FK_Facilitytype AS facilityTypeId,
      ft.FacilityType,
      f.FK_DistrictID AS districtId,
      d.DistrictName,
      f.FK_BlockID AS blockId,
      b.BlockName,
      f.FK_DivisionID AS divisionId,
      f.FK_TehsilID AS tehsilId,
      f.FK_GrampanchayatID AS gpId,
      f.FK_VillageID AS villageId,
      CASE WHEN EXISTS (
        SELECT 1 FROM dbo.FacililtySubtype fs
        WHERE fs.Fk_FacilityId = f.FK_FacilityCode
          AND fs.Fk_SubtypeId = 34
          AND ISNULL(fs.IsDeleted,0)=0
      ) THEN 1 ELSE 0 END AS isTb
    FROM dbo.Facility f
    LEFT JOIN dbo.FacilityType ft ON ft.PK_UniqueID = f.FK_Facilitytype
    LEFT JOIN dbo.District d ON d.PK_UniqueID = f.FK_DistrictID
    LEFT JOIN dbo.Block b ON b.PK_UniqueID = f.FK_BlockID
    WHERE ISNULL(f.IsDeleted,0)=0
      AND (
        f.FacilityName LIKE N'%Mataundh%'
        OR f.FacilityName LIKE N'%Mataund%'
        OR b.BlockName LIKE N'%Mataundh%'
        OR (d.DistrictName LIKE N'%Banda%' AND f.FacilityName LIKE N'%Badokhar%')
        OR (d.DistrictName LIKE N'%Banda%' AND f.FacilityName LIKE N'%Divisional%')
        OR (d.DistrictName LIKE N'%Banda%' AND f.FacilityName LIKE N'%DTC%')
      )
    ORDER BY f.FacilityName
  `);
  console.log(JSON.stringify(r.recordset, null, 2));

  // How FacilityId is stored in AdminLogin for UT9 — PK or FK_FacilityCode?
  const check = await query(`
    SELECT TOP 3
      a.LoginId, a.FacilityId, a.Fk_FacilityTypeId, a.SubtypeId,
      f1.FacilityName AS byPk,
      f2.FacilityName AS byCode
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.Facility f1 ON f1.PK_UniqueID = a.FacilityId
    LEFT JOIN dbo.Facility f2 ON f2.FK_FacilityCode = a.FacilityId
    WHERE a.Fk_Usertype = 9 AND ISNULL(a.FacilityId,0) > 0
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('FacilityId mapping check:', JSON.stringify(check.recordset, null, 2));

  // LoginId pattern for recent inserts
  const patterns = await query(`
    SELECT TOP 5 LoginId, LogPassword, Fk_Usertype, FacilityId, Fk_FacilityTypeId, SubtypeId
    FROM dbo.AdminLogin
    WHERE LoginId LIKE 'TU%' OR LoginId LIKE 'TBU%' OR LoginId LIKE 'IH%' OR Fk_Usertype IN (9,10,15)
    ORDER BY Pk_AdminId DESC
  `);
  console.log('Login patterns:', JSON.stringify(patterns.recordset, null, 2));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
