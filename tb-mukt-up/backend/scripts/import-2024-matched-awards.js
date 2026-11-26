/**
 * Import 2024 awards for Matched GPs from Line List Excel
 * into dbo.tb_mukt_qualification_history.
 *
 * Safety:
 * - Reads only the "Matched" sheet
 * - Year fixed to 2024
 * - INSERT only when (gp_id, 2024) does not exist
 * - Never UPDATE / DELETE (existing 2025/2026+ rows untouched)
 *
 * Usage:
 *   node scripts/import-2024-matched-awards.js              # dry-run
 *   node scripts/import-2024-matched-awards.js --apply      # write
 *   node scripts/import-2024-matched-awards.js --file "C:\path\file.xlsx" --apply
 */
require('dotenv').config();
const path = require('path');
const ExcelJS = require('exceljs');
const { query } = require('../src/config/db');

const YEAR = 2024;
const DEFAULT_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  '2024_GP_Matched_Unmatched.xlsx'
);

const MEDAL_RANK = { BRONZE: 1, SILVER: 2, GOLD: 3 };

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const idx = argv.indexOf('--file');
  const file = idx >= 0 && argv[idx + 1] ? argv[idx + 1] : DEFAULT_FILE;
  return { apply, file };
}

function normalizeMedal(raw) {
  if (raw == null || raw === '') return null;
  const m = String(raw).trim().toUpperCase();
  if (m === 'BRONZE' || m === 'SILVER' || m === 'GOLD') return m;
  return null;
}

function medalMeta(medal) {
  if (medal === 'GOLD') return { consecutive: 3, previous: 'SILVER' };
  if (medal === 'SILVER') return { consecutive: 2, previous: 'BRONZE' };
  return { consecutive: 1, previous: 'NONE' };
}

function pickBetter(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (MEDAL_RANK[b.medal] || 0) > (MEDAL_RANK[a.medal] || 0) ? b : a;
}

async function loadMatchedRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Matched');
  if (!ws) throw new Error('Sheet "Matched" not found');

  const headerRow = ws.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, col) => {
    headers[String(cell.value || '').trim()] = col;
  });

  const need = [
    'Line List S.No.',
    'District',
    'Block',
    'Line List Panchayat Name',
    'Award Category',
    'UPKSK GP Name',
    'UPKSK LGD Code',
  ];
  for (const h of need) {
    if (!headers[h]) throw new Error(`Missing column: ${h}`);
  }

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const lgdRaw = row.getCell(headers['UPKSK LGD Code']).value;
    const award = normalizeMedal(row.getCell(headers['Award Category']).value);
    const upkskName = row.getCell(headers['UPKSK GP Name']).value;
    const lineName = row.getCell(headers['Line List Panchayat Name']).value;
    const district = row.getCell(headers['District']).value;
    const block = row.getCell(headers['Block']).value;
    const sno = row.getCell(headers['Line List S.No.']).value;

    let lgd = lgdRaw;
    if (lgd && typeof lgd === 'object' && lgd.result != null) lgd = lgd.result;
    if (lgd != null && lgd !== '') lgd = String(lgd).trim();
    else lgd = null;

    rows.push({
      rowNumber,
      sno,
      district: district != null ? String(district).trim() : '',
      block: block != null ? String(block).trim() : '',
      lineName: lineName != null ? String(lineName).trim() : '',
      upkskName: upkskName != null ? String(upkskName).trim() : '',
      lgd,
      medal: award,
    });
  });
  return rows;
}

