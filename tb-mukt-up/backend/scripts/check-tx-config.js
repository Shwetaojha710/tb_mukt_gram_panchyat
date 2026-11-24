require('dotenv').config();
const { query } = require('../src/config/db');

(async () => {
  const c = await query(`
    SELECT config_key, config_value
    FROM dbo.tbmukt_business_config
    WHERE config_key LIKE 'TREATMENT%'
  `);
  console.log('config', c.recordset);

  const ch = await query(`
    SELECT id, gp_name, treatment_success_pct, indicator3, is_qualified
    FROM dbo.tb_mukt_entries
    WHERE treatment_success_pct IS NOT NULL
      AND treatment_success_pct > 90
      AND treatment_success_pct < 92
  `);
  console.log('between 90 and 92:', ch.recordset);

  const medals = await query(`
    SELECT medal, COUNT(*) AS n
    FROM dbo.tb_mukt_qualification_history
    GROUP BY medal
    ORDER BY medal
  `);
  console.log('medal counts', medals.recordset);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
