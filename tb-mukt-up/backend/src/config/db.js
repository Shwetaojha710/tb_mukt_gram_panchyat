const sql = require('mssql');

let poolPromise;

function buildConfig() {
  const port = Number(process.env.MSSQL_PORT || 1433);
  const encrypt = String(process.env.MSSQL_ENCRYPT || 'true').toLowerCase() === 'true';
  const trust = String(process.env.MSSQL_TRUST_CERT || 'true').toLowerCase() === 'true';

  return {
    server: process.env.MSSQL_SERVER,
    port,
    database: process.env.MSSQL_DATABASE,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: {
      encrypt,
      trustServerCertificate: trust,
      enableArithAbort: true,
    },
    pool: {
      max: 20,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 20000,
    requestTimeout: 60000,
  };
}

function getPool() {
  const password = (process.env.MSSQL_PASSWORD || '').trim();
  if (!password) {
    return Promise.reject(new Error('MSSQL_PASSWORD is not set in .env'));
  }
  // Keep trimmed value for connect
  process.env.MSSQL_PASSWORD = password;
  if (!poolPromise) {
    poolPromise = sql
      .connect(buildConfig())
      .then((pool) => {
        pool.on('error', (err) => {
          console.error('MSSQL pool error', err);
          poolPromise = null;
        });
        return pool;
      })
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

async function query(queryText, inputs = {}) {
  const pool = await getPool();
  const request = pool.request();
  Object.entries(inputs).forEach(([key, value]) => {
    request.input(key, value);
  });
  return request.query(queryText);
}

module.exports = { sql, getPool, query, buildConfig };
