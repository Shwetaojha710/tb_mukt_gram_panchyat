/**
 * READ-ONLY: verify Kakori / block scope sync between Overview-style and legacy dashboard-style filters.
 * Does not modify any data.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { query } = require('../src/config/db');

(async () => {
  const blocks = await query(`
    SELECT TOP 5 PK_UniqueID AS blockId, BlockName AS blockName, FK_DistrictID AS districtId
    FROM dbo.Block
    WHERE ISNULL(IsDeleted,0)=0 AND BlockName LIKE N'%Kakori%'
  `);
  console.log('Kakori blocks:', blocks.recordset);

  const blockId = blocks.recordset[0]?.blockId;
  if (!blockId) {
    console.log('No Kakori block found');
    process.exit(0);
  }

  const entryStats = await query(
    `
    SELECT
      COUNT(*) AS totalRows,
      SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN status='DRAFT' THEN 1 ELSE 0 END) AS drafts,
      COUNT(DISTINCT gp_id) AS gps,
      SUM(CASE WHEN tehsil_id IS NULL OR tehsil_id = 0 THEN 1 ELSE 0 END) AS tehsilNullOr0,
      SUM(CASE WHEN tehsil_id IS NOT NULL AND tehsil_id <> 0 AND tehsil_id <> block_id THEN 1 ELSE 0 END) AS tehsilMismatchBlock,
      SUM(CASE WHEN tehsil_id = block_id THEN 1 ELSE 0 END) AS tehsilEqualsBlock,
      MIN(reporting_year) AS minYear,
      MAX(reporting_year) AS maxYear
    FROM dbo.tb_mukt_entries
    WHERE block_id = @blockId AND reporting_year = 2026
    `,
    { blockId }
  );
  console.log('Entry stats 2026 by block_id:', entryStats.recordset[0]);

  const byTehsil = await query(
    `
    SELECT COUNT(*) AS rowsByTehsilIdEqualsBlockId
    FROM dbo.tb_mukt_entries
    WHERE tehsil_id = @blockId AND reporting_year = 2026 AND status='SUBMITTED'
    `,
    { blockId }
  );
  console.log('SUBMITTED rows if filtered by tehsil_id=@blockId:', byTehsil.recordset[0]);

  const byBlock = await query(
    `
    SELECT COUNT(*) AS rowsByBlockId
    FROM dbo.tb_mukt_entries
    WHERE block_id = @blockId AND reporting_year = 2026 AND status='SUBMITTED'
    `,
    { blockId }
  );
  console.log('SUBMITTED rows if filtered by block_id:', byBlock.recordset[0]);

  const sample = await query(
    `
    SELECT TOP 5
      id, gp_id, gp_name, block_id, tehsil_id, district_id,
      reporting_year, reporting_month, status
    FROM dbo.tb_mukt_entries
    WHERE block_id = @blockId AND reporting_year = 2026
    ORDER BY reporting_month DESC, id DESC
    `,
    { blockId }
  );
  console.log('Sample rows:', sample.recordset);

  // Admin logins for this block
  const logins = await query(
    `
    SELECT TOP 5
      Pk_AdminId, LoginId, FirstName, LastName, Fk_Usertype,
      FacilityBlockId, FacilityTehsilId, FacilityDistrictId, BlockCode, TehsilCode, DistrictCode
    FROM dbo.AdminLogin
    WHERE ISNULL(isDeleted,0)=0 AND ISNULL(IsActive,1)=1
      AND (FacilityBlockId = @blockId OR BlockCode = @blockId OR FacilityTehsilId = @blockId OR TehsilCode = @blockId)
    `,
    { blockId }
  );
  console.log('Related logins:', logins.recordset);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
