const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();
  const r = await p.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN ('Village', 'Villiage', 'district', 'District', 'Block', 'GramPanchayat')
  `);
  console.log(r.recordset);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
