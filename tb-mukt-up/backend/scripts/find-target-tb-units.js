const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

const SEARCHES = [
  { districtLike: ['%Banda%', '%Bandha%'], unitLikes: ['%Mataundh%', '%DTC%', '%Banda Urban%', '%Urban%'] },
  { districtLike: ['%Basti%'], unitLikes: ['%Saughat%', '%Soughat%', '%Bhanpur%'] },
  { districtLike: ['%Hathras%'], unitLikes: ['%Sadabad%', '%Sahpau%'] },
  { districtLike: ['%Unnao%'], unitLikes: ['%Acalganj%', '%Achalganj%', '%Bighapur%'] },
  { districtLike: ['%Shamli%'], unitLikes: ['%Jhinjhana%', '%Kandhla%'] },
];

(async () => {
  // Discover facility type column name
  const typeCols = await query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Facility' AND COLUMN_NAME LIKE '%Type%'
  `);
  console.log('Facility type cols:', typeCols.recordset.map((r) => r.COLUMN_NAME));

  for (const s of SEARCHES) {
    const distOr = s.districtLike.map((_, i) => `d.DistrictName LIKE @d${i}`).join(' OR ');
    const inputs = {};
    s.districtLike.forEach((v, i) => { inputs[`d${i}`] = v; });

    const allInDist = await query(`
      SELECT
        f.PK_UniqueID AS facilityPk,
        f.FK_FacilityCode AS facilityCode,
        f.FacilityName,
        f.Linked_FacilityCode,
        f.FK_DistrictID AS districtId,
        d.DistrictName,
        f.FK_BlockID AS blockId,
        b.BlockName,
        f.FK_DivisionID AS divisionId,
        f.FK_TehsilID AS tehsilId,
        f.FK_GrampanchayatID AS gpId,
        f.FK_VillageID AS villageId
      FROM dbo.FacililtySubtype fs
      INNER JOIN dbo.Facility f ON fs.Fk_FacilityId = f.FK_FacilityCode
      LEFT JOIN dbo.District d ON d.PK_UniqueID = f.FK_DistrictID
      LEFT JOIN dbo.Block b ON b.PK_UniqueID = f.FK_BlockID
      WHERE fs.Fk_SubtypeId = 34
        AND ISNULL(fs.IsDeleted,0)=0
        AND ISNULL(f.IsDeleted,0)=0
        AND (${distOr})
      ORDER BY f.FacilityName
    `, inputs);

    console.log(`\n======== District filters ${s.districtLike.join('|')} — ALL TB units (${allInDist.recordset.length}) ========`);
    for (const r of allInDist.recordset) {
      const match = s.unitLikes.some((u) => new RegExp(u.replace(/%/g, '.*'), 'i').test(r.FacilityName || ''));
      console.log(`${match ? '>>>' : '   '} ${r.FacilityName} | code=${r.facilityCode} pk=${r.facilityPk} block=${r.BlockName}(${r.blockId}) dist=${r.DistrictName}(${r.districtId})`);
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
