/**
 * Recalculate indicator3 + is_qualified for existing tb_mukt_entries
 * using the central TREATMENT_SUCCESS_MIN_PCT (>= 92).
 *
 * Does NOT modify raw inputs (tested_naat, prev_year_success_treatment, etc.).
 * Updates tbmukt_business_config TREATMENT_SUCCESS_* to match.
 *
 * Usage: node scripts/recalc-tx-success-92.js [--dry-run]
 */
require('dotenv').config();
const { query } = require('../src/config/db');
const {
  TREATMENT_SUCCESS_MIN_PCT,
  computeIndicators,
} = require('../src/utils/calculations');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  console.log('Threshold:', TREATMENT_SUCCESS_MIN_PCT, dryRun ? '(dry-run)' : '(apply)');

  if (!dryRun) {
    await query(
      `UPDATE dbo.tbmukt_business_config SET config_value = @v, updated_at = SYSUTCDATETIME() WHERE config_key = 'TREATMENT_SUCCESS_MIN'`,
      { v: String(TREATMENT_SUCCESS_MIN_PCT) }
    );
    await query(
      `UPDATE dbo.tbmukt_business_config SET config_value = @v, updated_at = SYSUTCDATETIME() WHERE config_key = 'TREATMENT_SUCCESS_OPERATOR'`,
      { v: '>=' }
    );
  }

  const rows = await query(`
    SELECT id, gp_id, gp_name, district_id, block_id, reporting_year, reporting_month, status,
           gp_population, tested_naat, tb_diagnosed, treatment_success_pct,
           poshan_eligible, poshan_consented, poshan_received,
           indicator1, indicator2, indicator3, indicator4, is_qualified
    FROM dbo.tb_mukt_entries
  `);

  let changed = 0;
  let scanned = 0;

  for (const row of rows.recordset) {
    scanned += 1;
    const calcs = computeIndicators({
      gpPopulation: row.gp_population,
      testedNaat: row.tested_naat,
      tbDiagnosed: row.tb_diagnosed,
      treatmentSuccessPct: row.treatment_success_pct,
      poshanEligible: row.poshan_eligible,
      poshanConsented: row.poshan_consented ?? row.poshan_eligible,
      poshanReceived: row.poshan_received,
    });

    const i3 = calcs.indicator3 ? 1 : 0;
    const iq = calcs.qualified ? 1 : 0;
    const oldI3 = row.indicator3 ? 1 : 0;
    const oldIq = row.is_qualified ? 1 : 0;

    if (i3 !== oldI3 || iq !== oldIq) {
      changed += 1;
      if (!dryRun) {
        await query(
          `
          UPDATE dbo.tb_mukt_entries
          SET indicator3 = @i3,
              is_qualified = @iq,
              treatment_success_pct = @txPct,
              testing_rate = @testingRate,
              detection_rate = @detectionRate,
              poshan_pct = @poshanPct,
              updated_at = SYSUTCDATETIME()
          WHERE id = @id
          `,
          {
            id: row.id,
            i3,
            iq,
            txPct: calcs.treatmentSuccessPct,
            testingRate: calcs.testingRate,
            detectionRate: calcs.detectionRate,
            poshanPct: calcs.poshanPct,
          }
        );
      }
    }
  }

  console.log({ scanned, entriesChanged: changed, dryRun });
  console.log('Next: run node scripts/repair-qualification-medals.js to refresh medals in year order.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
