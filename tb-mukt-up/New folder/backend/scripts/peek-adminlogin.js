const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../src/config/db');

(async () => {
  const p = await getPool();
  const cols = await p.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'AdminLogin'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('COLUMNS');
  cols.recordset.forEach((c) => console.log(`  ${c.COLUMN_NAME} ${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH})`));

  const sample = await p.request().query(`
    SELECT TOP 3 *
    FROM dbo.AdminLogin
  `);
  const rows = sample.recordset.map((r) => {
    const copy = { ...r };
    Object.keys(copy).forEach((k) => {
      const kl = k.toLowerCase();
      if (kl.includes('pass') || kl.includes('pwd')) {
        const v = copy[k] == null ? null : String(copy[k]);
        copy[k] = v ? `len=${v.length} starts=${v.slice(0, 8)} bcrypt=${v.startsWith('$2')}` : null;
      }
    });
    return copy;
  });
  console.log('SAMPLE', JSON.stringify(rows, null, 2));

  const count = await p.request().query('SELECT COUNT(*) AS c FROM dbo.AdminLogin');
  console.log('COUNT', count.recordset[0].c);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
