const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

/**
 * Map Facility UserTypeMaster labels to TB Mukt RBAC roles.
 */
function mapUserTypeToRole(userTypeName = '') {
  const n = String(userTypeName).toLowerCase();
  if (n.includes('division')) return 'DIVISION';
  if (n.includes('tehsil')) return 'TEHSIL';
  if (n.includes('district') || n.includes('cmo')) return 'DISTRICT';
  if (n.includes('block') || n.includes('facility') || n.includes('hwc') || n.includes('subtype')) {
    return 'BLOCK';
  }
  if (n.includes('village') || n.includes('gram')) return 'VILLAGE';
  if (n.includes('panchayat') || n.includes(' gp')) return 'GP';
  // Super Admin, Admin, State*, Logistic State*
  return 'STATE';
}

/** How deep location cascade must go for a login type */
function locationDepthForRole(role) {
  switch (role) {
    case 'STATE':
      return 'state';
    case 'DIVISION':
      return 'division';
    case 'DISTRICT':
      return 'district';
    case 'TEHSIL':
      return 'tehsil';
    case 'BLOCK':
      return 'block';
    case 'GP':
      return 'gp';
    case 'VILLAGE':
      return 'village';
    default:
      return 'state';
  }
}

async function listActiveUserTypes() {
  const result = await query(`
    SELECT
      Pk_UsertypeId AS id,
      UserType AS name
    FROM dbo.UserTypeMaster
    WHERE ISNULL(Isdeleted, 0) = 0
    ORDER BY Pk_UsertypeId
  `);

  return result.recordset.map((row) => {
    const role = mapUserTypeToRole(row.name);
    return {
      id: row.id,
      name: row.name,
      role,
      locationDepth: locationDepthForRole(role),
    };
  });
}

async function getUserTypeById(id) {
  const result = await query(
    `
    SELECT TOP 1
      Pk_UsertypeId AS id,
      UserType AS name
    FROM dbo.UserTypeMaster
    WHERE Pk_UsertypeId = @id AND ISNULL(Isdeleted, 0) = 0
    `,
    { id: Number(id) }
  );
  const row = result.recordset[0];
  if (!row) throw new AppError('Invalid Login As / User Type', 400);
  const role = mapUserTypeToRole(row.name);
  return {
    id: row.id,
    name: row.name,
    role,
    locationDepth: locationDepthForRole(role),
  };
}

module.exports = {
  listActiveUserTypes,
  getUserTypeById,
  mapUserTypeToRole,
  locationDepthForRole,
};
