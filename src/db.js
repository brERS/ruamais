const { Pool, types } = require('pg');

// Datas (DATE) voltam como texto 'AAAA-MM-DD', sem conversão de fuso.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { pool, query: (t, p) => pool.query(t, p), tx };
