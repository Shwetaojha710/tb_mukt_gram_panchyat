const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const app = require('./src/app');
const { getPool } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await getPool();
    console.log('MSSQL connection pool ready');
  } catch (err) {
    console.warn('MSSQL not available yet:', err.message);
    console.warn('Set MSSQL_PASSWORD in .env and run npm run init-db');
  }

  app.listen(PORT, () => {
    console.log(`TB Mukt UP API listening on port ${PORT}`);
  });
}

start();
