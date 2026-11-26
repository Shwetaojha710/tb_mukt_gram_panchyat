/**
 * Import 2025 cumulative (Jan–Dec) testing / diagnosis / poshan
 * from Downloads/GP 2025 data/GP 2025 data/Agra.xlsx
 * into dbo.tb_mukt_entries as one SUBMITTED row per GP:
 *   reporting_year=2025, reporting_month=12
 *
 * Safety:
 * - INSERT only when (gp_id, 2025, 12) does not exist
 * - Never UPDATE / DELETE (2024 / 2026 entries untouched)
 * - Does NOT rewrite tb_mukt_qualification_history (keeps award import)
 *
 * Usage:
 *   node scripts/import-2025-agra-entries.js              # dry-run
 *   node scripts/import-2025-agra-entries.js --apply
 *   node scripts/import-2025-agra-entries.js --block Jagner --apply
 */
require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { query } = require('../src/config/db');
const { computeIndicators } = require('../src/utils/calculations');

const YEAR = 2025;
const MONTH = 12; // cumulative Jan–Dec → store as Dec 2025
const DEFAULT_FILE = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  'GP 2025 data',
  'GP 2025 data',
  'Agra.xlsx'
);

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const bi = argv.indexOf('--block');
  const blockFilter = bi >= 0 && argv[bi + 1] ? String(argv[bi + 1]).trim() : null;
  const fi = argv.indexOf('--file');
  const file = fi >= 0 && argv[fi + 1] ? argv[fi + 1] : DEFAULT_FILE;
  return { apply, blockFilter, file };
}

function norm(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((p) => p.text || '').join('');
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
  }
  return String(value);
}

function parseCount(value, yesFallback = 0) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const s = cellText(value).trim();
  if (!s) return 0;
  const up = s.toUpperCase();
  if (up === 'YES' || up === 'Y') return yesFallback;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function loadExcelRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws =
    wb.getWorksheet('Agra Analysis (2)') ||
    wb.getWorksheet('Agra Analysis') ||
    wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found');

  // Row 3 = headers for 2025 Agra sheets
  const headerRow = ws.getRow(3);
  const headers = {};
  headerRow.eachCell((cell, col) => {
    const h = cellText(cell.value).replace(/\s+/g, ' ').trim().toLowerCase();
    if (h && h !== '[object object]') headers[h] = col;
  });

  const colTu =
    Object.entries(headers).find(([k]) => k.includes('tb unit'))?.[1] || 3;
  const colGp =
    Object.entries(headers).find(
      ([k]) => k.includes('gram panchayat') && !k.includes('population')
    )?.[1] || 4;
  const colPop =
    Object.entries(headers).find(([k]) => k.includes('population'))?.[1] || 5;
  const colTests =
    Object.entries(headers).find(
      ([k]) => k.includes('presumptive') && k.includes('2025')
    )?.[1] ||
    Object.entries(headers).find(([k]) => k.includes('presumptive tb tests'))?.[1] ||
    7;
  const colDiag =
    Object.entries(headers).find(
      ([k]) => k.includes('diagnosed') && k.includes('2025')
    )?.[1] ||
    Object.entries(headers).find(
      ([k]) => k.includes('diagnosed') && k.includes('notification')
    )?.[1] ||
    8;
  const colPoshan =
    Object.entries(headers).find(([k]) => k.includes('poshan'))?.[1] || 11;

  console.log('Sheet', ws.name, 'columns', {
    colTu,
    colGp,
    colPop,
    colTests,
    colDiag,
    colPoshan,
  });

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    const gpName = cellText(row.getCell(colGp).value).trim();
    if (!gpName || gpName.length < 2) return;

    const tu = cellText(row.getCell(colTu).value).trim();
    const population = Math.round(Number(row.getCell(colPop).value) || 0);
    const tested = parseCount(row.getCell(colTests).value);
    const diagnosed = parseCount(row.getCell(colDiag).value);
    const poshanRaw = row.getCell(colPoshan).value;
    let poshanReceived = parseCount(poshanRaw, diagnosed);
    // If sheet says YES and diagnosed>0, treat as all received
    const poshanText = cellText(poshanRaw).trim().toUpperCase();
    if ((poshanText === 'YES' || poshanText === 'Y') && diagnosed > 0) {
      poshanReceived = diagnosed;
    }

    rows.push({
      rowNumber,
      tbUnit: tu,
      gpName,
      population,
      tested,
      diagnosed,
      poshanReceived,
      poshanEligible: diagnosed > 0 ? diagnosed : 0,
      poshanConsented: diagnosed > 0 ? diagnosed : 0,
    });
  });
  return rows;
}

