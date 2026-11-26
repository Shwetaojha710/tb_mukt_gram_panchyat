/**
 * Import 2024 cumulative (Jan–Oct) presumptive testing / diagnosis
 * from Downloads/2024 GP Data/Data from District/AGRA.xlsx
 * into dbo.tb_mukt_entries as one SUBMITTED row per GP:
 *   reporting_year=2024, reporting_month=10
 *
 * Safety:
 * - INSERT only when (gp_id, 2024, 10) does not exist
 * - Never UPDATE / DELETE existing entries (2025/2026 untouched)
 * - Does NOT rewrite tb_mukt_qualification_history (keeps award import)
 *
 * Usage:
 *   node scripts/import-2024-agra-entries.js              # dry-run
 *   node scripts/import-2024-agra-entries.js --apply
 *   node scripts/import-2024-agra-entries.js --block Jagner --apply
 */
require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { query } = require('../src/config/db');
const { computeIndicators } = require('../src/utils/calculations');

const YEAR = 2024;
const MONTH = 10; // cumulative Jan–Oct sheet → store as Oct 2024
const DEFAULT_FILE = path.join(
  process.env.USERPROFILE || '',
  'Downloads',
  '2024 GP Data',
  'Data from District',
  'AGRA.xlsx'
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
    if (Array.isArray(value.richText)) {
      return value.richText.map((p) => p.text || '').join('');
    }
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
  }
  return String(value);
}

async function loadExcelRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws =
    wb.getWorksheet('Agra TB GP 690 (2)') ||
    wb.worksheets.find((s) => /agra/i.test(s.name)) ||
    wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found');

  // Row 2 = headers (some cells are richText → [object Object] if String()'d)
  const headerRow = ws.getRow(2);
  const headers = {};
  headerRow.eachCell((cell, col) => {
    const h = cellText(cell.value).replace(/\s+/g, ' ').trim().toLowerCase();
    if (h && h !== '[object object]') headers[h] = col;
  });

  // Known layout for Agra TB GP 690 (2) as fallback
  let colTu =
    headers['name of tb unit'] ||
    Object.entries(headers).find(([k]) => k.includes('tb unit'))?.[1] ||
    3;
  let colGp =
    headers['name of gram panchayat'] ||
    Object.entries(headers).find(([k]) => k.includes('gram panchayat') && !k.includes('population'))?.[1] ||
    4;
  let colPop =
    Object.entries(headers).find(([k]) => k.includes('population'))?.[1] || 5;
  let colTests =
    Object.entries(headers).find(([k]) => k.includes('presumptive') && k.includes('test'))?.[1] || 7;
  let colDiag =
    Object.entries(headers).find(([k]) => k.includes('diagnosed') || k.includes('patient'))?.[1] || 9;

  console.log('Column map', { colTu, colGp, colPop, colTests, colDiag, headers: Object.keys(headers) });

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    const gpName = cellText(row.getCell(colGp).value).trim();
    if (!gpName) return;
    if (gpName.toUpperCase() === 'E' || gpName.length < 2) return;

    const tu = cellText(row.getCell(colTu).value).trim();
    const popRaw = row.getCell(colPop).value;
    const testsRaw = row.getCell(colTests).value;
    const diagRaw = row.getCell(colDiag).value;

    const population = Math.round(Number(popRaw) || 0);
    const tested = Math.round(Number(testsRaw) || 0);
    const diagnosed = Math.round(Number(diagRaw) || 0);
    if (!Number.isFinite(tested)) return;

    rows.push({
      rowNumber,
      tbUnit: tu,
      gpName,
      population,
      tested,
      diagnosed,
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
      AND (
        d.DistrictName LIKE 'Agra%'
        OR d.DistrictName LIKE 'AGRA%'
      )
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

  // contains either way
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
    SELECT gp_id AS gpId
    FROM dbo.tb_mukt_entries
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
      treatmentSuccessPct: null, // not in district sheet
      poshanEligible: 0,
      poshanConsented: 0,
      poshanReceived: 0,
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
      calcs,
      how: m.how,
      excelGp: row.gpName,
      rowNumber: row.rowNumber,
    });
  }
  stats.toInsert = toInsert.length;

  console.log('Stats', stats);
  console.log('Sample insert', toInsert.slice(0, 5));
  console.log('Problem sample', problems.slice(0, 8));

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to insert.');
    process.exit(0);
  }

  const before = await query(`
    SELECT reporting_year AS y, COUNT(*) AS n
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED'
    GROUP BY reporting_year
    ORDER BY y
  `);
  console.log('Entries before:', before.recordset);

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
        NULL, 0, 0, 0,
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
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED'
    GROUP BY reporting_year
    ORDER BY y
  `);
  const jagner = await query(`
    SELECT COUNT(*) AS n, SUM(tested_naat) AS tests
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED' AND reporting_year=2024 AND reporting_month=10 AND block_id=11
  `);
  const awards = await query(`
    SELECT medal, COUNT(*) AS n FROM dbo.tb_mukt_qualification_history
    WHERE year=2024 AND block_id=11 GROUP BY medal
  `);

  console.log('Entries after:', after.recordset);
  console.log('Jagner 2024-10 entries:', jagner.recordset[0]);
  console.log('Jagner 2024 awards (untouched check):', awards.recordset);
  console.log('Done', stats);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
