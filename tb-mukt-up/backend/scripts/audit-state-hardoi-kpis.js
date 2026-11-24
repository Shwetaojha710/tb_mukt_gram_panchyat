const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');
const authService = require('../src/services/auth.service');
const newDashboardService = require('../src/services/newDashboard.service');

function jwtFrom(user) {
  return {
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
}

(async () => {
  const cols = await query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='AdminLogin' ORDER BY ORDINAL_POSITION
  `);
  console.log('AdminLogin cols:', cols.recordset.map((r) => r.COLUMN_NAME).join(', '));

  const types = await query(`
    SELECT TOP 30 Pk_UsertypeId, UsertypeName FROM dbo.UserTypeMaster ORDER BY Pk_UsertypeId
  `);
  console.log('UserTypes:', types.recordset);

  // Find STATE-like and Hardoi candidates
  const candidates = await query(`
    SELECT TOP 40 a.Pk_AdminId, a.LoginId, a.FirstName, a.LastName, a.Fk_Usertype, ut.UsertypeName,
           a.DistrictCode, a.BlockCode, a.FacilityDistrictId, a.FacilityBlockId
    FROM dbo.AdminLogin a
    LEFT JOIN dbo.UserTypeMaster ut ON ut.Pk_UsertypeId = a.Fk_Usertype
    WHERE ISNULL(a.isDeleted,0)=0 AND ISNULL(a.IsActive,1)=1
      AND (
        ut.UsertypeName LIKE '%State%'
        OR ut.UsertypeName LIKE '%STATE%'
        OR ut.UsertypeName LIKE '%District%'
        OR a.FirstName LIKE '%Hardoi%'
        OR a.LastName LIKE '%Hardoi%'
        OR a.FirstName LIKE '%State%'
        OR a.LoginId LIKE 'ST%'
        OR a.LoginId LIKE 'DL%'
        OR a.LoginId LIKE 'GM%'
        OR a.LoginId LIKE 'DGM%'
      )
    ORDER BY ut.UsertypeName, a.Pk_AdminId
  `);
  console.log('Candidates:', candidates.recordset);

  async function tryLogin(loginId) {
    const cred = await query(
      `SELECT TOP 1 LoginId, LogPassword FROM dbo.AdminLogin WHERE LoginId=@loginId AND ISNULL(isDeleted,0)=0`,
      { loginId }
    );
    const row = cred.recordset[0];
    const { user } = await authService.login({
      username: row.LoginId,
      password: String(row.LogPassword),
    });
    return user;
  }

  const stateCand = candidates.recordset.find((r) =>
    String(r.UsertypeName || '').toUpperCase().includes('STATE')
  );
  const hardoiCand = candidates.recordset.find((r) =>
    `${r.FirstName || ''} ${r.LastName || ''} ${r.LoginId || ''}`.toUpperCase().includes('HARDOI')
  ) || candidates.recordset.find((r) =>
    String(r.UsertypeName || '').toUpperCase().includes('DISTRICT')
  );

  if (stateCand) {
    const user = await tryLogin(stateCand.LoginId);
    console.log('STATE user', { login: user.username, role: user.role, name: user.fullName });
    const sum = await newDashboardService.getSummary(jwtFrom(user), {
      dateFrom: '2026-01',
      dateTo: '2026-11',
      fromYear: 2026,
      fromMonth: 1,
      toYear: 2026,
      toMonth: 11,
    });
    const k = sum.kpis || {};
    const required = [
      'totalDistricts', 'totalBlocks', 'totalGps', 'eligibleGps', 'qualifiedGps',
      'bronzeGps', 'silverGps', 'goldGps', 'pendingBelow50', 'pendingAbove50',
      'zeroCaseGps', 'zeroCasePendingGps', 'poshanPendingGps',
    ];
    const missing = required.filter((key) => k[key] === undefined || k[key] === null);
    console.log(missing.length ? 'KPI FAIL missing ' + missing.join(',') : 'KPI PASS');
    console.log({
      totalDistricts: k.totalDistricts,
      totalBlocks: k.totalBlocks,
      totalGps: k.totalGps,
      eligibleGps: k.eligibleGps,
      qualifiedGps: k.qualifiedGps,
      bronzeGps: k.bronzeGps,
      silverGps: k.silverGps,
      goldGps: k.goldGps,
      pendingBelow50: k.pendingBelow50,
      pendingAbove50: k.pendingAbove50,
      zeroCaseGps: k.zeroCaseGps,
      zeroCasePendingGps: k.zeroCasePendingGps,
      poshanPendingGps: k.poshanPendingGps,
      districtsWithBronze: k.districtsWithBronze,
    });
  } else {
    console.log('No STATE candidate');
  }

  if (hardoiCand) {
    const user = await tryLogin(hardoiCand.LoginId);
    console.log('District/Hardoi user', {
      login: user.username,
      role: user.role,
      name: user.fullName,
      districtId: user.districtId,
    });
    const sum = await newDashboardService.getSummary(jwtFrom(user), {
      dateFrom: '2026-01',
      dateTo: '2026-11',
      districtId: user.districtId,
    });
    console.log('District summary reportingGps=', sum.kpis?.reportingGps, 'totalGps=', sum.kpis?.totalGps);
  } else {
    console.log('No Hardoi/District candidate');
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
