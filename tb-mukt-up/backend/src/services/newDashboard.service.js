const ExcelJS = require('exceljs');
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/**
 * New dashboard (Dashboard_TBMP_V.2.xlsx) — read-only aggregates.
 * Independent of dashboard.service.js; only SELECTs against existing tables.
 *
 * Per-GP figures are cumulative over the selected reporting period:
 *   Eligible  = TB cases <= 1 per 1,000 population
 *   Qualified = Eligible AND presumptive tests >= 30 per 1,000 population
 *   Tests pending = tests still needed to reach 30 per 1,000 population
 */

const LEVEL_ROLES = {
  state: ['STATE', 'DIVISION'],
  district: ['STATE', 'DIVISION', 'DISTRICT'],
  block: ['STATE', 'DIVISION', 'DISTRICT', 'TEHSIL', 'BLOCK'],
};

const BUCKETS = ['None', '1-10', '11-20', '21-30', '31-50', 'Above 50'];
const AWARDS = ['BRONZE', 'SILVER', 'GOLD', 'NOT_QUALIFIED'];

const ACTION_TYPES = {
  'pending-tests': { where: 'm.tests_pending > 0', defaultSort: 'testsPending' },
  'zero-case-pending': { where: 'm.cases = 0 AND m.tests_pending > 0', defaultSort: 'testsPending' },
  'poshan-pending': { where: 'm.poshan_pending > 0', defaultSort: 'poshanPending' },
};

const ACTION_SORT = {
  gpName: 'm.gp_name',
  blockName: 'm.block_name',
  districtName: 'm.district_name',
  population: 'm.population',
  tests: 'm.tests',
  cases: 'm.cases',
  testsPending: 'm.tests_pending',
  consented: 'm.consented',
  poshanPending: 'm.poshan_pending',
};

function toId(raw, name) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(`Invalid ${name}`, 400);
  return n;
}

function userScopeId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePeriod(text, name) {
  if (text == null || text === '') return null;
  const match = String(text).match(/^(\d{4})-(\d{1,2})$/);
  const year = match ? Number(match[1]) : 0;
  const month = match ? Number(match[2]) : 0;
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    throw new AppError(`Invalid ${name} (expected YYYY-MM)`, 400);
  }
  return { year, month };
}

/** Validates filters and applies the logged-in user's geography (same rules as the existing dashboard). */
function resolveContext(user, filters = {}, { needLevel = true } = {}) {
  const role = String(user.role || '').toUpperCase();

  let districtId = toId(filters.districtId, 'districtId');
  let blockId = toId(filters.blockId ?? filters.tehsilId, 'blockId');
  let gpId = toId(filters.gpId, 'gpId');
  let divisionId = null;

  if (role === 'DIVISION') divisionId = userScopeId(user.divisionId);
  if (role === 'DISTRICT') districtId = userScopeId(user.districtId) || districtId;
  if (role === 'TEHSIL' || role === 'BLOCK') {
    districtId = userScopeId(user.districtId) || districtId;
    blockId = userScopeId(user.blockId) || userScopeId(user.tehsilId) || blockId;
  }

  let level = null;
  if (needLevel) {
    const fallback = LEVEL_ROLES.state.includes(role) ? 'state' : role === 'DISTRICT' ? 'district' : 'block';
    level = String(filters.level || fallback).toLowerCase();
    if (!Object.hasOwn(LEVEL_ROLES, level)) throw new AppError('Invalid level (state | district | block)', 400);
    if (!LEVEL_ROLES[level].includes(role)) {
      throw new AppError(`The ${level} view is not available for your role`, 403);
    }
    if (level === 'district' && !districtId) throw new AppError('districtId is required for the district view', 400);
    if (level === 'block' && !blockId) throw new AppError('blockId is required for the block view', 400);
    // State and district views aggregate everything below them
    if (level !== 'block') {
      if (!['TEHSIL', 'BLOCK'].includes(role)) blockId = null;
      gpId = null;
    }
  }

  const now = new Date();
  const to = parsePeriod(filters.dateTo, 'dateTo') || { year: now.getFullYear(), month: now.getMonth() + 1 };
  const from = parsePeriod(filters.dateFrom, 'dateFrom') || { year: to.year, month: 1 };
  if (from.year > to.year || (from.year === to.year && from.month > to.month)) {
    throw new AppError('From period cannot be after To period', 400);
  }

  return { level, divisionId, districtId, blockId, gpId, from, to };
}

