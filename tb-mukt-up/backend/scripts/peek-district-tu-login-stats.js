const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  const ut = await query(`
    SELECT Pk_UsertypeId AS id, UserType AS name
    FROM dbo.UserTypeMaster
    WHERE ISNULL(Isdeleted, 0) = 0
    ORDER BY Pk_UsertypeId
  `);
  console.log('USER TYPES', JSON.stringify(ut.recordset, null, 2));

  const dist = await query(`
    SELECT COUNT(*) AS n FROM dbo.District WHERE ISNULL(IsDeleted,0)=0
  `);
  console.log('districts', dist.recordset[0]);

  const tus = await query(`
    SELECT COUNT(DISTINCT f.PK_UniqueID) AS n
    FROM dbo.Facility f
    INNER JOIN dbo.FacililtySubtype fs
      ON fs.Fk_FacilityId = f.FK_FacilityCode
     AND fs.Fk_SubtypeId = 34
     AND ISNULL(fs.IsDeleted,0)=0
    WHERE ISNULL(f.IsDeleted,0)=0
  `);
  console.log('TB facilities (subtype 34)', tus.recordset[0]);

  const distLogins = await query(`
    SELECT
      a.Fk_Usertype,
      ut.UserType,
      COUNT(*) AS n
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
      AND (
        a.Fk_Usertype IN (5,8,12)
        OR LOWER(ISNULL(ut.UserType,'')) LIKE '%district%'
        OR LOWER(ISNULL(ut.UserType,'')) LIKE '%cmo%'
      )
    GROUP BY a.Fk_Usertype, ut.UserType
    ORDER BY n DESC
  `);
  console.log('district-ish logins by type', distLogins.recordset);

  const sampleDist = await query(`
    SELECT TOP 5
      a.LoginId, a.LogPassword, a.FirstName, a.Fk_Usertype, ut.UserType,
      a.FacilityDistrictId, a.DistrictCode, d.DistrictName
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    LEFT JOIN dbo.District d ON d.PK_UniqueID = COALESCE(NULLIF(a.FacilityDistrictId,0), a.DistrictCode)
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
      AND (a.Fk_Usertype IN (5,8,12) OR LOWER(ISNULL(ut.UserType,'')) LIKE '%district user%')
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('sample district logins', sampleDist.recordset);

  const tuLogins = await query(`
    SELECT COUNT(*) AS n
    FROM dbo.AdminLogin a
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
      AND (a.Fk_Usertype = 15 OR a.LoginId LIKE 'TBU%')
  `);
  console.log('TU logins', tuLogins.recordset[0]);

  const sampleTu = await query(`
    SELECT TOP 5
      a.LoginId, a.LogPassword, a.FirstName, a.FacilityId, a.Fk_Usertype,
      f.FacilityName, f.FK_FacilityCode, d.DistrictName
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.Facility f ON f.PK_UniqueID = a.FacilityId
    LEFT JOIN dbo.District d ON d.PK_UniqueID = a.FacilityDistrictId
    WHERE ISNULL(a.isDeleted,0)=0 AND a.Fk_Usertype = 15
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('sample TU logins', sampleTu.recordset);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
