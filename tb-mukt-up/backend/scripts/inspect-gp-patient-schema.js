require('dotenv').config();
const { query } = require('../src/config/db');

(async () => {
  const cols = await query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'GramPanchayat'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('GramPanchayat columns:');
  cols.recordset.forEach((r) => console.log(' -', r.COLUMN_NAME, r.DATA_TYPE));

  const tables = await query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND (
        TABLE_NAME LIKE '%patient%'
        OR TABLE_NAME LIKE '%Patient%'
        OR TABLE_NAME LIKE '%nikshay%'
        OR TABLE_NAME LIKE '%Nikshay%'
        OR TABLE_NAME LIKE '%tb_mukt%'
        OR TABLE_NAME LIKE '%TB%'
      )
    ORDER BY TABLE_NAME
  `);
  console.log('\nCandidate tables:');
  tables.recordset.forEach((r) => console.log(' -', r.TABLE_SCHEMA + '.' + r.TABLE_NAME));

  const sample = await query(`SELECT TOP 3 * FROM dbo.GramPanchayat WHERE ISNULL(IsDeleted,0)=0`);
  console.log('\nSample GP keys:', sample.recordset[0] ? Object.keys(sample.recordset[0]) : []);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
