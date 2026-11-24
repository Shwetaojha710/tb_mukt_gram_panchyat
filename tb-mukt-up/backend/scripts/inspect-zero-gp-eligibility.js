require('dotenv').config();
const { query } = require('../src/config/db');
const { computeIndicators } = require('../src/utils/calculations');

(async () => {
  // Sample SUBMITTED rows where testing > 0 but not qualified
  const rows = await query(`
    SELECT TOP 25
      e.id, e.gp_id, e.gp_name, e.block_name, e.reporting_year, e.reporting_month,
      e.gp_population, e.tested_naat, e.tb_diagnosed, e.treatment_success_pct,
      e.poshan_eligible, e.poshan_consented, e.poshan_received,
      e.testing_rate, e.detection_rate, e.poshan_pct,
      e.indicator1, e.indicator2, e.indicator3, e.indicator4, e.is_qualified
    FROM dbo.tb_mukt_entries e
    WHERE e.status = 'SUBMITTED'
      AND ISNULL(e.tested_naat, 0) > 0
      AND ISNULL(e.is_qualified, 0) = 0
    ORDER BY e.reporting_year DESC, e.reporting_month DESC
  `);

  console.log('tested>0 but not qualified sample:', rows.recordset.length);
  for (const r of rows.recordset) {
    const c = computeIndicators({
      gpPopulation: r.gp_population,
      testedNaat: r.tested_naat,
      tbDiagnosed: r.tb_diagnosed,
      treatmentSuccessPct: r.treatment_success_pct,
      poshanEligible: r.poshan_eligible,
      poshanConsented: r.poshan_consented,
      poshanReceived: r.poshan_received,
    });
    const fail = [];
    if (!c.indicator1) fail.push('testing<30/1000');
    if (!c.indicator2) fail.push('detection>1/1000');
    if (!c.indicator3) fail.push('tx<' + require('../src/utils/calculations').TREATMENT_SUCCESS_MIN_PCT + '%');
    if (!c.indicator4) fail.push('poshan!=100%');
    console.log(
      `${r.gp_name} ${r.reporting_year}-${r.reporting_month} tested=${r.tested_naat} dx=${r.tb_diagnosed} tx%=${r.treatment_success_pct} fail=[${fail.join(', ')}]`
    );
  }

  // Testing performed, zero TB cases
  const zeroDx = await query(`
    SELECT
      COUNT(*) AS n,
      SUM(CASE WHEN is_qualified = 1 THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN is_qualified = 0 THEN 1 ELSE 0 END) AS not_qualified
    FROM dbo.tb_mukt_entries
    WHERE status = 'SUBMITTED'
      AND ISNULL(tested_naat, 0) > 0
      AND ISNULL(tb_diagnosed, 0) = 0
  `);
  console.log('\nTesting>0 and diagnosed=0:', zeroDx.recordset[0]);

  // No testing
  const noTest = await query(`
    SELECT COUNT(*) AS n
    FROM dbo.tb_mukt_entries
    WHERE status = 'SUBMITTED' AND ISNULL(tested_naat, 0) = 0
  `);
  console.log('SUBMITTED with tested=0:', noTest.recordset[0]);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
