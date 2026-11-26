/**
 * Recalculate 2025 medals from 2024 previous-year medals
 * using consecutive progression: NONE→BRONZE→SILVER→GOLD.
 *
 * Safety:
 * - Only UPDATEs year = 2025 rows that are qualified
 * - Never touches 2024 or 2026
 * - Never INSERTs / DELETEs
 *
 * Usage:
 *   node scripts/update-2025-medals-from-2024.js           # dry-run
 *   node scripts/update-2025-medals-from-2024.js --apply   # write
 */
require('dotenv').config();
const { query } = require('../src/config/db');
const { nextMedal } = require('../src/utils/calculations');

function consecutiveFromMedal(medal) {
  if (medal === 'GOLD') return 3;
  if (medal === 'SILVER') return 2;
  if (medal === 'BRONZE') return 1;
  return 0;
}

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  console.log({ mode: apply ? 'APPLY' : 'DRY-RUN' });

  const beforeYears = await query(`
    SELECT year, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    GROUP BY year
    ORDER BY year
  `);
  console.log('Year totals before:', beforeYears.recordset);

  const before2025 = await query(`
    SELECT medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    WHERE year = 2025
    GROUP BY medal
    ORDER BY medal
  `);
  console.log('2025 medals before:', before2025.recordset);

  const rows = await query(`
    SELECT
      q25.gp_id AS gpId,
      q25.medal AS medal2025,
      q25.previous_year_status AS prevStatus2025,
      q25.consecutive_years AS consec2025,
      q24.medal AS medal2024
    FROM dbo.tb_mukt_qualification_history q25
    LEFT JOIN dbo.tb_mukt_qualification_history q24
      ON q24.gp_id = q25.gp_id AND q24.year = 2024
    WHERE q25.year = 2025
      AND q25.qualified = 1
  `);

  const changes = [];
  const unchanged = [];
  const transitions = {};

  for (const r of rows.recordset) {
    const prev = r.medal2024 || 'NONE';
    const newMedal = nextMedal(prev, true);
    const newConsec = consecutiveFromMedal(newMedal);
    const newPrevStatus =
      prev === 'NONE' || prev === 'NOT_QUALIFIED' ? 'NONE' : String(prev).toUpperCase();

    const key = `${r.medal2025 || '?'} → ${newMedal} (from 2024:${prev})`;
    transitions[key] = (transitions[key] || 0) + 1;

    if (
      String(r.medal2025).toUpperCase() === newMedal &&
      String(r.prevStatus2025 || '').toUpperCase() === newPrevStatus &&
      Number(r.consec2025) === newConsec
    ) {
      unchanged.push(r.gpId);
      continue;
    }

    changes.push({
      gpId: r.gpId,
      oldMedal: r.medal2025,
      newMedal,
      medal2024: prev,
      oldPrev: r.prevStatus2025,
      newPrevStatus,
      oldConsec: r.consec2025,
      newConsec,
    });
  }

  console.log('Qualified 2025 rows:', rows.recordset.length);
  console.log('Will update:', changes.length);
  console.log('Already correct:', unchanged.length);
  console.log('Transitions:', transitions);
  console.log('Sample changes:', changes.slice(0, 10));

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to update 2025 medals.');
    process.exit(0);
  }

  let updated = 0;
  for (const c of changes) {
    await query(
      `
      UPDATE dbo.tb_mukt_qualification_history
      SET
        medal = @medal,
        previous_year_status = @prevStatus,
        consecutive_years = @consecutive,
        updated_at = SYSUTCDATETIME()
      WHERE gp_id = @gpId
        AND year = 2025
        AND qualified = 1
      `,
      {
        gpId: c.gpId,
        medal: c.newMedal,
        prevStatus: c.newPrevStatus,
        consecutive: c.newConsec,
      }
    );
    updated += 1;
  }

  const afterYears = await query(`
    SELECT year, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    GROUP BY year
    ORDER BY year
  `);
  const after2025 = await query(`
    SELECT medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    WHERE year = 2025
    GROUP BY medal
    ORDER BY medal
  `);
  const after2024 = await query(`
    SELECT medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    WHERE year = 2024
    GROUP BY medal
    ORDER BY medal
  `);
  const after2026 = await query(`
    SELECT medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    WHERE year = 2026
    GROUP BY medal
    ORDER BY medal
  `);

  console.log('Updated rows:', updated);
  console.log('Year totals after:', afterYears.recordset);
  console.log('2024 medals (untouched):', after2024.recordset);
  console.log('2025 medals after:', after2025.recordset);
  console.log('2026 medals (untouched):', after2026.recordset);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
