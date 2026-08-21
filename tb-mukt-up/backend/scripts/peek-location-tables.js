const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();
  const tables = ['district', 'District', 'Block', 'GramPanchayat', 'Villiage', 'Village'];
  for (const name of tables) {
    const cols = await p.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${name}'
      ORDER BY ORDINAL_POSITION
    `);
    if (cols.recordset.length) {
      console.log('\n===', cols.recordset[0].TABLE_NAME, '===');
      cols.recordset.forEach((c) => console.log(' ', c.COLUMN_NAME, c.DATA_TYPE));
      const sample = await p.request().query(`SELECT TOP 2 * FROM dbo.[${cols.recordset[0].TABLE_NAME}]`);
      console.log('SAMPLE keys', Object.keys(sample.recordset[0] || {}));
      console.log(JSON.stringify(sample.recordset.slice(0, 1), null, 2).slice(0, 800));
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
