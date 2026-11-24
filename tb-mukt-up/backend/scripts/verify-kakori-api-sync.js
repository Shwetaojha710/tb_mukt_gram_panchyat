/**
 * READ-ONLY smoke: login Kakori block user and compare Overview vs Block rankings vs TB list counts.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');
const authService = require('../src/services/auth.service');
const dashboardService = require('../src/services/dashboard.service');
const newDashboardService = require('../src/services/newDashboard.service');
const tbService = require('../src/services/tb.service');

(async () => {
  const cred = await query(`
    SELECT TOP 1 LoginId, LogPassword, Fk_Usertype
    FROM dbo.AdminLogin
    WHERE LoginId = 'BLU133251' AND ISNULL(isDeleted,0)=0
  `);
  const row = cred.recordset[0];
  if (!row) throw new Error('Kakori login BLU133251 not found');

  const { user, token } = await authService.login({
    username: row.LoginId,
    password: String(row.LogPassword),
  });
  console.log('Login OK', {
    loginId: user.username,
    role: user.role,
    blockId: user.blockId,
    tehsilId: user.tehsilId,
    districtId: user.districtId,
    fullName: user.fullName,
  });

  // JWT-shaped user for services
  const jwtUser = {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    stateId: user.stateId,
    divisionId: user.divisionId,
    districtId: user.districtId,
    tehsilId: user.tehsilId,
    blockId: user.blockId,
    gpId: user.gpId,
  };

  const filters = {
    year: 2026,
    reportingMonth: 11,
    dateFrom: '2026-01',
    dateTo: '2026-11',
    blockId: user.blockId || user.tehsilId,
    districtId: user.districtId || undefined,
  };

  const overview = await newDashboardService.getDrilldown(jwtUser, {
    ...filters,
    level: 'block',
    blockId: filters.blockId,
  });
  const overviewRows = overview?.rows || overview?.data?.rows || overview?.gps || [];
  // shape may vary — log keys
  console.log('Overview drilldown keys:', Object.keys(overview || {}));
  const oRows = overview.rows || overview.items || overview.gps || overview.table || [];
  console.log('Overview row count:', Array.isArray(oRows) ? oRows.length : typeof oRows);

  const rankings = await dashboardService.getRankings(jwtUser, filters);
  const line = rankings.tbUnitGpLineList || [];
  console.log('Block dashboard line list count:', line.length);

  const list = await tbService.listEntries(jwtUser, {
    year: 2026,
    month: undefined,
    blockId: filters.blockId,
    districtId: user.districtId || 49, // simulate resolved district from cascade
    page: 1,
    pageSize: 100,
  });
  console.log('TB Entry List total:', list.total, 'page items:', (list.items || []).length);

  const listNoDistrict = await tbService.listEntries(jwtUser, {
    year: 2026,
    blockId: filters.blockId,
    page: 1,
    pageSize: 100,
  });
  console.log('TB Entry List without districtId total:', listNoDistrict.total);

  // Wrong district simulation (pre-fix failure mode)
  const listWrongDistrict = await tbService.listEntries(jwtUser, {
    year: 2026,
    blockId: filters.blockId,
    districtId: 999999,
    page: 1,
    pageSize: 100,
  });
  console.log('TB Entry List with WRONG districtId (should still show after fix):', listWrongDistrict.total);

  console.log('tokenLen', token.length);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