async function loadGpByLgd() {
  const res = await query(`
    SELECT
      PK_UniqueID AS gpId,
      GramPanchayatName AS gpName,
      CAST(G_LGD AS NVARCHAR(50)) AS lgd,
      Fk_DistrictId AS districtId,
      Fk_BlockId AS blockId
    FROM dbo.GramPanchayat
    WHERE ISNULL(IsDeleted, 0) = 0
      AND G_LGD IS NOT NULL
  `);
  const map = new Map();
  for (const r of res.recordset) {
    const key = String(r.lgd).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

async function existingYearGpIds() {
  const res = await query(`
    SELECT gp_id AS gpId FROM dbo.tb_mukt_qualification_history WHERE year = @year
  `, { year: YEAR });
  return new Set(res.recordset.map((r) => Number(r.gpId)));
}

async function main() {
  const { apply, file } = parseArgs(process.argv.slice(2));
  console.log({ mode: apply ? 'APPLY' : 'DRY-RUN', file, year: YEAR });

  const excelRows = await loadMatchedRows(file);
  console.log('Matched sheet rows:', excelRows.length);

  const gpByLgd = await loadGpByLgd();
  const existing = await existingYearGpIds();
  console.log(`Existing ${YEAR} history rows:`, existing.size);

  const stats = {
    excelRows: excelRows.length,
    skippedNoLgd: 0,
    skippedNoMedal: 0,
    skippedLgdNotInMaster: 0,
    skippedAmbiguousLgd: 0,
    skippedAlreadyExists: 0,
    toInsert: 0,
    inserted: 0,
  };

  /** @type {Map<number, any>} */
  const byGp = new Map();
  const problems = [];

  for (const row of excelRows) {
    if (!row.medal) {
      stats.skippedNoMedal += 1;
      problems.push({ reason: 'no_medal', ...row });
      continue;
    }
    if (!row.lgd) {
      stats.skippedNoLgd += 1;
      problems.push({ reason: 'no_lgd', ...row });
      continue;
    }
    const matches = gpByLgd.get(row.lgd) || [];
    if (matches.length === 0) {
      stats.skippedLgdNotInMaster += 1;
      problems.push({ reason: 'lgd_not_in_master', ...row });
      continue;
    }
    if (matches.length > 1) {
      stats.skippedAmbiguousLgd += 1;
      problems.push({
        reason: 'ambiguous_lgd',
        lgd: row.lgd,
        matches: matches.map((m) => m.gpId),
        ...row,
      });
      continue;
    }

    const gp = matches[0];
    const candidate = {
      gpId: Number(gp.gpId),
      gpName: gp.gpName,
      districtId: gp.districtId,
      blockId: gp.blockId,
      medal: row.medal,
      lgd: row.lgd,
      sourceRow: row.rowNumber,
      lineName: row.lineName,
    };
    byGp.set(candidate.gpId, pickBetter(byGp.get(candidate.gpId), candidate));
  }

  const toInsert = [];
  for (const cand of byGp.values()) {
    if (existing.has(cand.gpId)) {
      stats.skippedAlreadyExists += 1;
      continue;
    }
    toInsert.push(cand);
  }
  stats.toInsert = toInsert.length;

  console.log('Unique matched GPs (resolvable):', byGp.size);
  console.log('Will insert:', toInsert.length);
  console.log('Stats so far:', stats);
  console.log(
    'Medal mix to insert:',
    Object.fromEntries(
      ['BRONZE', 'SILVER', 'GOLD'].map((m) => [m, toInsert.filter((x) => x.medal === m).length])
    )
  );

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to insert.');
    console.log('Sample inserts:', toInsert.slice(0, 5));
    console.log('Problem sample:', problems.slice(0, 10));
    process.exit(0);
  }

  // Snapshot counts before write (prove 2026 untouched)
  const before = await query(`
    SELECT year, COUNT(*) AS n FROM dbo.tb_mukt_qualification_history GROUP BY year ORDER BY year
  `);
  console.log('Before:', before.recordset);

  for (const row of toInsert) {
    const meta = medalMeta(row.medal);
    await query(
      `
      IF NOT EXISTS (
        SELECT 1 FROM dbo.tb_mukt_qualification_history
        WHERE gp_id = @gpId AND year = @year
      )
      INSERT INTO dbo.tb_mukt_qualification_history
        (gp_id, gp_name, district_id, block_id, year, qualified, medal, previous_year_status, consecutive_years)
      VALUES
        (@gpId, @gpName, @districtId, @blockId, @year, 1, @medal, @prevStatus, @consecutive)
      `,
      {
        gpId: row.gpId,
        gpName: row.gpName,
        districtId: row.districtId,
        blockId: row.blockId,
        year: YEAR,
        medal: row.medal,
        prevStatus: meta.previous,
        consecutive: meta.consecutive,
      }
    );
    stats.inserted += 1;
  }

  const after = await query(`
    SELECT year, medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    GROUP BY year, medal
    ORDER BY year, medal
  `);
  console.log('After:', after.recordset);
  console.log('Done:', stats);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