/** WITH gp AS (per-GP totals for the period), m AS (gp + derived metrics) */
function buildGpCte(ctx) {
  const where = [
    `e.status = 'SUBMITTED'`,
    `(e.reporting_year > @fromYear OR (e.reporting_year = @fromYear AND e.reporting_month >= @fromMonth))`,
    `(e.reporting_year < @toYear OR (e.reporting_year = @toYear AND e.reporting_month <= @toMonth))`,
  ];
  const params = {
    fromYear: ctx.from.year,
    fromMonth: ctx.from.month,
    toYear: ctx.to.year,
    toMonth: ctx.to.month,
  };

  if (ctx.divisionId) {
    where.push('e.division_id = @divisionId');
    params.divisionId = ctx.divisionId;
  }
  if (ctx.districtId) {
    where.push('e.district_id = @districtId');
    params.districtId = ctx.districtId;
  }
  if (ctx.blockId) {
    where.push('e.block_id = @blockId');
    params.blockId = ctx.blockId;
  }
  if (ctx.gpId) {
    where.push('e.gp_id = @gpId');
    params.gpId = ctx.gpId;
  }

  const cte = `
    WITH gp AS (
      SELECT
        e.gp_id,
        MAX(e.gp_name) AS gp_name,
        MAX(e.district_id) AS district_id,
        MAX(e.district_name) AS district_name,
        MAX(e.block_id) AS block_id,
        MAX(e.block_name) AS block_name,
        ISNULL(MAX(e.gp_population), 0) AS population,
        ISNULL(SUM(e.tested_naat), 0) AS tests,
        ISNULL(SUM(e.tb_diagnosed), 0) AS cases,
        ISNULL(SUM(e.poshan_consented), 0) AS consented,
        ISNULL(SUM(e.poshan_received), 0) AS received
      FROM dbo.tb_mukt_entries e
      WHERE ${where.join(' AND ')}
      GROUP BY e.gp_id
    ),
    calc AS (
      SELECT
        g.*,
        CAST(CEILING(g.population * 30 / 1000.0) AS INT) AS target,
        CASE WHEN g.population > 0 AND g.cases * 1000 <= g.population THEN 1 ELSE 0 END AS eligible,
        CASE WHEN g.consented > g.received THEN g.consented - g.received ELSE 0 END AS poshan_pending,
        CASE WHEN q.medal IN ('BRONZE', 'SILVER', 'GOLD') THEN q.medal ELSE 'NOT_QUALIFIED' END AS award
      FROM gp g
      LEFT JOIN dbo.tb_mukt_qualification_history q
        ON q.gp_id = g.gp_id AND q.year = @toYear
    ),
    m AS (
      SELECT
        c.*,
        CASE WHEN c.eligible = 1 AND c.tests >= c.target THEN 1 ELSE 0 END AS qualified,
        CASE WHEN c.target > c.tests THEN c.target - c.tests ELSE 0 END AS tests_pending
      FROM calc c
    )`;

  return { cte, params };
}

const BUCKET_CASE = `
  CASE
    WHEN m.tests_pending <= 0 THEN 'None'
    WHEN m.tests_pending <= 10 THEN '1-10'
    WHEN m.tests_pending <= 20 THEN '11-20'
    WHEN m.tests_pending <= 30 THEN '21-30'
    WHEN m.tests_pending <= 50 THEN '31-50'
    ELSE 'Above 50'
  END`;