async function loadAgraGps() {
  const res = await query(`
    SELECT
      g.PK_UniqueID AS gpId,
      g.GramPanchayatName AS gpName,
      CAST(g.G_LGD AS NVARCHAR(50)) AS lgd,
      g.Fk_BlockId AS blockId,
      b.BlockName AS blockName,
      CAST(b.B_LGD AS NVARCHAR(50)) AS blockCode,
      g.Fk_DistrictId AS districtId,
      d.DistrictName AS districtName,
      CAST(d.D_LGD AS NVARCHAR(50)) AS districtCode,
      d.Fk_DivisionID AS divisionId
    FROM dbo.GramPanchayat g
    INNER JOIN dbo.Block b ON b.PK_UniqueID = g.Fk_BlockId
    INNER JOIN dbo.District d ON d.PK_UniqueID = g.Fk_DistrictId
    WHERE ISNULL(g.IsDeleted,0)=0
      AND ISNULL(b.IsDeleted,0)=0
      AND (d.DistrictName LIKE 'Agra%' OR d.DistrictName LIKE 'AGRA%')
  `);
  return res.recordset;
}

function matchGp(excelRow, gps) {
  const nGp = norm(excelRow.gpName);
  const nTu = norm(excelRow.tbUnit);
  const inTuBlock = gps.filter((g) => {
    const nb = norm(g.blockName);
    return nb === nTu || nb.includes(nTu) || nTu.includes(nb);
  });
  const pool = inTuBlock.length ? inTuBlock : gps;
  const exact = pool.filter((g) => norm(g.gpName) === nGp);
  if (exact.length === 1) return { gp: exact[0], how: inTuBlock.length ? 'tu+exact' : 'district-exact' };
  if (exact.length > 1) return { gp: null, how: 'ambiguous-exact', candidates: exact.map((g) => g.gpId) };
  const fuzzy = pool.filter((g) => {
    const ng = norm(g.gpName);
    return ng.includes(nGp) || nGp.includes(ng);
  });
  if (fuzzy.length === 1) return { gp: fuzzy[0], how: inTuBlock.length ? 'tu+fuzzy' : 'district-fuzzy' };
  if (fuzzy.length > 1) return { gp: null, how: 'ambiguous-fuzzy', candidates: fuzzy.map((g) => g.gpId) };
  return { gp: null, how: 'not-found' };
}

async function existingKeys() {
  const res = await query(
    `
    SELECT gp_id AS gpId FROM dbo.tb_mukt_entries
    WHERE reporting_year=@year AND reporting_month=@month
    `,
    { year: YEAR, month: MONTH }
  );
  return new Set(res.recordset.map((r) => Number(r.gpId)));
}

