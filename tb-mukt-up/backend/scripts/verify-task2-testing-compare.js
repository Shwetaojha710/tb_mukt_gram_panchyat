/** READ-ONLY: Task 2 aggregate + previous-year testing smoke checks */
require('dotenv').config();
const authService = require('../src/services/auth.service');
const dashboardService = require('../src/services/dashboard.service');
const newDashboardService = require('../src/services/newDashboard.service');
const { query } = require('../src/config/db');

(async () => {
  const cred = await query(`
    SELECT TOP 1 LoginId, LogPassword FROM dbo.AdminLogin
    WHERE LoginId = 'BLU133251' AND ISNULL(isDeleted,0)=0
  `);
  const row = cred.recordset[0];
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

  const filters = {
    year: 2026,
    reportingMonth: 10,
    dateFrom: '2026-01',
    dateTo: '2026-10',
    blockId: user.blockId,
  };

  const summary = await dashboardService.getSummary(jwtUser, filters);
  console.log('Classic KPIs', {
    testedNaatMonth: summary.kpis.testedNaatMonth,
    testedNaatYtd: summary.kpis.testedNaatYtd,
    testedNaatPrevMonth: summary.kpis.testedNaatPrevMonth,
    testedNaatPrevYtd: summary.kpis.testedNaatPrevYtd,
    qualifiedGpsYtd: summary.kpis.qualifiedGpsYtd,
  });

  const rankings = await dashboardService.getRankings(jwtUser, filters);
  const line = rankings.tbUnitGpLineList || [];
  const sample = line.slice(0, 3).map((r) => ({
    gp: r.gpName,
    testedNaatMonth: r.testedNaatMonth,
    testedNaatPrevMonth: r.testedNaatPrevMonth,
    testedNaatYtd: r.testedNaatYtd,
    testedNaatPrevYtd: r.testedNaatPrevYtd,
  }));
  console.log('Line list count', line.length, 'sample', sample);

  const drill = await newDashboardService.getDrilldown(jwtUser, {
    level: 'block',
    blockId: user.blockId,
    dateFrom: '2026-01',
    dateTo: '2026-10',
  });
  const rows = drill.rows || [];
  console.log('Overview block rows', rows.length, 'sample', rows.slice(0, 2).map((r) => ({
    name: r.name,
    tests: r.tests,
    testsPrevYear: r.testsPrevYear,
  })));

  // DB truth for Oct 2026 vs Oct 2025
  const truth = await query(`
    SELECT
      SUM(CASE WHEN reporting_year=2026 AND reporting_month=10 THEN tested_naat ELSE 0 END) AS oct2026,
      SUM(CASE WHEN reporting_year=2025 AND reporting_month=10 THEN tested_naat ELSE 0 END) AS oct2025,
      SUM(CASE WHEN reporting_year=2026 AND reporting_month BETWEEN 1 AND 10 THEN tested_naat ELSE 0 END) AS ytd2026,
      SUM(CASE WHEN reporting_year=2025 AND reporting_month BETWEEN 1 AND 10 THEN tested_naat ELSE 0 END) AS ytd2025
    FROM dbo.tb_mukt_entries
    WHERE block_id = @blockId AND status='SUBMITTED'
  `, { blockId: user.blockId });
  console.log('DB truth Kakori', truth.recordset[0]);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
