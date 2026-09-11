const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/**
 * Facility DB location cascade (as requested):
 * District (dbo.District)
 *   → Tehsil (dbo.Block)          // Block table used as Tehsil
 *     → GramPanchayat (dbo.GramPanchayat)
 *       → Village (dbo.Village)
 */

const LEVELS = {
  state: {
    table: 'State',
    id: 'PK_UniqueID',
    name: 'StateName',
    code: null,
    population: null,
    parent: null,
    deleted: 'Isdeleted',
  },
  division: {
    table: 'Division',
    id: 'PK_UniqueID',
    name: 'DivisionName',
    code: 'DivisionCode',
    population: 'Population',
    parent: 'Fk_StateId',
    deleted: 'IsDeleted',
  },
  district: {
    table: 'District',
    id: 'PK_UniqueID',
    name: 'DistrictName',
    code: 'D_LGD',
    population: 'Population',
    parent: null,
    deleted: 'IsDeleted',
  },
  // User maps Tehsil → dbo.Block
  tehsil: {
    table: 'Block',
    id: 'PK_UniqueID',
    name: 'BlockName',
    code: 'B_LGD',
    population: 'Population',
    parent: 'FK_DistrictID',
    deleted: 'IsDeleted',
  },
  // Alias: block uses same Block table (for TB entry / dashboards)
  block: {
    table: 'Block',
    id: 'PK_UniqueID',
    name: 'BlockName',
    code: 'B_LGD',
    population: 'Population',
    parent: 'FK_DistrictID',
    deleted: 'IsDeleted',
  },
  gp: {
    table: 'GramPanchayat',
    id: 'PK_UniqueId',
    name: 'GramPanchayatName',
    code: 'G_LGD',
    population: 'Population',
    parent: 'FK_BlockID',
    deleted: 'IsDeleted',
  },
  village: {
    table: 'Village',
    id: 'PK_UniqueID',
    name: 'VillageName',
    code: 'VillageCode',
    population: 'Population',
    parent: 'Fk_GramPanchayatId',
    deleted: 'IsDeleted',
  },
};

function qIdent(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new AppError('Invalid SQL identifier', 500);
  }
  return `[${name}]`;
}

async function fetchChildren(level, parentId) {
  const map = LEVELS[level];
  if (!map) {
    throw new AppError(`Location level not supported: ${level}`, 400);
  }

  const table = qIdent(map.table);
  const idCol = qIdent(map.id);
  const nameCol = qIdent(map.name);
  const codeCol = map.code ? qIdent(map.code) : null;
  const popCol = map.population ? qIdent(map.population) : null;
  const parentCol = map.parent ? qIdent(map.parent) : null;
  const deletedCol = map.deleted ? qIdent(map.deleted) : null;

  const selectParts = [
    `${idCol} AS id`,
    `${nameCol} AS name`,
    codeCol ? `CAST(${codeCol} AS NVARCHAR(50)) AS code` : `CAST(NULL AS NVARCHAR(50)) AS code`,
    popCol ? `CAST(${popCol} AS INT) AS population` : `CAST(NULL AS INT) AS population`,
  ];

  let sqlText = `SELECT ${selectParts.join(', ')} FROM dbo.${table}`;
  const where = [];
  const inputs = {};

  if (deletedCol) {
    where.push(`ISNULL(${deletedCol}, 0) = 0`);
  }

  if (parentCol && parentId != null && parentId !== '' && parentId !== 'all') {
    where.push(`${parentCol} = @parentId`);
    inputs.parentId = Number(parentId);
  } else if (parentCol && level !== 'district') {
    // Child levels require parent
    return [];
  }

  if (where.length) {
    sqlText += ` WHERE ${where.join(' AND ')}`;
  }

  sqlText += ` ORDER BY ${nameCol}`;
  const result = await query(sqlText, inputs);
  return result.recordset;
}

async function getById(level, id) {
  const map = LEVELS[level];
  if (!map || id == null) return null;

  const table = qIdent(map.table);
  const idCol = qIdent(map.id);
  const nameCol = qIdent(map.name);
  const codeCol = map.code ? qIdent(map.code) : null;
  const popCol = map.population ? qIdent(map.population) : null;
  const deletedCol = map.deleted ? qIdent(map.deleted) : null;

  let sqlText = `
    SELECT TOP 1
      ${idCol} AS id,
      ${nameCol} AS name,
      ${codeCol ? `CAST(${codeCol} AS NVARCHAR(50)) AS code` : `CAST(NULL AS NVARCHAR(50)) AS code`},
      ${popCol ? `CAST(${popCol} AS INT) AS population` : `CAST(NULL AS INT) AS population`}
    FROM dbo.${table}
    WHERE ${idCol} = @id
  `;
  if (deletedCol) {
    sqlText += ` AND ISNULL(${deletedCol}, 0) = 0`;
  }

  const result = await query(sqlText, { id: Number(id) });
  return result.recordset[0] || null;
}

