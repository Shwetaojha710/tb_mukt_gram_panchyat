const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const authService = require('../src/services/auth.service');

(async () => {
  const r = await authService.login({ username: 'TBU24350', password: '2QS2GV5K' });
  console.log(JSON.stringify({
    username: r.user.username,
    role: r.user.role,
    userTypeId: r.user.userTypeId,
    userTypeName: r.user.userTypeName,
    districtId: r.user.districtId,
    districtName: r.user.districtName,
    blockId: r.user.blockId,
    blockName: r.user.blockName,
    hasToken: !!r.token,
  }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('LOGIN FAIL', e.message || e);
  process.exit(1);
});
