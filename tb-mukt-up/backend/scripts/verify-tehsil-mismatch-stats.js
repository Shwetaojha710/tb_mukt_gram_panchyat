require('dotenv').config();
const { query } = require('../src/config/db');

(async () => {
  const r = await query(`
    SELECT
      SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN status='SUBMITTED' AND (tehsil_id IS NULL OR tehsil_id=0) THEN 1 ELSE 0 END) AS submittedTehsilMissing,
      SUM(CASE WHEN status='SUBMITTED' AND tehsil_id IS NOT NULL AND tehsil_id<>0 AND tehsil_id<>block_id THEN 1 ELSE 0 END) AS submittedTehsilMismatch,
      SUM(CASE WHEN status='SUBMITTED' AND tehsil_id=block_id THEN 1 ELSE 0 END) AS submittedTehsilEqBlock
    FROM dbo.tb_mukt_entries
    WHERE reporting_year = 2026
  `);
  console.log(r.recordset[0]);

  // Simulate old TEHSIL scope failure: users with role mapped as TEHSIL whose JWT tehsilId differs from entry.tehsil_id
  const users = await query(`
    SELECT TOP 20
      a.LoginId,
      ut.UserType,
      a.FacilityBlockId,
      a.FacilityTehsilId,
      a.BlockCode,
      a.TehsilCode,
      a.FacilityDistrictId,
      a.DistrictCode
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1
      AND a.Fk_Usertype = 7
      AND (ISNULL(a.BlockCode,0) > 0 OR ISNULL(a.FacilityBlockId,0) > 0)
    ORDER BY a.Pk_AdminId DESC
  `);
  console.log('Sample UT7 logins:', users.recordset.slice(0, 5));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
