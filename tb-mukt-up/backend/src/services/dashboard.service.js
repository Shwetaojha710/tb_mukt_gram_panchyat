const ExcelJS = require('exceljs');
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

function parseYearMonth(dateText) {
  if (!dateText) return null;
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function applyReportingPeriodFilter(where, params, filters = {}) {
  const from = parseYearMonth(filters.dateFrom);
  const to = parseYearMonth(filters.dateTo);

  if (from) {
    where.push(`(e.reporting_year > @fromYear OR (e.reporting_year = @fromYear AND e.reporting_month >= @fromMonth))`);
    params.fromYear = from.year;
    params.fromMonth = from.month;
  }
  if (to) {
    where.push(`(e.reporting_year < @toYear OR (e.reporting_year = @toYear AND e.reporting_month <= @toMonth))`);
    params.toYear = to.year;
    params.toMonth = to.month;
  }
}

function applyScope(user, filters = {}) {
  const where = ['1=1'];
  const params = {};

  if (user.role === 'DIVISION' && user.divisionId) {
    where.push('e.division_id = @scopeDivisionId');
    params.scopeDivisionId = user.divisionId;
  }
  if (user.role === 'DISTRICT' && user.districtId) {
    where.push('e.district_id = @scopeDistrictId');
    params.scopeDistrictId = user.districtId;
  }
  if (user.role === 'TEHSIL' && user.tehsilId) {
    where.push('e.tehsil_id = @scopeTehsilId');
    params.scopeTehsilId = user.tehsilId;
  }
  if (user.role === 'BLOCK' && user.blockId) {
    where.push('e.block_id = @scopeBlockId');
    params.scopeBlockId = user.blockId;
  }
  if ((user.role === 'GP' || user.role === 'VILLAGE') && user.gpId) {
    where.push('e.gp_id = @scopeGpId');
    params.scopeGpId = user.gpId;
  }

  if (filters.districtId) {
    where.push('e.district_id = @districtId');
    params.districtId = Number(filters.districtId);
  }
  if (filters.blockId) {
    where.push('e.block_id = @blockId');
    params.blockId = Number(filters.blockId);
  }
  if (filters.gpId) {
    where.push('e.gp_id = @gpId');
    params.gpId = Number(filters.gpId);
  }
  if (filters.year) {
    where.push('e.reporting_year = @year');
    params.year = Number(filters.year);
  }
  if (filters.reportingMonth) {
    where.push('e.reporting_month = @reportingMonth');
    params.reportingMonth = Number(filters.reportingMonth);
  }
  if (filters.monthFrom) {
    where.push('e.reporting_month >= @monthFrom');
    params.monthFrom = Number(filters.monthFrom);
  }
  if (filters.monthTo) {
    where.push('e.reporting_month <= @monthTo');
    params.monthTo = Number(filters.monthTo);
  }
  // Date range is applied on reporting period (year/month), not created_at timestamp.
  applyReportingPeriodFilter(where, params, filters);

  where.push(`e.status = 'SUBMITTED'`);
  return { whereSql: where.join(' AND '), params };
}

async function getSummary(user, filters) {
  const { whereSql, params } = applyScope(user, filters);
  const year = Number(filters.year) || new Date().getFullYear();
  const reportingMonth = Number(filters.reportingMonth) || new Date().getMonth() + 1;
  params.qYear = year;
  params.reportingMonth = reportingMonth;
  params.prevYear = year - 1;

  // Reporting-month only metrics (ignore reportingMonth filter in where for YTD queries)
  const { whereSql: baseWhere, params: baseParams } = applyScope(user, {
    ...filters,
    reportingMonth: undefined,
    monthFrom: undefined,
    monthTo: undefined,
    dateFrom: undefined,
    dateTo: undefined,
  });
  baseParams.qYear = year;
  baseParams.reportingMonth = reportingMonth;
  baseParams.prevYear = year - 1;

  const monthKpi = await query(
    `
    SELECT
      COUNT(DISTINCT e.gp_id) AS totalGps,
      ISNULL(SUM(e.tested_naat), 0) AS testedNaatMonth,
      ISNULL(SUM(e.tb_diagnosed), 0) AS diagnosedMonth,
      ISNULL(SUM(CASE WHEN ISNULL(e.treatment_success_pct, 0) > 90 THEN 1 ELSE 0 END), 0) AS treatmentOver90Month,
      ISNULL(SUM(e.poshan_received), 0) AS poshanReceivedMonth,
      ISNULL(SUM(e.poshan_eligible), 0) AS poshanEligibleMonth
    FROM dbo.tb_mukt_entries e
    WHERE ${baseWhere}
      AND e.reporting_year = @qYear
      AND e.reporting_month = @reportingMonth
    `,
    baseParams
  );

  const ytdKpi = await query(
    `
    SELECT
      ISNULL(SUM(e.tested_naat), 0) AS testedNaatYtd,
      ISNULL(SUM(e.tb_diagnosed), 0) AS diagnosedYtd,
      ISNULL(SUM(CASE WHEN ISNULL(e.treatment_success_pct, 0) > 90 THEN 1 ELSE 0 END), 0) AS treatmentOver90Ytd,
      ISNULL(SUM(e.poshan_received), 0) AS poshanReceivedYtd,
      ISNULL(SUM(e.poshan_eligible), 0) AS poshanEligibleYtd,
      ISNULL(SUM(e.testing_pending), 0) AS testingPendingYtd,
      ISNULL(SUM(e.poshan_pending), 0) AS poshanPendingYtd,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGpsYtd,
      COUNT(DISTINCT e.gp_id) AS totalGpsYtd
    FROM dbo.tb_mukt_entries e
    WHERE ${baseWhere}
      AND e.reporting_year = @qYear
      AND e.reporting_month BETWEEN 1 AND @reportingMonth
    `,
    baseParams
  );

  const kpi = await query(
    `
    SELECT
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 0 THEN e.gp_id END) AS notQualifiedGps,
      ISNULL(SUM(e.overall_target), 0) AS testingTarget,
      ISNULL(SUM(e.tested_naat), 0) AS testingCompleted,
      ISNULL(SUM(e.tb_diagnosed), 0) AS diagnosedTotal,
      ISNULL(SUM(e.prev_year_success_treatment), 0) AS previousYearTxSuccessCount,
      ISNULL(SUM(CASE WHEN ISNULL(e.treatment_success_pct, 0) > 90 THEN 1 ELSE 0 END), 0) AS treatmentOver90Gps,
      ISNULL(SUM(e.poshan_received), 0) AS poshanReceivedTotal,
      ISNULL(SUM(e.poshan_eligible), 0) AS poshanEligibleTotal,
      ISNULL(SUM(e.testing_pending), 0) AS testingPending,
      ISNULL(SUM(e.poshan_pending), 0) AS poshanPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    `,
    params
  );

  const medals = await query(
    `
    SELECT
      ISNULL(SUM(CASE WHEN q.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) AS bronzeGps,
      ISNULL(SUM(CASE WHEN q.medal = 'SILVER' THEN 1 ELSE 0 END), 0) AS silverGps,
      ISNULL(SUM(CASE WHEN q.medal = 'GOLD' THEN 1 ELSE 0 END), 0) AS goldGps
    FROM dbo.tb_mukt_qualification_history q
    INNER JOIN (
      SELECT DISTINCT gp_id, district_id, block_id, division_id FROM dbo.tb_mukt_entries e
      WHERE ${baseWhere} AND e.reporting_year = @qYear AND e.reporting_month BETWEEN 1 AND @reportingMonth
    ) e ON e.gp_id = q.gp_id
    WHERE q.year = @qYear
    `,
    baseParams
  );

  const districtMedalPerformance = await query(
    `
    SELECT
      ISNULL(SUM(CASE WHEN d.goldGps > 0 THEN 1 ELSE 0 END), 0) AS districtsWithGold,
      ISNULL(SUM(CASE WHEN d.silverGps > 0 THEN 1 ELSE 0 END), 0) AS districtsWithSilver,
      ISNULL(SUM(CASE WHEN d.bronzeGps > 0 THEN 1 ELSE 0 END), 0) AS districtsWithBronze,
      COUNT(*) AS totalDistricts
    FROM (
      SELECT
        e.district_id,
        ISNULL(SUM(CASE WHEN q.medal = 'GOLD' THEN 1 ELSE 0 END), 0) AS goldGps,
        ISNULL(SUM(CASE WHEN q.medal = 'SILVER' THEN 1 ELSE 0 END), 0) AS silverGps,
        ISNULL(SUM(CASE WHEN q.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) AS bronzeGps
      FROM (
        SELECT DISTINCT gp_id, district_id FROM dbo.tb_mukt_entries e
        WHERE ${baseWhere} AND e.reporting_year = @qYear AND e.reporting_month BETWEEN 1 AND @reportingMonth
      ) e
      LEFT JOIN dbo.tb_mukt_qualification_history q
        ON q.gp_id = e.gp_id AND q.year = @qYear
      GROUP BY e.district_id
    ) d
    `,
    baseParams
  );

  const blockMedalPerformance = await query(
    `
    SELECT
      ISNULL(SUM(CASE WHEN b.goldGps > 0 THEN 1 ELSE 0 END), 0) AS blocksWithGold,
      ISNULL(SUM(CASE WHEN b.silverGps > 0 THEN 1 ELSE 0 END), 0) AS blocksWithSilver,
      ISNULL(SUM(CASE WHEN b.bronzeGps > 0 THEN 1 ELSE 0 END), 0) AS blocksWithBronze,
      COUNT(*) AS totalBlocks
    FROM (
      SELECT
        e.block_id,
        ISNULL(SUM(CASE WHEN q.medal = 'GOLD' THEN 1 ELSE 0 END), 0) AS goldGps,
        ISNULL(SUM(CASE WHEN q.medal = 'SILVER' THEN 1 ELSE 0 END), 0) AS silverGps,
        ISNULL(SUM(CASE WHEN q.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) AS bronzeGps
      FROM (
        SELECT DISTINCT gp_id, block_id FROM dbo.tb_mukt_entries e
        WHERE ${baseWhere} AND e.reporting_year = @qYear AND e.reporting_month BETWEEN 1 AND @reportingMonth
      ) e
      LEFT JOIN dbo.tb_mukt_qualification_history q
        ON q.gp_id = e.gp_id AND q.year = @qYear
      GROUP BY e.block_id
    ) b
    `,
    baseParams
  );

  const monthly = await query(
    `
    SELECT e.reporting_month AS month,
      COUNT(DISTINCT e.gp_id) AS gps,
      SUM(CASE WHEN e.is_qualified = 1 THEN 1 ELSE 0 END) AS qualified,
      SUM(e.tested_naat) AS tested,
      SUM(e.overall_target) AS target,
      SUM(e.testing_pending) AS pending
    FROM dbo.tb_mukt_entries e
    WHERE ${baseWhere} AND e.reporting_year = @qYear
    GROUP BY e.reporting_month
    ORDER BY e.reporting_month
    `,
    baseParams
  );

  const cumulative = await query(
    `
    SELECT
      ISNULL(SUM(e.tested_naat), 0) AS tested,
      ISNULL(SUM(e.tb_diagnosed), 0) AS diagnosed,
      ISNULL(SUM(e.prev_year_success_treatment), 0) AS previousYearTxSuccessCount,
      ISNULL(SUM(CASE WHEN ISNULL(e.treatment_success_pct, 0) > 90 THEN 1 ELSE 0 END), 0) AS treatmentOver90Gps,
      ISNULL(SUM(e.poshan_received), 0) AS poshanReceived,
      ISNULL(SUM(e.poshan_eligible), 0) AS poshanEligible,
      ISNULL(SUM(e.overall_target), 0) AS target,
      ISNULL(SUM(e.testing_pending), 0) AS pending,
      ISNULL(SUM(e.poshan_pending), 0) AS poshanPending,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps
    FROM dbo.tb_mukt_entries e
    WHERE ${baseWhere} AND e.reporting_month BETWEEN 1 AND @reportingMonth AND e.reporting_year = @qYear
    `,
    baseParams
  );

  const pendingBuckets = await query(
    `
    SELECT
      ISNULL(SUM(CASE WHEN g.pending BETWEEN 1 AND 10 THEN 1 ELSE 0 END), 0) AS bucket1to10,
      ISNULL(SUM(CASE WHEN g.pending BETWEEN 11 AND 20 THEN 1 ELSE 0 END), 0) AS bucket11to20,
      ISNULL(SUM(CASE WHEN g.pending BETWEEN 21 AND 30 THEN 1 ELSE 0 END), 0) AS bucket21to30,
      ISNULL(SUM(CASE WHEN g.pending BETWEEN 31 AND 50 THEN 1 ELSE 0 END), 0) AS bucket31to50,
      ISNULL(SUM(CASE WHEN g.pending > 50 THEN 1 ELSE 0 END), 0) AS bucketAbove50
    FROM (
      SELECT e.gp_id, SUM(e.testing_pending) AS pending
      FROM dbo.tb_mukt_entries e
      WHERE ${baseWhere} AND e.reporting_year = @qYear AND e.reporting_month BETWEEN 1 AND @reportingMonth
      GROUP BY e.gp_id
    ) g
    `,
    baseParams
  );

  const previousYearMedals = await query(
    `
    SELECT
      ISNULL(SUM(CASE WHEN q.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) AS prevBronzeGps,
      ISNULL(SUM(CASE WHEN q.medal = 'SILVER' THEN 1 ELSE 0 END), 0) AS prevSilverGps,
      ISNULL(SUM(CASE WHEN q.medal = 'GOLD' THEN 1 ELSE 0 END), 0) AS prevGoldGps
    FROM dbo.tb_mukt_qualification_history q
    INNER JOIN (
      SELECT DISTINCT gp_id FROM dbo.tb_mukt_entries e WHERE ${baseWhere}
    ) e ON e.gp_id = q.gp_id
    WHERE q.year = @prevYear
    `,
    baseParams
  );

  return {
    reportingMonth,
    year,
    kpis: {
      ...kpi.recordset[0],
      ...medals.recordset[0],
      ...pendingBuckets.recordset[0],
      ...previousYearMedals.recordset[0],
      ...monthKpi.recordset[0],
      ...ytdKpi.recordset[0],
      ...districtMedalPerformance.recordset[0],
      ...blockMedalPerformance.recordset[0],
    },
    monthly: monthly.recordset,
    cumulativeYtd: cumulative.recordset[0],
  };
}

async function getRankings(user, filters) {
  const { whereSql, params } = applyScope(user, filters);

  const gpRanking = await query(
    `
    SELECT TOP 100
      e.gp_id AS gpId, MAX(e.gp_name) AS gpName,
      MAX(e.block_name) AS blockName, MAX(e.district_name) AS districtName,
      SUM(e.testing_pending) AS testingPending,
      SUM(e.tested_naat) AS testingCompleted,
      MAX(CAST(e.is_qualified AS INT)) AS isQualified
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.gp_id
    ORDER BY SUM(e.testing_pending) ASC
    `,
    params
  );

  const pendingDesc = await query(
    `
    SELECT TOP 10
      e.gp_id AS gpId, MAX(e.gp_name) AS gpName, MAX(e.block_name) AS blockName,
      MAX(e.district_name) AS districtName, SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.gp_id
    ORDER BY SUM(e.testing_pending) DESC
    `,
    params
  );

  const pendingAsc = await query(
    `
    SELECT TOP 10
      e.gp_id AS gpId, MAX(e.gp_name) AS gpName, MAX(e.block_name) AS blockName,
      MAX(e.district_name) AS districtName, SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.gp_id
    ORDER BY SUM(e.testing_pending) ASC
    `,
    params
  );

  const blockRanking = await query(
    `
    SELECT
      e.block_id AS blockId, MAX(e.block_name) AS blockName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.block_id
    ORDER BY qualifiedGps DESC, testingPending ASC
    `,
    params
  );

  const districtRanking = await query(
    `
    SELECT
      e.district_id AS districtId, MAX(e.district_name) AS districtName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.district_id
    ORDER BY qualifiedGps DESC, testingPending ASC
    `,
    params
  );

  const year = Number(filters.year) || new Date().getFullYear();
  const reportingMonth = Number(filters.reportingMonth) || new Date().getMonth() + 1;
  params.qYear = year;
  params.prevYear = year - 1;
  params.reportingMonth = reportingMonth;

  // Year-scoped (no single-month lock) so month + YTD columns can both be computed
  const { whereSql: lineWhere, params: lineParams } = applyScope(user, {
    ...filters,
    reportingMonth: undefined,
    monthFrom: undefined,
    monthTo: undefined,
  });
  lineParams.qYear = year;
  lineParams.prevYear = year - 1;
  lineParams.reportingMonth = reportingMonth;

  const qualifiedList = await query(
    `
    SELECT
      e.gp_id AS gpId,
      MAX(e.gp_name) AS gpName,
      MAX(e.gp_code) AS gpCode,
      MAX(e.block_name) AS blockName,
      MAX(e.block_code) AS blockCode,
      MAX(e.district_name) AS districtName,
      MAX(e.district_code) AS districtCode,
      MAX(e.gp_population) AS gpPopulation,
      ISNULL(NULLIF(MAX(e.tb_unit_name), ''), 'N/A') AS tbUnitName,
      MAX(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN CAST(e.is_qualified AS INT) ELSE 0 END) AS isQualified,
      MAX(q.medal) AS medal,
      MAX(pq.medal) AS previousMedal
    FROM dbo.tb_mukt_entries e
    LEFT JOIN dbo.tb_mukt_qualification_history q
      ON q.gp_id = e.gp_id AND q.year = @qYear
    LEFT JOIN dbo.tb_mukt_qualification_history pq
      ON pq.gp_id = e.gp_id AND pq.year = @prevYear
    WHERE ${lineWhere} AND e.reporting_year = @qYear
    GROUP BY e.gp_id
    ORDER BY MAX(e.district_name), MAX(e.block_name), MAX(e.gp_name)
    `,
    lineParams
  );

  const tbUnitGpLineList = await query(
    `
    SELECT
      N'Uttar Pradesh' AS stateName,
      MAX(e.district_code) AS districtCode,
      MAX(e.district_name) AS districtName,
      MAX(e.block_code) AS blockCode,
      MAX(e.block_name) AS blockName,
      e.gp_id AS gpId,
      MAX(e.gp_code) AS gpCode,
      MAX(e.gp_name) AS gpName,
      MAX(e.gp_population) AS gpPopulation,
      MAX(e.village_code) AS villageCode,
      MAX(e.village_name) AS villageName,
      MAX(e.village_population) AS villagePopulation,
      ISNULL(NULLIF(MAX(e.tb_unit_name), ''), 'N/A') AS tbUnitName,
      ISNULL(SUM(CASE WHEN e.reporting_month = @reportingMonth THEN e.tested_naat ELSE 0 END), 0) AS testedNaatMonth,
      ISNULL(SUM(CASE WHEN e.reporting_month = @reportingMonth THEN e.tb_diagnosed ELSE 0 END), 0) AS diagnosedMonth,
      ISNULL(SUM(CASE WHEN e.reporting_month = @reportingMonth THEN e.prev_year_success_treatment ELSE 0 END), 0) AS treatmentOver90Month,
      ISNULL(SUM(CASE WHEN e.reporting_month = @reportingMonth THEN e.poshan_received ELSE 0 END), 0) AS poshanReceivedMonth,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.tested_naat ELSE 0 END), 0) AS testedNaatYtd,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.tb_diagnosed ELSE 0 END), 0) AS diagnosedYtd,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.prev_year_success_treatment ELSE 0 END), 0) AS treatmentOver90Ytd,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.poshan_received ELSE 0 END), 0) AS poshanReceivedYtd,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) AS testingPendingYtd,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.poshan_pending ELSE 0 END), 0) AS poshanPendingYtd,
      CASE
        WHEN ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) BETWEEN 1 AND 10 THEN '1-10'
        WHEN ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) BETWEEN 11 AND 20 THEN '11-20'
        WHEN ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) BETWEEN 21 AND 30 THEN '21-30'
        WHEN ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) BETWEEN 31 AND 50 THEN '31-50'
        WHEN ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) > 50 THEN 'Above 50'
        ELSE '0'
      END AS testingPendingBucket,
      MAX(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN CAST(e.is_qualified AS INT) ELSE 0 END) AS isQualified,
      MAX(q.medal) AS medal,
      MAX(pq.medal) AS previousMedal,
      -- legacy aliases used by district/block views
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.tested_naat ELSE 0 END), 0) AS testedNaat,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.tb_diagnosed ELSE 0 END), 0) AS tbDiagnosed,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.poshan_received ELSE 0 END), 0) AS poshanReceived,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.poshan_eligible ELSE 0 END), 0) AS poshanEligible,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.testing_pending ELSE 0 END), 0) AS testingPending,
      ISNULL(SUM(CASE WHEN e.reporting_month BETWEEN 1 AND @reportingMonth THEN e.poshan_pending ELSE 0 END), 0) AS poshanPending
    FROM dbo.tb_mukt_entries e
    LEFT JOIN dbo.tb_mukt_qualification_history q
      ON q.gp_id = e.gp_id AND q.year = @qYear
    LEFT JOIN dbo.tb_mukt_qualification_history pq
      ON pq.gp_id = e.gp_id AND pq.year = @prevYear
    WHERE ${lineWhere} AND e.reporting_year = @qYear
    GROUP BY e.gp_id, e.tb_unit_name
    ORDER BY MAX(e.district_name), MAX(e.block_name), MAX(e.gp_name), e.tb_unit_name
    `,
    lineParams
  );

  const topDistricts = await query(
    `
    SELECT TOP 10
      e.district_id AS districtId, MAX(e.district_name) AS districtName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.district_id
    ORDER BY SUM(e.testing_pending) ASC
    `,
    params
  );

  const bottomDistricts = await query(
    `
    SELECT TOP 10
      e.district_id AS districtId, MAX(e.district_name) AS districtName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.district_id
    ORDER BY SUM(e.testing_pending) DESC
    `,
    params
  );

  const topBlocks = await query(
    `
    SELECT TOP 10
      e.block_id AS blockId, MAX(e.block_name) AS blockName, MAX(e.district_name) AS districtName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.block_id
    ORDER BY SUM(e.testing_pending) ASC
    `,
    params
  );

  const bottomBlocks = await query(
    `
    SELECT TOP 10
      e.block_id AS blockId, MAX(e.block_name) AS blockName, MAX(e.district_name) AS districtName,
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      SUM(e.testing_pending) AS testingPending
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql}
    GROUP BY e.block_id
    ORDER BY SUM(e.testing_pending) DESC
    `,
    params
  );

  return {
    gpRanking: gpRanking.recordset,
    top10LeastPending: pendingAsc.recordset,
    bottom10MostPending: pendingDesc.recordset,
    blockRanking: blockRanking.recordset,
    districtRanking: districtRanking.recordset,
    top10Districts: topDistricts.recordset,
    bottom10Districts: bottomDistricts.recordset,
    top10Blocks: topBlocks.recordset,
    bottom10Blocks: bottomBlocks.recordset,
    qualifiedGpList: qualifiedList.recordset.filter((r) => Number(r.isQualified) === 1),
    gpStatusLineList: qualifiedList.recordset,
    tbUnitGpLineList: tbUnitGpLineList.recordset,
  };
}

async function exportWorkbook(user, filters) {
  const summary = await getSummary(user, filters);
  const rankings = await getRankings(user, filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TB Mukt UP';
  const k = summary.kpis || {};

  const listSheet = workbook.addWorksheet('Line List');
  listSheet.addRow([
    'State Name',
    'District Code',
    'District Name',
    'Block Code',
    'Block Name',
    'GP Code',
    'GP Name',
    'GP Population',
    'Village Code',
    'Village Name',
    'Village Population',
    'TB Unit Name',
    'Presumptive tested NAAT (Reporting month)',
    'TB diagnosed among tested (Reporting month)',
    'Prev-year Tx success >90% (Reporting month)',
    'Poshan Potli received (Reporting month)',
    'Presumptive tested NAAT (Jan–reporting month)',
    'TB diagnosed among tested (Jan–reporting month)',
    'Prev-year Tx success >90% (Jan–reporting month)',
    'Poshan Potli received (Jan–reporting month)',
    'Testing pending to qualify (Jan–reporting month)',
    'Testing pending bucket',
    'Poshan Potli pending (Jan–reporting month)',
    'GP qualified (Yes/No)',
    'Current Status (Bronze/Silver/Gold)',
    'Previous year status (Bronze/Silver/Gold)',
  ]);
  (rankings.tbUnitGpLineList || []).forEach((r) =>
    listSheet.addRow([
      r.stateName || 'Uttar Pradesh',
      r.districtCode,
      r.districtName,
      r.blockCode,
      r.blockName,
      r.gpCode,
      r.gpName,
      r.gpPopulation,
      r.villageCode,
      r.villageName,
      r.villagePopulation,
      r.tbUnitName,
      r.testedNaatMonth,
      r.diagnosedMonth,
      r.treatmentOver90Month,
      r.poshanReceivedMonth,
      r.testedNaatYtd,
      r.diagnosedYtd,
      r.treatmentOver90Ytd,
      r.poshanReceivedYtd,
      r.testingPendingYtd,
      r.testingPendingBucket,
      r.poshanPendingYtd,
      Number(r.isQualified) ? 'Yes' : 'No',
      r.medal || 'NONE',
      r.previousMedal || 'NONE',
    ])
  );

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['Metric', 'Value']);
  summarySheet.addRow(['GPs qualified (Jan–reporting month)', k.qualifiedGpsYtd]);
  summarySheet.addRow(['Bronze GPs', k.bronzeGps]);
  summarySheet.addRow(['Silver GPs', k.silverGps]);
  summarySheet.addRow(['Gold GPs', k.goldGps]);
  summarySheet.addRow(['Testing pending bucket 1-10', k.bucket1to10]);
  summarySheet.addRow(['Testing pending bucket 11-20', k.bucket11to20]);
  summarySheet.addRow(['Testing pending bucket 21-30', k.bucket21to30]);
  summarySheet.addRow(['Testing pending bucket 31-50', k.bucket31to50]);
  summarySheet.addRow(['Testing pending bucket Above 50', k.bucketAbove50]);
  summarySheet.addRow(['Districts with Gold GPs', k.districtsWithGold]);
  summarySheet.addRow(['Districts with Silver GPs', k.districtsWithSilver]);
  summarySheet.addRow(['Districts with Bronze GPs', k.districtsWithBronze]);
  summarySheet.addRow(['Blocks with Gold GPs', k.blocksWithGold]);
  summarySheet.addRow(['Blocks with Silver GPs', k.blocksWithSilver]);
  summarySheet.addRow(['Blocks with Bronze GPs', k.blocksWithBronze]);

  const rankSheet = workbook.addWorksheet('Rankings');
  rankSheet.addRow(['Rank Type', 'Name', 'Qualified GPs', 'Total GPs', 'Testing Pending']);
  (rankings.top10Districts || []).forEach((r) =>
    rankSheet.addRow(['Top 10 Districts (least pending)', r.districtName, r.qualifiedGps, r.totalGps, r.testingPending])
  );
  (rankings.bottom10Districts || []).forEach((r) =>
    rankSheet.addRow(['Bottom 10 Districts (most pending)', r.districtName, r.qualifiedGps, r.totalGps, r.testingPending])
  );
  (rankings.top10Blocks || []).forEach((r) =>
    rankSheet.addRow(['Top 10 Blocks (least pending)', r.blockName, r.qualifiedGps, r.totalGps, r.testingPending])
  );
  (rankings.bottom10Blocks || []).forEach((r) =>
    rankSheet.addRow(['Bottom 10 Blocks (most pending)', r.blockName, r.qualifiedGps, r.totalGps, r.testingPending])
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

function assertDashboardAccess(user, level) {
  const map = {
    state: ['STATE'],
    district: ['STATE', 'DIVISION', 'DISTRICT'],
    block: ['STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'],
  };
  if (!(map[level] || []).includes(user.role) && user.role !== 'STATE') {
    // Allow higher roles always; lower roles to their level
    if (level === 'block' && ['GP', 'VILLAGE'].includes(user.role)) {
      throw new AppError('Use GP-scoped views for your role', 403);
    }
  }
}

module.exports = {
  getSummary,
  getRankings,
  exportWorkbook,
  assertDashboardAccess,
};