/** Shared aggregate columns for totals and for district/block grouped rows. */
const AGG_COLUMNS = `
  COUNT(*) AS reportingGps,
  ISNULL(SUM(m.eligible), 0) AS eligibleGps,
  ISNULL(SUM(m.qualified), 0) AS qualifiedGps,
  ISNULL(SUM(CASE WHEN m.award = 'BRONZE' THEN 1 ELSE 0 END), 0) AS bronzeGps,
  ISNULL(SUM(CASE WHEN m.award = 'SILVER' THEN 1 ELSE 0 END), 0) AS silverGps,
  ISNULL(SUM(CASE WHEN m.award = 'GOLD' THEN 1 ELSE 0 END), 0) AS goldGps,
  ISNULL(SUM(CASE WHEN m.tests_pending > 50 THEN 1 ELSE 0 END), 0) AS pendingAbove50,
  ISNULL(SUM(CASE WHEN m.cases = 0 THEN 1 ELSE 0 END), 0) AS zeroCaseGps,
  ISNULL(SUM(CASE WHEN m.cases = 0 AND m.tests_pending > 0 THEN 1 ELSE 0 END), 0) AS zeroCasePendingGps,
  ISNULL(SUM(CASE WHEN m.poshan_pending > 0 THEN 1 ELSE 0 END), 0) AS poshanPendingGps,
  ISNULL(SUM(m.cases), 0) AS cases,
  ISNULL(SUM(m.consented), 0) AS consented,
  ISNULL(SUM(m.poshan_pending), 0) AS poshanPending`;

/** Master counts (dbo.District / dbo.Block / dbo.GramPanchayat) for the geography in view. */
async function getMasterTotals(ctx) {
  const params = {};
  const district = ['ISNULL(d.IsDeleted, 0) = 0'];
  const block = ['ISNULL(b.IsDeleted, 0) = 0'];
  const gp = ['ISNULL(g.IsDeleted, 0) = 0'];

  if (ctx.divisionId) {
    params.divisionId = ctx.divisionId;
    district.push('d.FK_DivisionID = @divisionId');
    block.push('b.FK_DivisionID = @divisionId');
    gp.push('g.FK_DivisionID = @divisionId');
  }
  if (ctx.districtId) {
    params.districtId = ctx.districtId;
    district.push('d.PK_UniqueID = @districtId');
    block.push('b.FK_DistrictID = @districtId');
    gp.push('g.FK_DistrictID = @districtId');
  }
  if (ctx.blockId) {
    params.blockId = ctx.blockId;
    block.push('b.PK_UniqueID = @blockId');
    gp.push('g.FK_BlockID = @blockId');
  }
  if (ctx.gpId) {
    params.gpId = ctx.gpId;
    gp.push('g.PK_UniqueId = @gpId');
  }

  const result = await query(
    `
    SELECT
      (SELECT COUNT(*) FROM dbo.District d WHERE ${district.join(' AND ')}) AS totalDistricts,
      (SELECT COUNT(*) FROM dbo.Block b WHERE ${block.join(' AND ')}) AS totalBlocks,
      (SELECT COUNT(*) FROM dbo.GramPanchayat g WHERE ${gp.join(' AND ')}) AS totalGps
    `,
    params
  );
  return result.recordset[0];
}

async function getScopeNames(ctx) {
  const [district, block] = await Promise.all([
    ctx.districtId
      ? query(`SELECT TOP 1 DistrictName AS name FROM dbo.District WHERE PK_UniqueID = @id`, { id: ctx.districtId })
      : null,
    ctx.blockId
      ? query(`SELECT TOP 1 BlockName AS name FROM dbo.Block WHERE PK_UniqueID = @id`, { id: ctx.blockId })
      : null,
  ]);
  return {
    districtName: district?.recordset[0]?.name || null,
    blockName: block?.recordset[0]?.name || null,
  };
}

function describe(ctx, names) {
  return {
    level: ctx.level,
    period: { from: ctx.from, to: ctx.to },
    scope: {
      districtId: ctx.districtId,
      districtName: names.districtName,
      blockId: ctx.blockId,
      blockName: names.blockName,
      gpId: ctx.gpId,
    },
  };
}

