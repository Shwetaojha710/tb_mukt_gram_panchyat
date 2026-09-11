const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();
  for (const [label, typeIds] of [
    ['DISTRICT', '5,8,12'],
    ['BLOCK', '7,9'],
  ]) {
    const r = await p.request().query(`
      SELECT TOP 5
        a.LoginId, a.LogPassword, a.FirstName, a.LastName, a.Fk_Usertype, ut.UserType,
        a.FacilityDistrictId, a.DistrictCode, a.FacilityBlockId, a.BlockCode
      FROM dbo.AdminLogin a
      LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
      WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1 AND ISNULL(a.IsBlock,0)=0
        AND a.Fk_Usertype IN (${typeIds})
      ORDER BY a.Pk_AdminId
    `);
    console.log(label);
    console.log(
      JSON.stringify(
        r.recordset.map((x) => ({
          LoginId: x.LoginId,
          password: String(x.LogPassword || ''),
          name: [x.FirstName, x.LastName].filter(Boolean).join(' '),
          UserType: x.UserType,
          district: x.FacilityDistrictId || x.DistrictCode,
          block: x.FacilityBlockId || x.BlockCode,
        })),
        null,
        2
      )
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
