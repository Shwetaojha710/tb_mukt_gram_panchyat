const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();

  const types = await p.request().query(`
    SELECT Pk_UsertypeId AS id, UserType AS name
    FROM dbo.UserTypeMaster
    WHERE ISNULL(Isdeleted, 0) = 0
    ORDER BY Pk_UsertypeId
  `);
  console.log('USER_TYPES');
  console.log(JSON.stringify(types.recordset, null, 2));

  const users = await p.request().query(`
    SELECT TOP 30
      a.LoginId,
      a.LogPassword,
      a.FirstName,
      a.LastName,
      a.Fk_Usertype,
      ut.UserType,
      a.FacilityDistrictId,
      a.DistrictCode,
      a.FacilityBlockId,
      a.BlockCode,
      a.StateCode
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted, 0) = 0
      AND ISNULL(a.IsActive, 1) = 1
      AND ISNULL(a.IsBlock, 0) = 0
      AND (
        LOWER(ISNULL(ut.UserType, '')) LIKE '%state%'
        OR LOWER(ISNULL(ut.UserType, '')) LIKE '%district%'
        OR LOWER(ISNULL(ut.UserType, '')) LIKE '%cmo%'
        OR LOWER(ISNULL(ut.UserType, '')) LIKE '%block%'
        OR LOWER(ISNULL(ut.UserType, '')) LIKE '%admin%'
      )
    ORDER BY a.Fk_Usertype, a.Pk_AdminId
  `);

  const rows = users.recordset.map((r) => {
    const pwd = r.LogPassword == null ? null : String(r.LogPassword);
    return {
      LoginId: r.LoginId,
      password: pwd
        ? pwd.startsWith('$2')
          ? `BCRYPT(${pwd.slice(0, 12)}...)`
          : pwd
        : null,
      name: [r.FirstName, r.LastName].filter(Boolean).join(' '),
      typeId: r.Fk_Usertype,
      UserType: r.UserType,
      district: r.FacilityDistrictId || r.DistrictCode,
      block: r.FacilityBlockId || r.BlockCode,
      state: r.StateCode,
    };
  });

  console.log('USERS');
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
