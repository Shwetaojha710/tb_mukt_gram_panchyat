/** READ-ONLY: district dashboard still returns rows after scope fix */
require('dotenv').config();
const { query } = require('../src/config/db');
const authService = require('../src/services/auth.service');
const dashboardService = require('../src/services/dashboard.service');
const newDashboardService = require('../src/services/newDashboard.service');

(async () => {
  const cred = await query(`
    SELECT TOP 1 a.LoginId, a.LogPassword
    FROM dbo.AdminLogin a
    WHERE a.LoginId = 'MA997782' AND ISNULL(a.isDeleted,0)=0
  `);
  const row = cred.recordset[0];
  if (!row) {
    console.log('Hardoi district login not found — skip');
    process.exit(0);
  }
  const { user } = await authService.login({
    username: row.LoginId,
    password: String(row.LogPassword),
  });
  const jwtUser = {
    userId: user.id,
    username: user.username,
    role: user.role,
    districtId: user.districtId,
    blockId: user.blockId,
    tehsilId: user.tehsilId,
    stateId: user.stateId,
    divisionId: user.divisionId,
  };
  console.log('District login', { role: user.role, districtId: user.districtId });

  const rankings = await dashboardService.getRankings(jwtUser, {
    year: 2026,
    reportingMonth: 11,
    dateFrom: '2026-01',
    dateTo: '2026-11',
    districtId: user.districtId,
  });
  console.log('District line list:', (rankings.tbUnitGpLineList || []).length);

  const overview = await newDashboardService.getDrilldown(jwtUser, {
    level: 'district',
    districtId: user.districtId,
    dateFrom: '2026-01',
    dateTo: '2026-11',
  });
  console.log('Overview district rows:', (overview.rows || []).length);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
