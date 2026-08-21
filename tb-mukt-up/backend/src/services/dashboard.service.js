const ExcelJS = require('exceljs');
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

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
  if (filters.monthFrom) {
    where.push('e.reporting_month >= @monthFrom');
    params.monthFrom = Number(filters.monthFrom);
  }
  if (filters.monthTo) {
    where.push('e.reporting_month <= @monthTo');
    params.monthTo = Number(filters.monthTo);
  }
  if (filters.dateFrom) {
    where.push('e.created_at >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    where.push('e.created_at <= @dateTo');
    params.dateTo = filters.dateTo;
  }

  where.push(`e.status = 'SUBMITTED'`);
  return { whereSql: where.join(' AND '), params };
}

async function getSummary(user, filters) {
  const { whereSql, params } = applyScope(user, filters);
  const year = Number(filters.year) || new Date().getFullYear();
  params.qYear = year;

  const kpi = await query(
    `
    SELECT
      COUNT(DISTINCT e.gp_id) AS totalGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 0 THEN e.gp_id END) AS notQualifiedGps,
      ISNULL(SUM(e.overall_target), 0) AS testingTarget,
      ISNULL(SUM(e.tested_naat), 0) AS testingCompleted,
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
      SELECT DISTINCT gp_id, district_id, block_id, division_id FROM dbo.tb_mukt_entries e WHERE ${whereSql}
    ) e ON e.gp_id = q.gp_id
    WHERE q.year = @qYear
    `,
    params
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
    WHERE ${whereSql}
    GROUP BY e.reporting_month
    ORDER BY e.reporting_month
    `,
    params
  );

  const currentMonth = new Date().getMonth() + 1;
  const cumulative = await query(
    `
    SELECT
      ISNULL(SUM(e.tested_naat), 0) AS tested,
      ISNULL(SUM(e.overall_target), 0) AS target,
      ISNULL(SUM(e.testing_pending), 0) AS pending,
      COUNT(DISTINCT CASE WHEN e.is_qualified = 1 THEN e.gp_id END) AS qualifiedGps
    FROM dbo.tb_mukt_entries e
    WHERE ${whereSql} AND e.reporting_month BETWEEN 1 AND @currentMonth AND e.reporting_year = @qYear
    `,
    { ...params, currentMonth }
  );

  return {
    kpis: {
      ...kpi.recordset[0],
      ...medals.recordset[0],
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

  const qualifiedList = await query(
    `
    SELECT DISTINCT
      e.gp_id AS gpId, e.gp_name AS gpName, e.block_name AS blockName,
      e.district_name AS districtName, e.is_qualified AS isQualified,
      q.medal
    FROM dbo.tb_mukt_entries e
    LEFT JOIN dbo.tb_mukt_qualification_history q
      ON q.gp_id = e.gp_id AND q.year = e.reporting_year
    WHERE ${whereSql} AND e.is_qualified = 1
    ORDER BY e.district_name, e.block_name, e.gp_name
    `,
    params
  );

  return {
    gpRanking: gpRanking.recordset,
    top10LeastPending: pendingAsc.recordset,
    bottom10MostPending: pendingDesc.recordset,
    blockRanking: blockRanking.recordset,
    districtRanking: districtRanking.recordset,
    qualifiedGpList: qualifiedList.recordset,
  };
}

async function exportWorkbook(user, filters) {
  const summary = await getSummary(user, filters);
  const rankings = await getRankings(user, filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TB Mukt UP';

  const kpiSheet = workbook.addWorksheet('KPIs');
  kpiSheet.addRow(['Metric', 'Value']);
  Object.entries(summary.kpis).forEach(([k, v]) => kpiSheet.addRow([k, v]));

  const monthlySheet = workbook.addWorksheet('Monthly');
  monthlySheet.addRow(['Month', 'GPs', 'Qualified', 'Tested', 'Target', 'Pending']);
  summary.monthly.forEach((r) =>
    monthlySheet.addRow([r.month, r.gps, r.qualified, r.tested, r.target, r.pending])
  );

  const listSheet = workbook.addWorksheet('Qualified GPs');
  listSheet.addRow(['GP ID', 'GP Name', 'Block', 'District', 'Medal']);
  rankings.qualifiedGpList.forEach((r) =>
    listSheet.addRow([r.gpId, r.gpName, r.blockName, r.districtName, r.medal])
  );

  const pendingSheet = workbook.addWorksheet('Pending Rank');
  pendingSheet.addRow(['GP', 'Block', 'District', 'Testing Pending']);
  rankings.bottom10MostPending.forEach((r) =>
    pendingSheet.addRow([r.gpName, r.blockName, r.districtName, r.testingPending])
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