/** KPI cards + pendency-bucket and award distributions. */
async function getSummary(user, filters) {
  const ctx = resolveContext(user, filters);
  const { cte, params } = buildGpCte(ctx);

  const [totals, master, names] = await Promise.all([
    query(
      `${cte}
      SELECT
        ${AGG_COLUMNS},
        COUNT(DISTINCT m.district_id) AS reportingDistricts,
        COUNT(DISTINCT m.block_id) AS reportingBlocks,
        COUNT(DISTINCT CASE WHEN m.award = 'GOLD' THEN m.district_id END) AS districtsWithGold,
        COUNT(DISTINCT CASE WHEN m.award = 'SILVER' THEN m.district_id END) AS districtsWithSilver,
        COUNT(DISTINCT CASE WHEN m.award = 'BRONZE' THEN m.district_id END) AS districtsWithBronze,
        COUNT(DISTINCT CASE WHEN m.award = 'GOLD' THEN m.block_id END) AS blocksWithGold,
        COUNT(DISTINCT CASE WHEN m.award = 'SILVER' THEN m.block_id END) AS blocksWithSilver,
        COUNT(DISTINCT CASE WHEN m.award = 'BRONZE' THEN m.block_id END) AS blocksWithBronze,
        ISNULL(SUM(CASE WHEN m.tests_pending <= 0 THEN 1 ELSE 0 END), 0) AS bucketNone,
        ISNULL(SUM(CASE WHEN m.tests_pending BETWEEN 1 AND 10 THEN 1 ELSE 0 END), 0) AS bucket1to10,
        ISNULL(SUM(CASE WHEN m.tests_pending BETWEEN 11 AND 20 THEN 1 ELSE 0 END), 0) AS bucket11to20,
        ISNULL(SUM(CASE WHEN m.tests_pending BETWEEN 21 AND 30 THEN 1 ELSE 0 END), 0) AS bucket21to30,
        ISNULL(SUM(CASE WHEN m.tests_pending BETWEEN 31 AND 50 THEN 1 ELSE 0 END), 0) AS bucket31to50
      FROM m
      `,
      params
    ),
    getMasterTotals(ctx),
    getScopeNames(ctx),
  ]);

  const t = totals.recordset[0];
  const {
    bucketNone, bucket1to10, bucket11to20, bucket21to30, bucket31to50,
    ...kpis
  } = t;
  const bucketCounts = [bucketNone, bucket1to10, bucket11to20, bucket21to30, bucket31to50, t.pendingAbove50];
  const awardCounts = [t.bronzeGps, t.silverGps, t.goldGps, t.reportingGps - t.bronzeGps - t.silverGps - t.goldGps];

  return {
    ...describe(ctx, names),
    kpis: { ...master, ...kpis },
    buckets: BUCKETS.map((bucket, i) => ({ bucket, count: Number(bucketCounts[i]) || 0 })),
    awards: AWARDS.map((award, i) => ({ award, count: Number(awardCounts[i]) || 0 })),
  };
}

/**
 * Drilldown table one level below the view:
 * state -> district-wise, district -> block-wise, block -> GP-wise.
 */
