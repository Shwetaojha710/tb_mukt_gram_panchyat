require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const authService = require('../src/services/auth.service');
const newDashboardService = require('../src/services/newDashboard.service');
const dashboardService = require('../src/services/dashboard.service');
const { query } = require('../src/config/db');

(async () => {
  const cred = await query(`SELECT TOP 1 LoginId, LogPassword FROM dbo.AdminLogin WHERE LoginId='GMNHM001'`);
  const { user } = await authService.login({
    username: cred.recordset[0].LoginId,
    password: String(cred.recordset[0].LogPassword),
  });
  const jwt = {
    userId: user.id,
    username: user.username,
    role: user.role,
    stateId: user.stateId,
  };

  // Overview summary KPIs
  const sum = await newDashboardService.getSummary(jwt, {
    dateFrom: '2026-01',
    dateTo: '2026-11',
  });
  console.log('Overview kpis qualified/eligible', {
    eligible: sum.kpis.eligibleGps,
    qualified: sum.kpis.qualifiedGps,
    bronze: sum.kpis.bronzeGps,
  });

  // GP-level from actions or raw query via drilldown after picking a district with issues
  // Direct SQL matching overview CTE logic
  const bad = await query(`
    WITH gp AS (
      SELECT
        e.gp_id,
        MAX(e.gp_name) AS gp_name,
        ISNULL(MAX(e.gp_population), 0) AS population,
        ISNULL(SUM(e.tested_naat), 0) AS tests,
        ISNULL(SUM(e.tb_diagnosed), 0) AS cases
      FROM dbo.tb_mukt_entries e
      WHERE e.status='SUBMITTED'
        AND e.reporting_year=2026 AND e.reporting_month BETWEEN 1 AND 11
      GROUP BY e.gp_id
    ),
    calc AS (
      SELECT g.*,
        CAST(CEILING(g.population * 30 / 1000.0) AS INT) AS target,
        CASE WHEN g.population > 0 AND g.cases * 1000 <= g.population THEN 1 ELSE 0 END AS eligible
      FROM gp g
    )
    SELECT TOP 40 gp_name, population, tests, cases, target, eligible,
      CASE WHEN eligible = 1 AND tests >= target THEN 1 ELSE 0 END AS qualified_old,
      CASE WHEN eligible = 1 AND population > 0 AND tests > 0 AND target > 0 AND tests >= target THEN 1 ELSE 0 END AS qualified_new
    FROM calc
    WHERE tests = 0 AND (eligible = 1 AND tests >= target)
    ORDER BY population
  `);
  console.log('Overview-logic: tests=0 but qualified_old=1', bad.recordset);

  // Block dashboard: month tested 0 but is_qualified yes (YTD)
  const line = await query(`
    SELECT TOP 20
      gp_name,
      SUM(CASE WHEN reporting_month=11 THEN tested_naat ELSE 0 END) AS nov_tests,
      SUM(CASE WHEN reporting_month BETWEEN 1 AND 11 THEN tested_naat ELSE 0 END) AS ytd_tests,
      MAX(CASE WHEN reporting_month BETWEEN 1 AND 11 THEN CAST(is_qualified AS INT) ELSE 0 END) AS isQualified
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED' AND reporting_year=2026 AND block_id=575
    GROUP BY gp_id, gp_name
    HAVING SUM(CASE WHEN reporting_month=11 THEN tested_naat ELSE 0 END)=0
      AND MAX(CASE WHEN reporting_month BETWEEN 1 AND 11 THEN CAST(is_qualified AS INT) ELSE 0 END)=1
  `);
  console.log('Kakori: Nov tests=0 but YTD qualified=1', line.recordset.length, line.recordset.slice(0, 10));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
