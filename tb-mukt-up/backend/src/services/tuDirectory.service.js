const fs = require('fs');
const path = require('path');
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'tu-directory');
const ALLOWED_YEARS = [2024, 2025, 2026];

const cache = new Map();

function listAvailableYears() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .map((f) => {
      const m = /^(\d{4})\.json$/i.exec(f);
      return m ? Number(m[1]) : null;
    })
    .filter((y) => y != null && ALLOWED_YEARS.includes(y))
    .sort((a, b) => b - a);
}

function loadYear(year) {
  const y = Number(year);
  if (!ALLOWED_YEARS.includes(y)) {
    throw new AppError(`Year must be one of ${ALLOWED_YEARS.join(', ')}`, 400);
  }
  if (cache.has(y)) return cache.get(y);

  const file = path.join(DATA_DIR, `${y}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.set(y, data);
  return data;
}

async function resolveScopedDistrictName(user) {
  const role = String(user?.role || '').toUpperCase();
  if (!['DISTRICT', 'TEHSIL', 'BLOCK'].includes(role)) return null;
  if (user.districtName) return String(user.districtName).trim() || null;
  const districtId = Number(user.districtId);
  if (!Number.isFinite(districtId) || districtId <= 0) return null;
  const res = await query(
    `
    SELECT TOP 1 DistrictName AS name
    FROM dbo.District
    WHERE PK_UniqueID = @districtId AND ISNULL(IsDeleted, 0) = 0
    `,
    { districtId }
  );
  return res.recordset[0]?.name || null;
}

function filterDistricts(districts, scopedName, districtFilter) {
  let list = districts || [];
  if (scopedName) {
    const needle = scopedName.toLowerCase();
    list = list.filter((d) => String(d.name).toLowerCase() === needle);
  } else if (districtFilter) {
    const needle = String(districtFilter).trim().toLowerCase();
    list = list.filter((d) => String(d.name).toLowerCase().includes(needle));
  }
  return list;
}

/** Years menu + which files exist (2024/2026 may be empty until imported). */
async function getMeta(user) {
  const available = listAvailableYears();
  return {
    years: ALLOWED_YEARS,
    availableYears: available,
    defaultYear: available.includes(2025) ? 2025 : available[0] || 2025,
    scopedDistrict: await resolveScopedDistrictName(user),
  };
}

/**
 * District summary for a year (no TU rows — keeps payload small).
 * Optional q = district name search.
 */
async function getSummary(user, { year, q } = {}) {
  const meta = await getMeta(user);
  const y = Number(year) || meta.defaultYear;
  const data = loadYear(y);
  if (!data) {
    return {
      year: y,
      available: false,
      totalDistricts: 0,
      totalTus: 0,
      totalAnnualTarget: 0,
      districts: [],
      message: `No TU directory data for ${y} yet.`,
    };
  }

  const districts = filterDistricts(data.districts, meta.scopedDistrict, q).map((d) => ({
    name: d.name,
    tuCount: d.tuCount,
    annualTarget: d.annualTarget,
  }));

  return {
    year: y,
    available: true,
    source: data.source || null,
    totalDistricts: districts.length,
    totalTus: districts.reduce((s, d) => s + d.tuCount, 0),
    totalAnnualTarget: districts.reduce((s, d) => s + d.annualTarget, 0),
    districts,
  };
}

/** TU list for one district in a year. */
async function getDistrictDetail(user, { year, district } = {}) {
  const meta = await getMeta(user);
  const y = Number(year) || meta.defaultYear;
  const name = String(district || '').trim();
  if (!name) throw new AppError('district is required', 400);

  const data = loadYear(y);
  if (!data) throw new AppError(`No TU directory data for ${y}`, 404);

  if (meta.scopedDistrict && meta.scopedDistrict.toLowerCase() !== name.toLowerCase()) {
    throw new AppError('Not allowed to view another district', 403);
  }

  const row = (data.districts || []).find(
    (d) => String(d.name).toLowerCase() === name.toLowerCase()
  );
  if (!row) throw new AppError(`District not found: ${name}`, 404);

  return {
    year: y,
    district: row.name,
    tuCount: row.tuCount,
    annualTarget: row.annualTarget,
    tus: row.tus || [],
  };
}

module.exports = {
  getMeta,
  getSummary,
  getDistrictDetail,
  ALLOWED_YEARS,
};
