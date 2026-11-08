const fs = require('fs');
const path = require('path');
const db = require('./db');

const DIR = path.join(__dirname, '..', 'db', 'migrations');

async function esperarBanco(tentativas = 30) {
  for (let i = 1; ; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (e) {
      if (i >= tentativas) throw e;
      console.log(`Aguardando banco (${i})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function migrar() {
  await esperarBanco();
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())'
  );
  const { rows } = await db.query('SELECT nome FROM schema_migrations');
  const feitas = new Set(rows.map((r) => r.nome));
  const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of arquivos) {
    if (feitas.has(f)) continue;
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    await db.tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [f]);
    });
    console.log(`Migração aplicada: ${f}`);
  }
}

module.exports = { migrar };
