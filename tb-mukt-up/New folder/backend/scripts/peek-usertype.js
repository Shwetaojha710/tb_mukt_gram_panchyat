const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();
  const cols = await p.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'UserTypeMaster'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('COLUMNS', cols.recordset);
  const rows = await p.request().query(`
    SELECT Pk_UsertypeId, UserType, Isdeleted
    FROM dbo.UserTypeMaster
    ORDER BY Pk_UsertypeId
  `);
  console.log(JSON.stringify(rows.recordset, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