async function getContextBundle(ids = {}) {
  // Tehsil selection uses Block IDs; treat tehsilId/blockId interchangeably
  const blockId = ids.blockId || ids.tehsilId;

  const [district, block, gp, village, tbUnits] = await Promise.all([
    ids.districtId ? getById('district', ids.districtId) : null,
    blockId ? getById('block', blockId) : null,
    ids.gpId ? getById('gp', ids.gpId) : null,
    ids.villageId ? getById('village', ids.villageId) : null,
    fetchTbUnits({ gpId: ids.gpId, blockId }),
  ]);

  // Prefer GP-matched unit; otherwise first block-level TB facility
  const tbUnit = tbUnits[0] || null;

  return {
    districtCode: district?.code || null,
    districtName: district?.name || null,
    blockCode: block?.code || null,
    blockName: block?.name || null,
    tehsilCode: block?.code || null,
    tehsilName: block?.name || null,
    gpCode: gp?.code || null,
    gpName: gp?.name || null,
    gpPopulation: gp?.population || 0,
    villageCode: village?.code || null,
    villageName: village?.name || null,
    villagePopulation: village?.population || 0,
    tbUnitId: tbUnit?.id || null,
    tbUnitCode: tbUnit?.code || null,
    tbUnitName: tbUnit?.name || null,
    tbUnits,
  };
}

/**
 * TB Units = Facility rows linked via FacililtySubtype where Fk_SubtypeId = 34 (SubType = 'TB')
 * Prefer GP match; fall back to Block.
 */
async function fetchTbUnits({ gpId, blockId } = {}) {
  const gp = Number(gpId);
  const block = Number(blockId);
  const hasGp = Number.isFinite(gp) && gp > 0;
  const hasBlock = Number.isFinite(block) && block > 0;
  if (!hasGp && !hasBlock) return [];

  const inputs = { subtypeId: 34 };
  const whereLoc = [];
  if (hasGp) {
    whereLoc.push('f.FK_GrampanchayatID = @gpId');
    inputs.gpId = gp;
  }
  if (hasBlock) {
    whereLoc.push('f.FK_BlockID = @blockId');
    inputs.blockId = block;
  }

  // Prefer GP-linked facilities first, then block-level
  const result = await query(
    `
    SELECT
      id, name, code, blockId, gpId
    FROM (
      SELECT
        f.PK_UniqueID AS id,
        f.FacilityName AS name,
        CAST(
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(f.Linked_FacilityCode, ''))), '') IS NOT NULL
              THEN LTRIM(RTRIM(f.Linked_FacilityCode))
            ELSE CAST(f.FK_FacilityCode AS NVARCHAR(50))
          END AS NVARCHAR(50)
        ) AS code,
        f.FK_BlockID AS blockId,
        f.FK_GrampanchayatID AS gpId,
        ROW_NUMBER() OVER (
          PARTITION BY f.PK_UniqueID
          ORDER BY ${hasGp ? `CASE WHEN f.FK_GrampanchayatID = @gpId THEN 0 ELSE 1 END,` : ''} f.FacilityName
        ) AS rn,
        ${hasGp ? `CASE WHEN f.FK_GrampanchayatID = @gpId THEN 0 ELSE 1 END` : `0`} AS pref
      FROM dbo.FacililtySubtype fs
      INNER JOIN dbo.Facility f ON fs.Fk_FacilityId = f.FK_FacilityCode
      WHERE fs.Fk_SubtypeId = @subtypeId
        AND ISNULL(fs.IsDeleted, 0) = 0
        AND ISNULL(fs.Status, 1) = 1
        AND ISNULL(f.IsDeleted, 0) = 0
        AND (${whereLoc.join(' OR ')})
    ) x
    WHERE rn = 1
    ORDER BY pref, name
    `,
    inputs
  );

  return result.recordset || [];
}

/** From blockId, resolve parent district (and block details) for form prefill */
async function resolveFromBlock(blockId) {
  const id = Number(blockId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('blockId is required', 400);
  }

  const result = await query(
    `
    SELECT TOP 1
      b.PK_UniqueID AS blockId,
      b.BlockName AS blockName,
      CAST(b.B_LGD AS NVARCHAR(50)) AS blockCode,
      b.FK_DistrictID AS districtId,
      d.DistrictName AS districtName,
      CAST(d.D_LGD AS NVARCHAR(50)) AS districtCode
    FROM dbo.Block b
    LEFT JOIN dbo.District d
      ON d.PK_UniqueID = b.FK_DistrictID AND ISNULL(d.IsDeleted, 0) = 0
    WHERE b.PK_UniqueID = @blockId AND ISNULL(b.IsDeleted, 0) = 0
    `,
    { blockId: id }
  );

  const row = result.recordset[0];
  if (!row) throw new AppError('Block not found', 404);

  return {
    blockId: Number(row.blockId),
    blockName: row.blockName || null,
    blockCode: row.blockCode || null,
    districtId: row.districtId != null ? Number(row.districtId) : null,
    districtName: row.districtName || null,
    districtCode: row.districtCode || null,
    tehsilId: Number(row.blockId),
  };
}

module.exports = {
  fetchChildren,
  getById,
  getContextBundle,
  resolveFromBlock,
  fetchTbUnits,
  LEVELS,
};
