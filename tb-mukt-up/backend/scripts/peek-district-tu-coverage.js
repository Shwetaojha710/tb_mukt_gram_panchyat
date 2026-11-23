const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  // Districts missing District User (type 5)
  const missingDist = await query(`
    SELECT d.PK_UniqueID AS id, d.DistrictName AS name
    FROM dbo.District d
    WHERE ISNULL(d.IsDeleted,0)=0
      AND NOT EXISTS (
        SELECT 1 FROM dbo.AdminLogin a
        WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
          AND a.Fk_Usertype = 5
          AND (a.FacilityDistrictId = d.PK_UniqueID OR a.DistrictCode = d.PK_UniqueID)
      )
    ORDER BY d.DistrictName
  `);
  console.log('districts missing type-5 login:', missingDist.recordset.length);
  console.log(missingDist.recordset.slice(0, 20));

  // Prefer one login per district (type 5)
  const perDist = await query(`
    SELECT
      d.PK_UniqueID AS districtId,
      d.DistrictName,
      COUNT(a.Pk_AdminId) AS loginCount
    FROM dbo.District d
    LEFT JOIN dbo.AdminLogin a
      ON ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
     AND a.Fk_Usertype = 5
     AND (a.FacilityDistrictId = d.PK_UniqueID OR a.DistrictCode = d.PK_UniqueID)
    WHERE ISNULL(d.IsDeleted,0)=0
    GROUP BY d.PK_UniqueID, d.DistrictName
    ORDER BY loginCount DESC, d.DistrictName
  `);
  const zeros = perDist.recordset.filter((r) => r.loginCount === 0);
  const multi = perDist.recordset.filter((r) => r.loginCount > 1);
  console.log('districts with 0 type5:', zeros.length);
  console.log('districts with >1 type5:', multi.length);

  // TB facility vs TU login coverage
  const tuCov = await query(`
    SELECT
      COUNT(*) AS tbFacilities,
      SUM(CASE WHEN a.Pk_AdminId IS NOT NULL THEN 1 ELSE 0 END) AS withLogin
    FROM dbo.Facility f
    INNER JOIN dbo.FacililtySubtype fs
      ON fs.Fk_FacilityId = f.FK_FacilityCode
     AND fs.Fk_SubtypeId = 34
     AND ISNULL(fs.IsDeleted,0)=0
    LEFT JOIN dbo.AdminLogin a
      ON ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
     AND a.Fk_Usertype = 15
     AND (
       a.FacilityId = f.PK_UniqueID
       OR a.FacilityId = f.FK_FacilityCode
       OR a.LoginId = CONCAT('TBU', f.FK_FacilityCode)
     )
    WHERE ISNULL(f.IsDeleted,0)=0
  `);
  console.log('TU coverage', tuCov.recordset[0]);

  // Facility PK vs Code sample
  const fac = await query(`
    SELECT TOP 5 f.PK_UniqueID, f.FK_FacilityCode, f.FacilityName
    FROM dbo.Facility f
    INNER JOIN dbo.FacililtySubtype fs
      ON fs.Fk_FacilityId = f.FK_FacilityCode AND fs.Fk_SubtypeId = 34 AND ISNULL(fs.IsDeleted,0)=0
    WHERE ISNULL(f.IsDeleted,0)=0
  `);
  console.log('facility pk vs code', fac.recordset);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
