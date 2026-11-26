require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  const rows = await query(`
    SELECT gp_name, reporting_month, tested_naat, is_qualified, gp_population, testing_rate, overall_target
    FROM dbo.tb_mukt_entries
    WHERE status='SUBMITTED' AND reporting_year=2026 AND block_id=575
      AND gp_name IN ('GOHRA MAU','KARIMABAD','KATHINGARA','SAIDPUR MAHERI','Tendava')
    ORDER BY gp_name, reporting_month
  `);
  console.log(rows.recordset);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
