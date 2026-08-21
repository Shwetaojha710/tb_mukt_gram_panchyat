require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../src/config/db');

async function listTables(pool) {
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
  return result.recordset;
}

async function listColumns(pool, schema, table) {
  const result = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `);
  return result.recordset;
}

function scoreTable(name, level) {
  const n = name.toLowerCase();
  const patterns = {
    state: ['state'],
    division: ['division', 'mandal'],
    district: ['district'],
    tehsil: ['tehsil', 'taluk', 'taluka', 'subdistrict', 'sub_district'],
    block: ['block'],
    gp: ['grampanchayat', 'gram_panchayat', 'panchayat', 'gp'],
    village: ['village', 'revenuevillage'],
    tbUnit: ['tbunit', 'tb_unit', 'chc', 'phi', 'facility'],
  };
  return (patterns[level] || []).some((p) => n.includes(p)) ? 1 : 0;
}

function pickColumns(columns, kind) {
  const names = columns.map((c) => c.COLUMN_NAME);
  const lower = Object.fromEntries(names.map((n) => [n.toLowerCase(), n]));
  const find = (...cands) => {
    for (const c of cands) {
      if (lower[c.toLowerCase()]) return lower[c.toLowerCase()];
    }
    return null;
  };

  if (kind === 'id') {
    return find('id', 'stateid', 'state_id', 'divisionid', 'districtid', 'tehsilid', 'blockid', 'gpid', 'villageid', 'facilityid');
  }
  if (kind === 'name') {
    return find('name', 'statename', 'state_name', 'divisionname', 'districtname', 'tehsilname', 'blockname', 'gpname', 'villagename', 'facilityname');
  }
  if (kind === 'code') {
    return find('code', 'statecode', 'districtcode', 'blockcode', 'gpcode', 'villagecode', 'facilitycode');
  }
  if (kind === 'parent') {
    return find('stateid', 'state_id', 'divisionid', 'division_id', 'districtid', 'district_id', 'tehsilid', 'tehsil_id', 'blockid', 'block_id', 'gpid', 'gp_id', 'parentid', 'parent_id');
  }
  if (kind === 'population') {
    return find('population', 'gp_population', 'village_population', 'totalpopulation');
  }
  return null;
}

async function main() {
  const pool = await getPool();
  const tables = await listTables(pool);
  const report = {
    database: process.env.MSSQL_DATABASE,
    tableCount: tables.length,
    tables: tables.map((t) => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`),
    candidates: {},
  };

  const levels = ['state', 'division', 'district', 'tehsil', 'block', 'gp', 'village', 'tbUnit'];
  for (const level of levels) {
    const matches = [];
    for (const t of tables) {
      if (!scoreTable(t.TABLE_NAME, level)) continue;
      const cols = await listColumns(pool, t.TABLE_SCHEMA, t.TABLE_NAME);
      matches.push({
        schema: t.TABLE_SCHEMA,
        table: t.TABLE_NAME,
        columns: cols.map((c) => c.COLUMN_NAME),
        guessed: {
          id: pickColumns(cols, 'id'),
          name: pickColumns(cols, 'name'),
          code: pickColumns(cols, 'code'),
          parent: pickColumns(cols, 'parent'),
          population: pickColumns(cols, 'population'),
        },
      });
    }
    report.candidates[level] = matches;
  }

  const outDir = path.join(__dirname, '..', 'sql');
  const outPath = path.join(outDir, 'schema-inspection-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(`Found ${tables.length} tables`);
  levels.forEach((l) => console.log(`  ${l}: ${report.candidates[l].length} candidate(s)`));
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
