require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const authService = require('../src/services/auth.service');
const newDashboardService = require('../src/services/newDashboard.service');
const { query } = require('../src/config/db');

(async () => {
  const cred = await query(`SELECT TOP 1 LoginId, LogPassword FROM dbo.AdminLogin WHERE LoginId='BLU133251'`);
  const { user } = await authService.login({
    username: cred.recordset[0].LoginId,
    password: String(cred.recordset[0].LogPassword),
  });
  const jwt = {
    userId: user.id,
    username: user.username,
    role: user.role,
    districtId: user.districtId,
    blockId: user.blockId || user.tehsilId,
    tehsilId: user.tehsilId,
  };

  const drill = await newDashboardService.getDrilldown(jwt, {
    dateFrom: '2026-01',
    dateTo: '2026-11',
    fromYear: 2026,
    fromMonth: 1,
    toYear: 2026,
    toMonth: 11,
    level: 'block',
    blockId: jwt.blockId,
  });

  const zeroTest = (drill.rows || []).filter((r) => Number(r.tests) === 0);
  const zeroTestQual = zeroTest.filter((r) => Number(r.qualified) === 1);
  console.log({
    totalRows: drill.rows?.length,
    zeroTestCount: zeroTest.length,
    zeroTestButQualified: zeroTestQual.length,
    samples: zeroTest.slice(0, 10).map((r) => ({
      name: r.name,
      pop: r.population,
      tests: r.tests,
      eligible: r.eligible,
      qualified: r.qualified,
      award: r.award,
      testsPending: r.testsPending,
    })),
    qualifiedWithZeroTests: zeroTestQual.map((r) => r.name),
  });

  // Also: award medal but zero tests in period
  const awardNoTests = (drill.rows || []).filter(
    (r) => Number(r.tests) === 0 && ['BRONZE', 'SILVER', 'GOLD'].includes(String(r.award || '').toUpperCase())
  );
  console.log('award but zero tests', awardNoTests.map((r) => ({ name: r.name, award: r.award, pop: r.population })));

  const el = (drill.rows || []).filter((r) => Number(r.eligible) === 1);
  console.log(
    'eligible rows',
    el.map((r) => ({
      name: r.name,
      pop: r.population,
      tests: r.tests,
      target: r.target,
      qual: r.qualified,
      pending: r.testsPending,
    }))
  );

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
