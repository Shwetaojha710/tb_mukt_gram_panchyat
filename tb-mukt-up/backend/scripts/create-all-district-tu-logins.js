/**
 * Export District User credentials (1 per district) and
 * create missing TB Unit (TU) logins for all subtype-34 facilities.
 *
 * Usage:
 *   node scripts/create-all-district-tu-logins.js
 *   node scripts/create-all-district-tu-logins.js --dry
 *   node scripts/create-all-district-tu-logins.js --districts-only
 *   node scripts/create-all-district-tu-logins.js --tus-only
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const ExcelJS = require('exceljs');
const { query } = require('../src/config/db');

const USER_TYPE_DISTRICT = 5; // District User
const USER_TYPE_TB_UNIT = 15; // TBUnitfacilityType
const SUBTYPE_TB = 34;

const dryRun = process.argv.includes('--dry');
const districtsOnly = process.argv.includes('--districts-only');
const tusOnly = process.argv.includes('--tus-only');

function genPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function genDistrictLoginId(districtId) {
  return `DLU${districtId}`;
}

function genTuLoginId(facilityCode) {
  return `TBU${facilityCode}`;
}

async function loadDistrictCredentials() {
  // One preferred District User per district
  const r = await query(`
    WITH ranked AS (
      SELECT
        d.PK_UniqueID AS districtId,
        d.DistrictName AS districtName,
        CAST(d.D_LGD AS NVARCHAR(50)) AS districtLgd,
        a.Pk_AdminId AS adminId,
        a.LoginId AS loginId,
        a.LogPassword AS password,
        a.FirstName AS firstName,
        a.Fk_Usertype AS userType,
        ROW_NUMBER() OVER (
          PARTITION BY d.PK_UniqueID
          ORDER BY
            CASE WHEN a.LoginId LIKE 'MA%' THEN 0
                 WHEN a.LoginId LIKE 'DLU%' THEN 1
                 ELSE 2 END,
            CASE WHEN a.FirstName LIKE 'MA[_]%' THEN 0 ELSE 1 END,
            a.Pk_AdminId ASC
        ) AS rn
      FROM dbo.District d
      INNER JOIN dbo.AdminLogin a
        ON ISNULL(a.isDeleted,0)=0
       AND ISNULL(a.IsActive,1)=1
       AND ISNULL(a.IsBlock,0)=0
       AND a.Fk_Usertype = @ut
       AND (a.FacilityDistrictId = d.PK_UniqueID OR a.DistrictCode = d.PK_UniqueID)
      WHERE ISNULL(d.IsDeleted,0)=0
    )
    SELECT districtId, districtName, districtLgd, adminId, loginId, password, firstName, userType
    FROM ranked
    WHERE rn = 1
    ORDER BY districtName
  `, { ut: USER_TYPE_DISTRICT });

  const have = new Map(r.recordset.map((x) => [Number(x.districtId), x]));

  const allDist = await query(`
    SELECT PK_UniqueID AS districtId, DistrictName AS districtName,
           CAST(D_LGD AS NVARCHAR(50)) AS districtLgd
    FROM dbo.District
    WHERE ISNULL(IsDeleted,0)=0
    ORDER BY DistrictName
  `);

  const rows = [];
  for (const d of allDist.recordset) {
    const existing = have.get(Number(d.districtId));
    if (existing) {
      rows.push({
        status: 'exists',
        districtId: d.districtId,
        districtName: d.districtName,
        districtLgd: d.districtLgd,
        loginId: existing.loginId,
        password: String(existing.password || ''),
        adminId: existing.adminId,
        userType: USER_TYPE_DISTRICT,
        userTypeName: 'District User',
      });
      continue;
    }

    const loginId = genDistrictLoginId(d.districtId);
    const password = genPassword(8);
    const firstName = `District ${d.districtName}`.slice(0, 80);
    const mobile = String(9200000000 + (Number(d.districtId) % 100000000)).slice(0, 10);

    if (dryRun) {
      rows.push({
        status: 'dry',
        districtId: d.districtId,
        districtName: d.districtName,
        districtLgd: d.districtLgd,
        loginId,
        password,
        userType: USER_TYPE_DISTRICT,
        userTypeName: 'District User',
      });
      continue;
    }

    const dup = await query(
      `SELECT TOP 1 Pk_AdminId, LoginId, LogPassword FROM dbo.AdminLogin WHERE LoginId = @loginId AND ISNULL(isDeleted,0)=0`,
      { loginId }
    );
    if (dup.recordset[0]) {
      const e = dup.recordset[0];
      rows.push({
        status: 'exists',
        districtId: d.districtId,
        districtName: d.districtName,
        districtLgd: d.districtLgd,
        loginId: e.LoginId,
        password: String(e.LogPassword || ''),
        adminId: e.Pk_AdminId,
        userType: USER_TYPE_DISTRICT,
        userTypeName: 'District User',
      });
      continue;
    }

    const ins = await query(
      `
      INSERT INTO dbo.AdminLogin (
        LoginId, LogPassword, FirstName, LastName, Fk_Usertype,
        StateCode, DivisionCode, DistrictCode, TehsilCode, BlockCode,
        Mobile, Email, Address, City, State, PinCode,
        CreatedBy, isDeleted, IsActive, OfflineData,
        Fk_FacilityTypeId, FacilityId,
        FacilityDivisionId, FacilityDistrictId, FacilityTehsilId,
        FacilityBlockId, FacilityGrampanchayatId, FacilityVillageId,
        SubtypeId, IsInterNational, IsBlock, IsChangePassword
      )
      OUTPUT INSERTED.Pk_AdminId, INSERTED.LoginId, INSERTED.LogPassword
      VALUES (
        @loginId, @password, @firstName, @lastName, @userType,
        1, 0, @districtCode, 0, 0,
        @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
        1, 0, 1, 0,
        0, 0,
        0, @facilityDistrictId, 0,
        0, 0, 0,
        0, 0, 0, 0
      )
      `,
      {
        loginId,
        password,
        firstName,
        lastName: d.districtName,
        userType: USER_TYPE_DISTRICT,
        districtCode: d.districtId,
        facilityDistrictId: d.districtId,
        mobile,
      }
    );
    const out = ins.recordset[0];
    rows.push({
      status: 'created',
      districtId: d.districtId,
      districtName: d.districtName,
      districtLgd: d.districtLgd,
      loginId: out.LoginId,
      password: String(out.LogPassword || ''),
      adminId: out.Pk_AdminId,
      userType: USER_TYPE_DISTRICT,
      userTypeName: 'District User',
    });
  }
  return rows;
}

async function loadTbFacilities() {
  const r = await query(`
    SELECT
      f.PK_UniqueID AS facilityPk,
      f.FK_FacilityCode AS facilityCode,
      f.FacilityName AS facilityName,
      ISNULL(f.FK_Facilitytype, 0) AS facilityTypeId,
      ft.FacilityType AS facilityType,
      ISNULL(f.FK_StateID, 1) AS stateId,
      ISNULL(f.FK_DivisionID, 0) AS divisionId,
      ISNULL(f.FK_DistrictID, 0) AS districtId,
      ISNULL(f.FK_TehsilID, 0) AS tehsilId,
      ISNULL(f.FK_BlockID, 0) AS blockId,
      ISNULL(f.FK_GrampanchayatID, 0) AS gpId,
      ISNULL(f.FK_VillageID, 0) AS villageId,
      d.DistrictName AS districtName,
      b.BlockName AS blockName
    FROM dbo.Facility f
    INNER JOIN (
      SELECT DISTINCT Fk_FacilityId
      FROM dbo.FacililtySubtype
      WHERE Fk_SubtypeId = @subtype AND ISNULL(IsDeleted,0)=0
    ) fs ON fs.Fk_FacilityId = f.FK_FacilityCode
    LEFT JOIN dbo.FacilityType ft ON ft.PK_UniqueID = f.FK_Facilitytype
    LEFT JOIN dbo.District d ON d.PK_UniqueID = f.FK_DistrictID
    LEFT JOIN dbo.Block b ON b.PK_UniqueID = f.FK_BlockID
    WHERE ISNULL(f.IsDeleted,0)=0
    ORDER BY d.DistrictName, f.FacilityName
  `, { subtype: SUBTYPE_TB });
  return r.recordset;
}

async function ensureTuLogins(facilities) {
  const existing = await query(`
    SELECT
      Pk_AdminId AS adminId,
      LoginId AS loginId,
      LogPassword AS password,
      FacilityId AS facilityId,
      FirstName AS firstName
    FROM dbo.AdminLogin
    WHERE ISNULL(isDeleted,0)=0
      AND ISNULL(IsActive,1)=1
      AND ISNULL(IsBlock,0)=0
      AND (Fk_Usertype = @ut OR LoginId LIKE 'TBU%')
  `, { ut: USER_TYPE_TB_UNIT });

  const byLogin = new Map();
  const byFacility = new Map();
  for (const e of existing.recordset) {
    byLogin.set(String(e.loginId).toUpperCase(), e);
    if (e.facilityId) byFacility.set(Number(e.facilityId), e);
  }

  const rows = [];
  let created = 0;
  let existed = 0;
  let i = 0;

  for (const f of facilities) {
    i += 1;
    const loginId = genTuLoginId(f.facilityCode);
    const found =
      byLogin.get(loginId.toUpperCase()) ||
      byFacility.get(Number(f.facilityPk)) ||
      byFacility.get(Number(f.facilityCode));

    if (found) {
      existed += 1;
      rows.push({
        status: 'exists',
        districtName: f.districtName,
        blockName: f.blockName,
        facilityName: f.facilityName,
        facilityCode: f.facilityCode,
        facilityPk: f.facilityPk,
        facilityType: f.facilityType,
        loginId: found.loginId,
        password: String(found.password || ''),
        adminId: found.adminId,
        userType: USER_TYPE_TB_UNIT,
        userTypeName: 'TBUnitfacilityType',
      });
      continue;
    }

    const password = genPassword(8);
    const firstName = `TB Unit ${f.facilityName}`.slice(0, 80);
    const mobile = String(9300000000 + (Number(f.facilityCode) % 100000000)).slice(0, 10);

    if (dryRun) {
      created += 1;
      rows.push({
        status: 'dry',
        districtName: f.districtName,
        blockName: f.blockName,
        facilityName: f.facilityName,
        facilityCode: f.facilityCode,
        facilityPk: f.facilityPk,
        facilityType: f.facilityType,
        loginId,
        password,
        userType: USER_TYPE_TB_UNIT,
        userTypeName: 'TBUnitfacilityType',
      });
      continue;
    }

    try {
      const ins = await query(
        `
        INSERT INTO dbo.AdminLogin (
          LoginId, LogPassword, FirstName, LastName, Fk_Usertype,
          StateCode, DivisionCode, DistrictCode, TehsilCode, BlockCode,
          Mobile, Email, Address, City, State, PinCode,
          CreatedBy, isDeleted, IsActive, OfflineData,
          Fk_FacilityTypeId, FacilityId,
          FacilityDivisionId, FacilityDistrictId, FacilityTehsilId,
          FacilityBlockId, FacilityGrampanchayatId, FacilityVillageId,
          SubtypeId, IsInterNational, IsBlock, IsChangePassword
        )
        OUTPUT INSERTED.Pk_AdminId, INSERTED.LoginId, INSERTED.LogPassword
        VALUES (
          @loginId, @password, @firstName, @lastName, @userType,
          @stateCode, 0, 0, 0, @blockCode,
          @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
          1, 0, 1, 0,
          @facilityTypeId, @facilityId,
          @facilityDivisionId, @facilityDistrictId, @facilityTehsilId,
          @facilityBlockId, @facilityGpId, @facilityVillageId,
          @subtypeId, 0, 0, 0
        )
        `,
        {
          loginId,
          password,
          firstName,
          lastName: f.districtName || '',
          userType: USER_TYPE_TB_UNIT,
          stateCode: f.stateId || 1,
          blockCode: f.blockId || 0,
          mobile,
          facilityTypeId: f.facilityTypeId || 0,
          facilityId: f.facilityPk,
          facilityDivisionId: f.divisionId || 0,
          facilityDistrictId: f.districtId || 0,
          facilityTehsilId: f.tehsilId || 0,
          facilityBlockId: f.blockId || 0,
          facilityGpId: f.gpId || 0,
          facilityVillageId: f.villageId || 0,
          subtypeId: SUBTYPE_TB,
        }
      );
      const out = ins.recordset[0];
      created += 1;
      const row = {
        status: 'created',
        districtName: f.districtName,
        blockName: f.blockName,
        facilityName: f.facilityName,
        facilityCode: f.facilityCode,
        facilityPk: f.facilityPk,
        facilityType: f.facilityType,
        loginId: out.LoginId,
        password: String(out.LogPassword || ''),
        adminId: out.Pk_AdminId,
        userType: USER_TYPE_TB_UNIT,
        userTypeName: 'TBUnitfacilityType',
      };
      rows.push(row);
      byLogin.set(loginId.toUpperCase(), {
        adminId: out.Pk_AdminId,
        loginId: out.LoginId,
        password: out.LogPassword,
        facilityId: f.facilityPk,
      });
      byFacility.set(Number(f.facilityPk), byLogin.get(loginId.toUpperCase()));
    } catch (err) {
      rows.push({
        status: 'error',
        districtName: f.districtName,
        facilityName: f.facilityName,
        facilityCode: f.facilityCode,
        loginId,
        error: err.message,
      });
      console.error('TU INSERT FAIL', loginId, err.message);
    }

    if (i % 100 === 0) {
      console.log(`TU progress ${i}/${facilities.length} (created ${created}, exists ${existed})`);
    }
  }

  console.log(`TU done: created=${created}, exists=${existed}, total=${rows.length}`);
  return rows;
}

async function writeExcel(districtRows, tuRows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TB Mukt UP';
  wb.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
  };

  const distSheet = wb.addWorksheet('District Logins', { views: [{ state: 'frozen', ySplit: 1 }] });
  distSheet.columns = [
    { header: 'Status', key: 'status', width: 12 },
    { header: 'District', key: 'districtName', width: 22 },
    { header: 'District ID', key: 'districtId', width: 12 },
    { header: 'District LGD', key: 'districtLgd', width: 12 },
    { header: 'LoginId', key: 'loginId', width: 16 },
    { header: 'Password', key: 'password', width: 14 },
    { header: 'User Type', key: 'userTypeName', width: 16 },
    { header: 'AdminId', key: 'adminId', width: 10 },
  ];
  distSheet.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
  for (const r of districtRows) distSheet.addRow(r);

  const tuSheet = wb.addWorksheet('TB Unit Logins', { views: [{ state: 'frozen', ySplit: 1 }] });
  tuSheet.columns = [
    { header: 'Status', key: 'status', width: 12 },
    { header: 'District', key: 'districtName', width: 18 },
    { header: 'Block', key: 'blockName', width: 18 },
    { header: 'Facility / TU Name', key: 'facilityName', width: 32 },
    { header: 'Facility Code', key: 'facilityCode', width: 14 },
    { header: 'Facility Type', key: 'facilityType', width: 16 },
    { header: 'LoginId', key: 'loginId', width: 14 },
    { header: 'Password', key: 'password', width: 14 },
    { header: 'User Type', key: 'userTypeName', width: 18 },
    { header: 'AdminId', key: 'adminId', width: 10 },
  ];
  tuSheet.getRow(1).eachCell((c) => Object.assign(c, { style: headerStyle }));
  for (const r of tuRows) tuSheet.addRow(r);

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value', key: 'value', width: 16 },
  ];
  summary.getRow(1).font = { bold: true };
  const distCreated = districtRows.filter((r) => r.status === 'created').length;
  const distExists = districtRows.filter((r) => r.status === 'exists').length;
  const tuCreated = tuRows.filter((r) => r.status === 'created' || r.status === 'dry').length;
  const tuExists = tuRows.filter((r) => r.status === 'exists').length;
  const tuErrors = tuRows.filter((r) => r.status === 'error').length;
  summary.addRows([
    { metric: 'Generated at', value: new Date().toISOString() },
    { metric: 'Dry run', value: dryRun ? 'YES' : 'NO' },
    { metric: 'District logins (total)', value: districtRows.length },
    { metric: 'District — existing', value: distExists },
    { metric: 'District — created', value: distCreated },
    { metric: 'TU logins (total)', value: tuRows.length },
    { metric: 'TU — existing', value: tuExists },
    { metric: 'TU — created/dry', value: tuCreated },
    { metric: 'TU — errors', value: tuErrors },
  ]);

  const outDir = path.join(__dirname, '..', '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `All_District_and_TU_Logins_${stamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

async function main() {
  console.log({ dryRun, districtsOnly, tusOnly });

  let districtRows = [];
  let tuRows = [];

  if (!tusOnly) {
    console.log('Loading / ensuring district logins...');
    districtRows = await loadDistrictCredentials();
    console.log(
      'Districts:',
      districtRows.length,
      'exists',
      districtRows.filter((r) => r.status === 'exists').length,
      'created',
      districtRows.filter((r) => r.status === 'created' || r.status === 'dry').length
    );
  }

  if (!districtsOnly) {
    console.log('Loading TB facilities...');
    const facilities = await loadTbFacilities();
    console.log('TB facilities:', facilities.length);
    console.log('Ensuring TU logins...');
    tuRows = await ensureTuLogins(facilities);
  }

  const outPath = await writeExcel(districtRows, tuRows);
  console.log('\nWrote', outPath);
  console.log({
    districts: districtRows.length,
    tus: tuRows.length,
    tuCreated: tuRows.filter((r) => r.status === 'created').length,
    tuExists: tuRows.filter((r) => r.status === 'exists').length,
    tuErrors: tuRows.filter((r) => r.status === 'error').length,
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