async function getDrilldown(user, filters) {
  const ctx = resolveContext(user, filters);
  const { cte, params } = buildGpCte(ctx);
  const names = await getScopeNames(ctx);
  let rows;

  if (ctx.level === 'state') {
    const where = ['ISNULL(d.IsDeleted, 0) = 0'];
    if (ctx.divisionId) where.push('d.FK_DivisionID = @divisionId');
    if (ctx.districtId) where.push('d.PK_UniqueID = @districtId');
    const result = await query(
      `${cte},
      agg AS (
        SELECT m.district_id AS id, COUNT(DISTINCT m.block_id) AS reportingBlocks, ${AGG_COLUMNS}
        FROM m GROUP BY m.district_id
      )
      SELECT
        d.PK_UniqueID AS id,
        d.DistrictName AS name,
        (SELECT COUNT(*) FROM dbo.Block b
          WHERE b.FK_DistrictID = d.PK_UniqueID AND ISNULL(b.IsDeleted, 0) = 0) AS totalBlocks,
        (SELECT COUNT(*) FROM dbo.GramPanchayat g
          WHERE g.FK_DistrictID = d.PK_UniqueID AND ISNULL(g.IsDeleted, 0) = 0) AS totalGps,
        a.*
      FROM dbo.District d
      LEFT JOIN agg a ON a.id = d.PK_UniqueID
      WHERE ${where.join(' AND ')}
      ORDER BY d.DistrictName
      `,
      params
    );
    rows = result.recordset.map(groupRow);
  } else if (ctx.level === 'district') {
    const where = ['ISNULL(b.IsDeleted, 0) = 0', 'b.FK_DistrictID = @districtId'];
    if (ctx.blockId) where.push('b.PK_UniqueID = @blockId');
    const result = await query(
      `${cte},
      agg AS (
        SELECT m.block_id AS id, ${AGG_COLUMNS}
        FROM m GROUP BY m.block_id
      )
      SELECT
        b.PK_UniqueID AS id,
        b.BlockName AS name,
        (SELECT COUNT(*) FROM dbo.GramPanchayat g
          WHERE g.FK_BlockID = b.PK_UniqueID AND ISNULL(g.IsDeleted, 0) = 0) AS totalGps,
        a.*
      FROM dbo.Block b
      LEFT JOIN agg a ON a.id = b.PK_UniqueID
      WHERE ${where.join(' AND ')}
      ORDER BY b.BlockName
      `,
      params
    );
    rows = result.recordset.map(groupRow);
  } else {
    const result = await query(
      `${cte}
      SELECT
        m.gp_id AS id,
        m.gp_name AS name,
        m.population,
        m.tests,
        m.cases,
        m.target,
        m.eligible,
        m.qualified,
        m.award,
        m.tests_pending AS testsPending,
        ${BUCKET_CASE} AS bucket,
        CASE WHEN m.cases = 0 THEN 1 ELSE 0 END AS zeroCase,
        CASE WHEN m.cases = 0 AND m.tests_pending > 0 THEN 1 ELSE 0 END AS zeroCasePending,
        m.consented,
        m.poshan_pending AS poshanPending
      FROM m
      ORDER BY m.gp_name
      `,
      params
    );
    rows = result.recordset.map((r) => ({
      ...r,
      testedPct: r.target > 0 ? Math.min(100, Math.round((r.tests * 1000) / r.target) / 10) : 0,
    }));
  }

  return { ...describe(ctx, names), groupBy: { state: 'district', district: 'block', block: 'gp' }[ctx.level], rows };
}

function groupRow(r) {
  const num = (v) => Number(v) || 0;
  // a.* brings a duplicate "id" (array when both exist) — keep the master id
  const id = Array.isArray(r.id) ? r.id[0] : r.id;
  const totalGps = num(r.totalGps);
  const qualifiedGps = num(r.qualifiedGps);
  return {
    id,
    name: r.name,
    ...(r.totalBlocks !== undefined ? { totalBlocks: num(r.totalBlocks) } : {}),
    totalGps,
    reportingGps: num(r.reportingGps),
    eligibleGps: num(r.eligibleGps),
    qualifiedGps,
    qualifiedPct: totalGps > 0 ? Math.round((qualifiedGps * 1000) / totalGps) / 10 : 0,
    bronzeGps: num(r.bronzeGps),
    silverGps: num(r.silverGps),
    goldGps: num(r.goldGps),
    pendingAbove50: num(r.pendingAbove50),
    zeroCaseGps: num(r.zeroCaseGps),
    zeroCasePendingGps: num(r.zeroCasePendingGps),
    poshanPendingGps: num(r.poshanPendingGps),
    cases: num(r.cases),
    consented: num(r.consented),
    poshanPending: num(r.poshanPending),
  };
}

