const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { canAccessLocation } = require('../src/middleware/auth');
const { saveEntry } = require('../src/services/tb.service');
const { fetchChildren } = require('../src/services/location.service');

(async () => {
  // Simulate Facility/Block user with no assigned block (common in AdminLogin)
  const user = { userId: 99, role: 'BLOCK', districtId: null, blockId: null, tehsilId: null };
  const loc = { districtId: 1, tehsilId: 14, blockId: 14, gpId: 554 };
  console.log('canAccess BLOCK unscoped:', canAccessLocation(user, loc));

  const districts = await fetchChildren('district');
  const districtId = districts[0].id;
  const tehsils = await fetchChildren('tehsil', districtId);
  const tehsilId = tehsils[0].id;
  const gps = await fetchChildren('gp', tehsilId);
  const gpId = gps[0].id;

  const saved = await saveEntry(
    user,
    {
      districtId,
      tehsilId,
      blockId: tehsilId,
      gpId,
      reportingMonth: 4,
      reportingYear: 2026,
      testedNaat: 120,
      tbDiagnosed: 1,
      prevYearSuccessTreatment: 92,
      poshanEligible: 3,
      poshanReceived: 3,
    },
    'SUBMITTED'
  );
  console.log('SUBMIT_OK', saved.entry.id, saved.entry.status);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
