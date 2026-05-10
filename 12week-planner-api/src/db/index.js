const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

pool.on('error', (err) => {
  console.error('PostgreSQL 連線錯誤:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
