require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../src/config/db');

async function runSqlFile(pool, filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const batches = raw
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const batch of batches) {
    await pool.request().query(batch);
  }
}

async function seedFallbackLocations(pool) {
  const check = await pool.request().query('SELECT COUNT(*) AS c FROM dbo.tb_mukt_state');
  if (check.recordset[0].c > 0) return;

  await pool.request().query(`
    INSERT INTO dbo.tb_mukt_state (code, name) VALUES ('09', N'Uttar Pradesh');
  `);
  const state = await pool.request().query(`SELECT TOP 1 id FROM dbo.tb_mukt_state ORDER BY id`);
  const stateId = state.recordset[0].id;

  await pool
    .request()
    .input('stateId', sql.Int, stateId)
    .query(`
      INSERT INTO dbo.tb_mukt_division (state_id, code, name) VALUES
      (@stateId, 'LKO', N'Lucknow'),
      (@stateId, 'VNS', N'Varanasi'),
      (@stateId, 'KNP', N'Kanpur');
    `);

  const div = await pool
    .request()
    .input('stateId', sql.Int, stateId)
    .query(`SELECT TOP 1 id FROM dbo.tb_mukt_division WHERE state_id = @stateId ORDER BY id`);
  const divisionId = div.recordset[0].id;

  await pool
    .request()
    .input('divisionId', sql.Int, divisionId)
    .input('stateId', sql.Int, stateId)
    .query(`
      INSERT INTO dbo.tb_mukt_district (division_id, state_id, code, name) VALUES
      (@divisionId, @stateId, '166', N'Lucknow'),
      (@divisionId, @stateId, '168', N'Barabanki');
    `);

  const dist = await pool
    .request()
    .input('divisionId', sql.Int, divisionId)
    .query(`SELECT TOP 1 id FROM dbo.tb_mukt_district WHERE division_id = @divisionId ORDER BY id`);
  const districtId = dist.recordset[0].id;

  await pool
    .request()
    .input('districtId', sql.Int, districtId)
    .query(`
      INSERT INTO dbo.tb_mukt_tehsil (district_id, code, name) VALUES
      (@districtId, 'T1', N'Lucknow Sadar'),
      (@districtId, 'T2', N'Malihabad');
    `);

  const teh = await pool
    .request()
    .input('districtId', sql.Int, districtId)
    .query(`SELECT TOP 1 id FROM dbo.tb_mukt_tehsil WHERE district_id = @districtId ORDER BY id`);
  const tehsilId = teh.recordset[0].id;

  await pool
    .request()
    .input('tehsilId', sql.Int, tehsilId)
    .input('districtId', sql.Int, districtId)
    .query(`
      INSERT INTO dbo.tb_mukt_block (tehsil_id, district_id, code, name) VALUES
      (@tehsilId, @districtId, 'B1', N'Chinhat'),
      (@tehsilId, @districtId, 'B2', N'Sarojininagar');
    `);

  const blk = await pool
    .request()
    .input('tehsilId', sql.Int, tehsilId)
    .query(`SELECT TOP 1 id FROM dbo.tb_mukt_block WHERE tehsil_id = @tehsilId ORDER BY id`);
  const blockId = blk.recordset[0].id;

  await pool
    .request()
    .input('blockId', sql.Int, blockId)
    .query(`
      INSERT INTO dbo.tb_mukt_gp (block_id, code, name, population) VALUES
      (@blockId, 'GP1', N'Amethi GP', 4500),
      (@blockId, 'GP2', N'Kakori GP', 5200);
    `);

  const gp = await pool
    .request()
    .input('blockId', sql.Int, blockId)
    .query(`SELECT TOP 1 id, name FROM dbo.tb_mukt_gp WHERE block_id = @blockId ORDER BY id`);
  const gpId = gp.recordset[0].id;

  await pool
    .request()
    .input('gpId', sql.Int, gpId)
    .query(`
      INSERT INTO dbo.tb_mukt_village (gp_id, code, name, population) VALUES
      (@gpId, 'V1', N'Amethi Village', 2100),
      (@gpId, 'V2', N'Purwa', 1800);

      INSERT INTO dbo.tb_mukt_tb_unit (gp_id, code, name, unit_type) VALUES
      (@gpId, 'CHC1', N'Chinhat CHC', 'CHC');
    `);

  console.log('Seeded fallback UP location hierarchy');
}

