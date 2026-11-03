/**
 * Create (or return existing) Block User logins for Hardoi blocks:
 * Bawan, Harpalur, Kothawan, Sandi
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

const USER_TYPE_BLOCK = 7;
const DISTRICT = 'Hardoi';
/** Display name → DB name aliases (Hardoi master uses "Kothwan", "Harpalpur") */
const BLOCKS = [
  { requested: 'Bawan', aliases: ['Bawan'] },
  { requested: 'Harpalur', aliases: ['Harpalur', 'Harpalpur'] },
  { requested: 'Kothawan', aliases: ['Kothawan', 'Kothwan'] },
  { requested: 'Sandi', aliases: ['Sandi'] },
];

function genPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function genLoginId(blockId) {
  return `BLU${blockId}`;
}

function nameMatch(dbName, target) {
  const a = String(dbName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const b = String(target || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return a === b || a.includes(b) || b.includes(a);
}

(async () => {
  const dryRun = process.argv.includes('--dry');

  const dist = await query(
    `
    SELECT TOP 1 PK_UniqueID AS id, DistrictName AS name, CAST(D_LGD AS NVARCHAR(50)) AS lgd
    FROM dbo.District
    WHERE ISNULL(IsDeleted,0)=0 AND DistrictName LIKE @d
    ORDER BY CASE WHEN DistrictName = @exact THEN 0 ELSE 1 END, PK_UniqueID
    `,
    { d: `%${DISTRICT}%`, exact: DISTRICT }
  );
  const district = dist.recordset[0];
  if (!district) {
    console.error('District not found:', DISTRICT);
    process.exit(1);
  }
  console.log('District:', district);

  const blocksRes = await query(
    `
    SELECT
      b.PK_UniqueID AS id,
      b.BlockName AS name,
      CAST(b.B_LGD AS NVARCHAR(50)) AS lgd,
      b.FK_DistrictID AS districtId
    FROM dbo.Block b
    WHERE ISNULL(b.IsDeleted,0)=0
      AND b.FK_DistrictID = @districtId
    ORDER BY b.BlockName
    `,
    { districtId: district.id }
  );
  const allBlocks = blocksRes.recordset;
  console.log(
    'Hardoi blocks sample:',
    allBlocks.map((b) => b.name).slice(0, 20)
  );

  // Sample an existing block user for field defaults
  const sample = await query(`
    SELECT TOP 1
      LoginId, LogPassword, Fk_Usertype, StateCode, DivisionCode,
      DistrictCode, TehsilCode, BlockCode,
      FacilityDistrictId, FacilityBlockId, FacilityDivisionId, FacilityTehsilId,
      Fk_FacilityTypeId, FacilityId, SubtypeId
    FROM dbo.AdminLogin
    WHERE ISNULL(isDeleted,0)=0 AND ISNULL(IsActive,1)=1 AND ISNULL(IsBlock,0)=0
      AND (Fk_Usertype = ${USER_TYPE_BLOCK} OR LoginId LIKE 'BLU%')
    ORDER BY Pk_AdminId DESC
  `);
  console.log('Sample block login:', sample.recordset[0] || null);

  const results = [];

  for (const target of BLOCKS) {
    const aliases = target.aliases || [target.requested];
    const block = allBlocks.find((b) => aliases.some((a) => nameMatch(b.name, a)));

    if (!block) {
      results.push({
        status: 'block_not_found',
        requested: target.requested,
        district: district.name,
        triedAliases: aliases,
      });
      console.error('BLOCK NOT FOUND', target.requested, aliases);
      continue;
    }

    const loginId = genLoginId(block.id);

    // Existing by block scope or login id
    const existing = await query(
      `
      SELECT TOP 5
        Pk_AdminId, LoginId, LogPassword, FirstName, LastName,
        Fk_Usertype, FacilityDistrictId, FacilityBlockId, BlockCode, IsActive, isDeleted
      FROM dbo.AdminLogin
      WHERE ISNULL(isDeleted,0)=0
        AND (
          LoginId = @loginId
          OR (
            Fk_Usertype = @ut
            AND (
              FacilityBlockId = @blockId
              OR BlockCode = @blockId
            )
            AND (
              FacilityDistrictId = @districtId
              OR DistrictCode = @districtId
              OR FacilityDistrictId = 0
            )
          )
        )
      ORDER BY
        CASE WHEN LoginId = @loginId THEN 0 ELSE 1 END,
        Pk_AdminId DESC
      `,
      { loginId, ut: USER_TYPE_BLOCK, blockId: block.id, districtId: district.id }
    );

    // Prefer exact match on this block + Hardoi
    const exact =
      existing.recordset.find((e) => e.LoginId === loginId) ||
      existing.recordset.find(
        (e) =>
          Number(e.FacilityBlockId || e.BlockCode) === Number(block.id) &&
          (Number(e.FacilityDistrictId) === Number(district.id) ||
            Number(e.DistrictCode) === Number(district.id) ||
            !e.FacilityDistrictId)
      ) ||
      existing.recordset[0];

    if (exact) {
      results.push({
        status: 'exists',
        requested: target.requested,
        district: district.name,
        blockName: block.name,
        blockId: block.id,
        blockLgd: block.lgd,
        loginId: exact.LoginId,
        password: String(exact.LogPassword || ''),
        adminId: exact.Pk_AdminId,
        userType: exact.Fk_Usertype,
        firstName: exact.FirstName,
      });
      console.log('EXISTS', target.requested, '→', block.name, exact.LoginId, exact.LogPassword);
      continue;
    }

    const password = genPassword(8);
    const firstName = `Block ${block.name}`.slice(0, 80);
    const mobile = String(9100000000 + (Number(block.id) % 100000000)).slice(0, 10);

    const row = {
      loginId,
      password,
      firstName,
      lastName: district.name,
      userType: USER_TYPE_BLOCK,
      stateCode: 1,
      divisionCode: 0,
      districtCode: 0,
      tehsilCode: 0,
      blockCode: block.id,
      mobile,
      facilityTypeId: 0,
      facilityId: 0,
      facilityDivisionId: 0,
      facilityDistrictId: district.id,
      facilityTehsilId: 0,
      facilityBlockId: block.id,
      facilityGpId: 0,
      facilityVillageId: 0,
      subtypeId: 0,
    };

    if (dryRun) {
      results.push({ status: 'dry', ...row, blockName: block.name, district: district.name });
      console.log('DRY', JSON.stringify(row));
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
        @stateCode, @divisionCode, @districtCode, @tehsilCode, @blockCode,
        @mobile, NULL, NULL, NULL, N'Uttar Pradesh', NULL,
        1, 0, 1, 0,
        @facilityTypeId, @facilityId,
        @facilityDivisionId, @facilityDistrictId, @facilityTehsilId,
        @facilityBlockId, @facilityGpId, @facilityVillageId,
        @subtypeId, 0, 0, 0
      )
      `,
      row
    );

    const out = ins.recordset[0];
    results.push({
      status: 'created',
      requested: target.requested,
      district: district.name,
      blockName: block.name,
      blockId: block.id,
      blockLgd: block.lgd,
      loginId: out.LoginId,
      password: String(out.LogPassword || ''),
      adminId: out.Pk_AdminId,
      userType: USER_TYPE_BLOCK,
      userTypeName: 'Block User',
    });
    console.log('CREATED', target.requested, '→', block.name, out.LoginId, out.LogPassword);
  }

  console.log('\n=== HARDOI BLOCK CREDENTIALS ===');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