/** Paginated GP action lists (Excel "Action" sheet). */
async function getActions(user, filters) {
  const type = String(filters.type || 'pending-tests');
  const def = Object.hasOwn(ACTION_TYPES, type) ? ACTION_TYPES[type] : null;
  if (!def) throw new AppError(`Invalid type (${Object.keys(ACTION_TYPES).join(' | ')})`, 400);

  const ctx = resolveContext(user, filters, { needLevel: false });
  const { cte, params } = buildGpCte(ctx);

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  // UI pages stay small; export may request a large pageSize
  const rawSize = parseInt(filters.pageSize, 10) || 10;
  const pageSize = Math.min(rawSize > 100 ? 50000 : 100, Math.max(1, rawSize));
  const sortBy = Object.hasOwn(ACTION_SORT, filters.sortBy) ? filters.sortBy : def.defaultSort;
  const sortDir = String(filters.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where = [def.where];
  const search = String(filters.search || '').trim().slice(0, 80);
  if (search) {
    where.push(
      `(m.gp_name LIKE @search ESCAPE '\\' OR m.block_name LIKE @search ESCAPE '\\' OR m.district_name LIKE @search ESCAPE '\\')`
    );
    params.search = `%${search.replace(/[\\%_[]/g, '\\$&')}%`;
  }
  params.offset = (page - 1) * pageSize;
  params.pageSize = pageSize;

  const result = await query(
    `${cte}
    SELECT
      m.gp_id AS gpId,
      m.gp_name AS gpName,
      m.block_name AS blockName,
      m.district_name AS districtName,
      m.population,
      m.tests,
      m.cases,
      m.tests_pending AS testsPending,
      ${BUCKET_CASE} AS bucket,
      m.consented,
      m.poshan_pending AS poshanPending,
      COUNT(*) OVER () AS totalRows
    FROM m
    WHERE ${where.join(' AND ')}
    ORDER BY ${ACTION_SORT[sortBy]} ${sortDir}, m.gp_id ASC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `,
    params
  );

  const total = Number(result.recordset[0]?.totalRows) || 0;
  return {
    type,
    period: { from: ctx.from, to: ctx.to },
    page,
    pageSize,
    total,
    sortBy,
    sortDir: sortDir.toLowerCase(),
    rows: result.recordset.map(({ totalRows, ...row }) => row),
  };
}

/** Full action list for Excel export (no tight page cap). */
async function getActionsForExport(user, filters, type) {
  return getActions(user, {
    ...filters,
    type,
    page: 1,
    pageSize: 50000,
    sortBy: ACTION_TYPES[type]?.defaultSort || 'testsPending',
    sortDir: 'desc',
    search: '',
  });
}

function addSheet(workbook, name, headers, rows) {
  const ws = workbook.addWorksheet(name.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

/**
 * Excel workbook for current filters/level:
 * Summary · Drilldown · Action lists (pending tests, zero-case, poshan).
 */
async function exportWorkbook(user, filters = {}) {
  const level = String(filters.level || '').toLowerCase();
  // Derive level from geography when not passed (same as UI)
  const ctxPreview = resolveContext(user, { ...filters, level: level || undefined }, { needLevel: false });
  const exportFilters = {
    ...filters,
    level:
      level ||
      (ctxPreview.blockId ? 'block' : ctxPreview.districtId ? 'district' : 'state'),
  };

  const [summary, drilldown, pending, zeroCase, poshan] = await Promise.all([
    getSummary(user, exportFilters),
    getDrilldown(user, exportFilters),
    getActionsForExport(user, exportFilters, 'pending-tests'),
    getActionsForExport(user, exportFilters, 'zero-case-pending'),
    getActionsForExport(user, exportFilters, 'poshan-pending'),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TB Mukt UP';
  workbook.created = new Date();

  const k = summary.kpis || {};
  addSheet(
    workbook,
    'Summary',
    ['Metric', 'Value'],
    [
      ['Level', summary.level],
      ['From', `${summary.period?.from?.year}-${summary.period?.from?.month}`],
      ['To', `${summary.period?.to?.year}-${summary.period?.to?.month}`],
      ['District', summary.scope?.districtName || 'All'],
      ['Block', summary.scope?.blockName || 'All'],
      ['Total Districts', k.totalDistricts],
      ['Total Blocks', k.totalBlocks],
      ['Total GPs', k.totalGps],
      ['Reporting GPs', k.reportingGps],
      ['Eligible GPs', k.eligibleGps],
      ['Qualified GPs', k.qualifiedGps],
      ['Gold GPs', k.goldGps],
      ['Silver GPs', k.silverGps],
      ['Bronze GPs', k.bronzeGps],
      ['Pending Above 50', k.pendingAbove50],
      ['Zero-case GPs', k.zeroCaseGps],
      ['Zero-case but tests pending', k.zeroCasePendingGps],
      ['Poshan pending GPs', k.poshanPendingGps],
      ...((summary.buckets || []).map((b) => [`Tests pending · ${b.bucket}`, b.count])),
      ...((summary.awards || []).map((a) => [`Award · ${a.award}`, a.count])),
    ]
  );

  if (drilldown.groupBy === 'gp') {
    addSheet(
      workbook,
      'GP Drilldown',
      [
        'GP Name',
        'Population',
        'Eligible',
        'Qualified',
        'Award',
        'Tests Pending',
        'Bucket',
        '0-Case',
        '0-Case + Pending',
        'Consented',
        'Poshan Pending',
      ],
      (drilldown.rows || []).map((r) => [
        r.name,
        r.population,
        Number(r.eligible) ? 'Yes' : 'No',
        Number(r.qualified) ? 'Yes' : 'No',
        r.award || '',
        r.testsPending,
        r.bucket,
        Number(r.zeroCase) ? 'Yes' : 'No',
        Number(r.zeroCasePending) ? 'Yes' : 'No',
        r.consented,
        r.poshanPending,
      ])
    );
  } else {
    const nameLabel = drilldown.groupBy === 'district' ? 'District' : 'Block';
    addSheet(
      workbook,
      `${nameLabel} Drilldown`,
      [
        nameLabel,
        'Total Blocks',
        'Total GPs',
        'Reporting GPs',
        'Eligible GPs',
        'Qualified GPs',
        '% Qualified',
        'Gold',
        'Silver',
        'Bronze',
        'Pending Above 50',
        '0-Case GPs',
        '0-Case + Pending',
        'Consented',
        'Poshan Pending',
      ],
      (drilldown.rows || []).map((r) => [
        r.name,
        r.totalBlocks ?? '',
        r.totalGps,
        r.reportingGps,
        r.eligibleGps,
        r.qualifiedGps,
        r.qualifiedPct,
        r.goldGps,
        r.silverGps,
        r.bronzeGps,
        r.pendingAbove50,
        r.zeroCaseGps,
        r.zeroCasePendingGps,
        r.consented,
        r.poshanPending,
      ])
    );
  }

  const actionHeaders = [
    'GP Name',
    'Block',
    'District',
    'Population',
    'Tests',
    'Cases',
    'Tests Pending',
    'Bucket',
    'Consented',
    'Poshan Pending',
  ];
  const mapAction = (r) => [
    r.gpName,
    r.blockName,
    r.districtName,
    r.population,
    r.tests,
    r.cases,
    r.testsPending,
    r.bucket,
    r.consented,
    r.poshanPending,
  ];

  addSheet(workbook, 'Pending Tests', actionHeaders, (pending.rows || []).map(mapAction));
  addSheet(workbook, 'Zero Case Pending', actionHeaders, (zeroCase.rows || []).map(mapAction));
  addSheet(workbook, 'Poshan Pending', actionHeaders, (poshan.rows || []).map(mapAction));

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  getSummary,
  getDrilldown,
  getActions,
  exportWorkbook,
};