async function upsertLocationMap(pool, level, mapping) {
  await pool
    .request()
    .input('level', sql.NVarChar, level)
    .input('mode', sql.NVarChar, mapping.source_mode)
    .input('schema', sql.NVarChar, mapping.table_schema)
    .input('table', sql.NVarChar, mapping.table_name)
    .input('idCol', sql.NVarChar, mapping.id_column)
    .input('nameCol', sql.NVarChar, mapping.name_column)
    .input('codeCol', sql.NVarChar, mapping.code_column)
    .input('parentCol', sql.NVarChar, mapping.parent_column)
    .input('popCol', sql.NVarChar, mapping.population_column)
    .query(`
      MERGE dbo.tb_mukt_location_map AS t
      USING (SELECT @level AS level_name) AS s
      ON t.level_name = s.level_name
      WHEN MATCHED THEN UPDATE SET
        source_mode = @mode,
        table_schema = @schema,
        table_name = @table,
        id_column = @idCol,
        name_column = @nameCol,
        code_column = @codeCol,
        parent_column = @parentCol,
        population_column = @popCol,
        updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        (level_name, source_mode, table_schema, table_name, id_column, name_column, code_column, parent_column, population_column)
      VALUES
        (@level, @mode, @schema, @table, @idCol, @nameCol, @codeCol, @parentCol, @popCol);
    `);
}

async function configureFallbackMaps(pool) {
  const maps = [
    { level: 'state', table: 'tb_mukt_state', parent: null, pop: null },
    { level: 'division', table: 'tb_mukt_division', parent: 'state_id', pop: null },
    { level: 'district', table: 'tb_mukt_district', parent: 'division_id', pop: null },
    { level: 'tehsil', table: 'tb_mukt_tehsil', parent: 'district_id', pop: null },
    { level: 'block', table: 'tb_mukt_block', parent: 'tehsil_id', pop: null },
    { level: 'gp', table: 'tb_mukt_gp', parent: 'block_id', pop: 'population' },
    { level: 'village', table: 'tb_mukt_village', parent: 'gp_id', pop: 'population' },
    { level: 'tbUnit', table: 'tb_mukt_tb_unit', parent: 'gp_id', pop: null },
  ];

  for (const m of maps) {
    await upsertLocationMap(pool, m.level, {
      source_mode: 'FALLBACK',
      table_schema: 'dbo',
      table_name: m.table,
      id_column: 'id',
      name_column: 'name',
      code_column: 'code',
      parent_column: m.parent,
      population_column: m.pop,
    });
  }
}

async function tryMapExisting(pool) {
  const reportPath = path.join(__dirname, '..', 'sql', 'schema-inspection-report.json');
  if (!fs.existsSync(reportPath)) {
    console.log('No schema report yet — using fallback location tables');
    return false;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  let mapped = 0;
  for (const [level, candidates] of Object.entries(report.candidates || {})) {
    const best = (candidates || []).find((c) => c.guessed?.id && c.guessed?.name);
    if (!best) continue;
    // Prefer non-tb_mukt tables as EXISTING
    if (String(best.table).toLowerCase().startsWith('tb_mukt_')) continue;
    await upsertLocationMap(pool, level, {
      source_mode: 'EXISTING',
      table_schema: best.schema,
      table_name: best.table,
      id_column: best.guessed.id,
      name_column: best.guessed.name,
      code_column: best.guessed.code,
      parent_column: best.guessed.parent,
      population_column: best.guessed.population,
    });
    mapped += 1;
    console.log(`Mapped ${level} -> ${best.schema}.${best.table}`);
  }
  return mapped > 0;
}

async function seedAdmin(pool) {
  const existing = await pool
    .request()
    .input('username', sql.NVarChar, 'admin')
    .query(`SELECT id FROM dbo.tb_mukt_users WHERE username = @username`);
  if (existing.recordset.length) return;

  const hash = await bcrypt.hash('Admin@12345', 12);
  const state = await pool.request().query(`SELECT TOP 1 id FROM dbo.tb_mukt_state ORDER BY id`);
  const stateId = state.recordset[0]?.id || null;

  await pool
    .request()
    .input('fullName', sql.NVarChar, 'State Administrator')
    .input('mobile', sql.NVarChar, '9999999999')
    .input('email', sql.NVarChar, 'admin@tbmukt.up.gov.in')
    .input('username', sql.NVarChar, 'admin')
    .input('hash', sql.NVarChar, hash)
    .input('designation', sql.NVarChar, 'State Team')
    .input('role', sql.NVarChar, 'STATE')
    .input('stateId', sql.Int, stateId)
    .query(`
      INSERT INTO dbo.tb_mukt_users
        (full_name, mobile, email, username, password_hash, designation, role, state_id)
      VALUES
        (@fullName, @mobile, @email, @username, @hash, @designation, @role, @stateId)
    `);
  console.log('Seeded admin user: admin / Admin@12345');
}

async function main() {
  if (!process.env.MSSQL_PASSWORD) {
    throw new Error('Set MSSQL_PASSWORD in backend/.env before running init-db');
  }
  const pool = await getPool();
  const sqlFile = path.join(__dirname, '..', 'sql', '01_create_tb_mukt_tables.sql');
  console.log('Creating TB Mukt tables...');
  await runSqlFile(pool, sqlFile);
  await seedFallbackLocations(pool);
  await configureFallbackMaps(pool);

  try {
    // Optional: run inspection then remap
    require('child_process').execSync('node scripts/inspect-schema.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
    await tryMapExisting(pool);
  } catch (err) {
    console.warn('Schema inspection skipped/failed:', err.message);
  }

  await seedAdmin(pool);
  console.log('Database initialization complete');
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
