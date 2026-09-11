const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');
const { login } = require('../src/services/auth.service');
const { saveEntry, listEntries } = require('../src/services/tb.service');
const { fetchChildren } = require('../src/services/location.service');

(async () => {
  const cred = await query(`
    SELECT TOP 1 LoginId, LogPassword
    FROM dbo.AdminLogin
    WHERE ISNULL(isDeleted, 0) = 0 AND ISNULL(IsActive, 1) = 1
      AND LoginId IS NOT NULL AND LogPassword IS NOT NULL
    ORDER BY Pk_AdminId
  `);
  const row = cred.recordset[0];
  const auth = await login({ username: row.LoginId, password: row.LogPassword });
  const user = {
    userId: auth.user.id,
    role: auth.user.role,
    stateId: auth.user.stateId,
    districtId: auth.user.districtId,
    blockId: auth.user.blockId,
  };

  const districts = await fetchChildren('district');
  const districtId = districts[0].id;
  const tehsils = await fetchChildren('tehsil', districtId);
  const tehsilId = tehsils[0].id;
  const gps = await fetchChildren('gp', tehsilId);
  const gpId = gps[0].id;
  const villages = await fetchChildren('village', gpId);
  const villageId = villages[0]?.id || null;

  const saved = await saveEntry(
    user,
    {
      districtId,
      tehsilId,
      blockId: tehsilId,
      gpId,
      villageId,
      reportingMonth: 3,
      reportingYear: 2026,
      testedNaat: 150,
      tbDiagnosed: 2,
      prevYearSuccessTreatment: 95,
      poshanEligible: 5,
      poshanReceived: 5,
    },
    'SUBMITTED'
  );

  console.log('SUBMIT_OK', saved.entry.id, saved.entry.gpName, saved.entry.status);

  const list = await listEntries(user, { year: 2026, page: 1, pageSize: 10 });
  console.log('LIST_OK total=', list.total);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  console.error(e);
  process.exit(1);
});