async function main() {
  const { apply, blockFilter, file } = parseArgs(process.argv.slice(2));
  console.log({ mode: apply ? 'APPLY' : 'DRY-RUN', file, year: YEAR, month: MONTH, blockFilter });

  const excelRows = await loadExcelRows(file);
  console.log('Excel data rows', excelRows.length);

  let filtered = excelRows;
  if (blockFilter) {
    const nb = norm(blockFilter);
    filtered = excelRows.filter((r) => norm(r.tbUnit) === nb || norm(r.tbUnit).includes(nb));
    console.log(`After --block ${blockFilter}:`, filtered.length);
  }

  const gps = await loadAgraGps();
  console.log('Agra master GPs', gps.length);
  const existing = await existingKeys();
  console.log(`Existing ${YEAR}-${MONTH} entries:`, existing.size);

  const stats = {
    excel: filtered.length,
    matched: 0,
    skippedNotFound: 0,
    skippedAmbiguous: 0,
    skippedExists: 0,
    toInsert: 0,
    inserted: 0,
  };
  const toInsert = [];
  const problems = [];

  for (const row of filtered) {
    const m = matchGp(row, gps);
    if (!m.gp) {
      if (String(m.how).startsWith('ambiguous')) stats.skippedAmbiguous += 1;
      else stats.skippedNotFound += 1;
      problems.push({ reason: m.how, ...row, candidates: m.candidates });
      continue;
    }
    stats.matched += 1;
    if (existing.has(Number(m.gp.gpId))) {
      stats.skippedExists += 1;
      continue;
    }

    const population = row.population > 0 ? row.population : 0;
    const calcs = computeIndicators({
      gpPopulation: population,
      testedNaat: row.tested,
      tbDiagnosed: row.diagnosed,
      treatmentSuccessPct: null,
      poshanEligible: row.poshanEligible,
      poshanConsented: row.poshanConsented,
      poshanReceived: row.poshanReceived,
    });

    toInsert.push({
      gpId: Number(m.gp.gpId),
      gpName: m.gp.gpName,
      gpCode: m.gp.lgd || null,
      blockId: m.gp.blockId,
      blockName: m.gp.blockName,
      blockCode: m.gp.blockCode || null,
      districtId: m.gp.districtId,
      districtName: m.gp.districtName,
      districtCode: m.gp.districtCode || null,
      divisionId: m.gp.divisionId || null,
      tbUnitName: row.tbUnit || null,
      population,
      tested: row.tested,
      diagnosed: row.diagnosed,
      poshanEligible: row.poshanEligible,
      poshanConsented: row.poshanConsented,
      poshanReceived: row.poshanReceived,
      calcs,
      how: m.how,
      excelGp: row.gpName,
      rowNumber: row.rowNumber,
    });
  }
  stats.toInsert = toInsert.length;
  console.log('Stats', stats);
  console.log('Sample', toInsert.slice(0, 3));
  console.log('Problems', problems.slice(0, 8));

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to insert.');
    process.exit(0);
  }

  const before = await query(`
    SELECT reporting_year AS y, COUNT(*) AS n
    FROM dbo.tb_mukt_entries WHERE status='SUBMITTED'
    GROUP BY reporting_year ORDER BY y
  `);
  console.log('Before', before.recordset);

  for (const row of toInsert) {
    const c = row.calcs;
    await query(
      `
      IF NOT EXISTS (
        SELECT 1 FROM dbo.tb_mukt_entries
        WHERE gp_id=@gpId AND reporting_year=@year AND reporting_month=@month
      )
      INSERT INTO dbo.tb_mukt_entries (
        state_id, division_id, district_id, district_code, district_name, tehsil_id,
        block_id, block_code, block_name, gp_id, gp_code, gp_name, gp_population,
        village_id, village_code, village_name, village_population, tb_unit_id, tb_unit_name,
        reporting_month, reporting_year, tested_naat, tb_diagnosed, prev_year_success_treatment,
        treatment_success_pct, poshan_eligible, poshan_consented, poshan_received,
        testing_rate, detection_rate, poshan_pct,
        indicator1, indicator2, indicator3, indicator4, is_qualified,
        overall_target, testing_pending, poshan_pending, status, created_by, updated_by
      ) VALUES (
        NULL, @divisionId, @districtId, @districtCode, @districtName, NULL,
        @blockId, @blockCode, @blockName, @gpId, @gpCode, @gpName, @population,
        NULL, NULL, NULL, NULL, NULL, @tbUnitName,
        @month, @year, @tested, @diagnosed, 0,
        NULL, @poshanEligible, @poshanConsented, @poshanReceived,
        @testingRate, @detectionRate, @poshanPct,
        @indicator1, @indicator2, @indicator3, @indicator4, @isQualified,
        @overallTarget, @testingPending, @poshanPending, 'SUBMITTED', NULL, NULL
      )
      `,
      {
        divisionId: row.divisionId,
        districtId: row.districtId,
        districtCode: row.districtCode,
        districtName: row.districtName,
        blockId: row.blockId,
        blockCode: row.blockCode,
        blockName: row.blockName,
        gpId: row.gpId,
        gpCode: row.gpCode,
        gpName: row.gpName,
        population: row.population,
        tbUnitName: row.tbUnitName,
        month: MONTH,
        year: YEAR,
        tested: row.tested,
        diagnosed: row.diagnosed,
        poshanEligible: row.poshanEligible,
        poshanConsented: row.poshanConsented,
        poshanReceived: row.poshanReceived,
        testingRate: c.testingRate,
        detectionRate: c.detectionRate,
        poshanPct: c.poshanPct,
        indicator1: c.indicator1 ? 1 : 0,
        indicator2: c.indicator2 ? 1 : 0,
        indicator3: c.indicator3 ? 1 : 0,
        indicator4: c.indicator4 ? 1 : 0,
        isQualified: c.qualified ? 1 : 0,
        overallTarget: c.overallTarget,
        testingPending: c.testingPending,
        poshanPending: c.poshanPending,
      }
    );
    stats.inserted += 1;
  }

  const after = await query(`
    SELECT reporting_year AS y, COUNT(*) AS n
    FROM dbo.tb_mukt_entries WHERE status='SUBMITTED'
    GROUP BY reporting_year ORDER BY y
  `);
  const jagner = await query(`
    SELECT COUNT(*) AS n, SUM(tested_naat) AS tests
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED' AND reporting_year=2025 AND reporting_month=12 AND block_id=11
  `);
  const awards = await query(`
    SELECT year, medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    WHERE block_id=11 AND year IN (2024,2025)
    GROUP BY year, medal ORDER BY year, medal
  `);
  console.log('After', after.recordset);
  console.log('Jagner 2025-12', jagner.recordset[0]);
  console.log('Jagner awards still', awards.recordset);
  console.log('Done', stats);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
