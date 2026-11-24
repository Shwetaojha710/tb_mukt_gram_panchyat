require('dotenv').config();
const { query } = require('../src/config/db');

(async () => {
  for (const table of [
    'tb_mukt_gp',
    'tbmukt_treatment_success_history',
    'tbmukt_business_config',
    'tbmukt_gp_indicator_results',
    'tbmukt_gp_monthly_reports',
    'tb_mukt_location_map',
  ]) {
    const cols = await query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `, { table });
    console.log('\n==', table, '==');
    cols.recordset.forEach((r) => console.log(' -', r.COLUMN_NAME, r.DATA_TYPE));
    const sample = await query(`SELECT TOP 2 * FROM dbo.[${table}]`);
    if (sample.recordset[0]) {
      console.log(' sample keys:', Object.keys(sample.recordset[0]).join(', '));
      console.log(' sample0:', JSON.stringify(sample.recordset[0]).slice(0, 500));
    } else {
      console.log(' (empty)');
    }
  }

  const cfg = await query(`SELECT TOP 20 * FROM dbo.tbmukt_business_config`);
  console.log('\nbusiness_config rows:', cfg.recordset.length);
  cfg.recordset.forEach((r) => console.log(JSON.stringify(r)));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
