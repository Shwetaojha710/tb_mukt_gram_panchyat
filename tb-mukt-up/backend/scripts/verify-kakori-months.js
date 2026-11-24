require('dotenv').config();
const { query } = require('../src/config/db');

(async () => {
  const r = await query(`
    SELECT reporting_month, COUNT(*) AS cnt, COUNT(DISTINCT gp_id) AS gps
    FROM dbo.tb_mukt_entries
    WHERE block_id = 575 AND reporting_year = 2026 AND status = 'SUBMITTED'
    GROUP BY reporting_month
    ORDER BY reporting_month
  `);
  console.log(r.recordset);

  const nov = await query(`
    SELECT COUNT(*) AS novRows
    FROM dbo.tb_mukt_entries
    WHERE block_id = 575 AND reporting_year = 2026 AND reporting_month = 11 AND status = 'SUBMITTED'
  `);
  console.log(nov.recordset[0]);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
