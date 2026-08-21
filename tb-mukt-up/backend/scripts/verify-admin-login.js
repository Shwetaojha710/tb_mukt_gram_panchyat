const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');
const { login } = require('../src/services/auth.service');

(async () => {
  const r = await query(`
    SELECT TOP 1 LoginId, LogPassword
    FROM dbo.AdminLogin
    WHERE ISNULL(isDeleted, 0) = 0 AND ISNULL(IsActive, 1) = 1 AND ISNULL(IsBlock, 0) = 0
      AND LoginId IS NOT NULL AND LogPassword IS NOT NULL
    ORDER BY Pk_AdminId
  `);
  const row = r.recordset[0];
  const data = await login({ username: row.LoginId, password: row.LogPassword });
  console.log('LOGIN_OK', data.user.username, data.user.role, data.user.userTypeName);
  process.exit(0);
})().catch((e) => {
  console.error('LOGIN_FAIL', e.message);
  process.exit(1);
});
