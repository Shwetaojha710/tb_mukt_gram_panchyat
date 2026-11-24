/**
 * Hit local API :5055 for STATE KPI cards + Hardoi if available.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const API = process.env.AUDIT_API || 'http://127.0.0.1:5055/api';

async function post(url, body, token) {
  const res = await fetch(`${API}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(url, token) {
  const res = await fetch(`${API}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(username, password) {
  const { status, json } = await post('/auth/login', { username, password });
  if (status !== 200 || !json?.data?.token) {
    throw new Error(`Login failed ${username}: ${status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.data;
}

(async () => {
  console.log('API', API);

  // STATE programme login (from exports file — may have been changed)
  let state;
  const stateCreds = [
    ['GMNHM001', 'GQLCXY3EKA'],
    ['STCUP001', 'NUEF9ZMHAU'],
    ['UPTSU001', 'WTKD8BD98D'],
    ['DGMNHM001', 'VZ7W6PSTSX'],
  ];
  for (const [u, p] of stateCreds) {
    try {
      state = await login(u, p);
      console.log('STATE login OK', u, state.user?.role, state.user?.fullName);
      break;
    } catch (e) {
      console.log(e.message);
    }
  }
  if (!state) throw new Error('No STATE login worked');

  // Kakori already known via DB password — use DB login path for block
  const { query } = require('../src/config/db');
  const kakori = await query(
    `SELECT TOP 1 LoginId, LogPassword FROM dbo.AdminLogin WHERE LoginId='BLU133251'`
  );
  const kRow = kakori.recordset[0];
  const block = await login(kRow.LoginId, String(kRow.LogPassword));
  console.log('BLOCK login OK', block.user?.role, block.user?.fullName);

  // Hardoi: search by FacilityDistrictId join District
  const hardoi = await query(`
    SELECT TOP 1 a.LoginId, a.LogPassword, a.FirstName, a.LastName, d.DistrictName
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.District d ON d.PK_UniqueID = a.FacilityDistrictId
    WHERE ISNULL(a.isDeleted,0)=0
      AND (d.DistrictName LIKE '%Hardoi%' OR a.FirstName LIKE '%Hardoi%' OR a.LastName LIKE '%Hardoi%')
  `);
  let districtUser = null;
  if (hardoi.recordset[0]) {
    districtUser = await login(hardoi.recordset[0].LoginId, String(hardoi.recordset[0].LogPassword));
    console.log('HARDOI login OK', districtUser.user?.role, districtUser.user?.fullName, hardoi.recordset[0].DistrictName);
  } else {
    console.log('HARDOI login BLOCKED — no matching AdminLogin');
  }

  const q = 'fromYear=2026&fromMonth=1&toYear=2026&toMonth=11&dateFrom=2026-01&dateTo=2026-11';
  const sum = await get(`/new-dashboard/summary?${q}`, state.token);
  console.log('summary status', sum.status);
  const k = sum.json?.data?.kpis || sum.json?.kpis || {};
  const required = [
    'totalDistricts', 'totalBlocks', 'totalGps', 'eligibleGps', 'qualifiedGps',
    'bronzeGps', 'silverGps', 'goldGps', 'pendingBelow50', 'pendingAbove50',
    'zeroCaseGps', 'zeroCasePendingGps', 'poshanPendingGps',
  ];
  const missing = required.filter((key) => k[key] === undefined || k[key] === null);
  console.log(missing.length ? 'KPI_FAIL ' + missing.join(',') : 'KPI_PASS');
  console.log(JSON.stringify({
    totalDistricts: k.totalDistricts,
    totalBlocks: k.totalBlocks,
    totalGps: k.totalGps,
    eligibleGps: k.eligibleGps,
    qualifiedGps: k.qualifiedGps,
    bronze: k.bronzeGps,
    silver: k.silverGps,
    gold: k.goldGps,
    below50: k.pendingBelow50,
    above50: k.pendingAbove50,
    zeroCase: k.zeroCaseGps,
    zeroPending: k.zeroCasePendingGps,
    poshan: k.poshanPendingGps,
  }));

  // Change-password endpoint exists (expect 400 without body, not 404)
  const cp = await post('/auth/change-password', {}, state.token);
  console.log('change-password status (expect 400/422 not 404):', cp.status);

  // 401 logout path: bad token
  const bad = await get(`/new-dashboard/summary?${q}`, 'invalid.token.here');
  console.log('bad token status (expect 401):', bad.status);

  if (districtUser) {
    const dsum = await get(
      `/new-dashboard/summary?${q}&districtId=${districtUser.user.districtId || ''}`,
      districtUser.token
    );
    const dk = dsum.json?.data?.kpis || dsum.json?.kpis || {};
    console.log('HARDOI_SUMMARY', dsum.status, {
      role: districtUser.user.role,
      reportingGps: dk.reportingGps,
      totalGps: dk.totalGps,
      eligibleGps: dk.eligibleGps,
    });
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
