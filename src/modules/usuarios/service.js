const bcrypt = require('bcryptjs');
const db = require('../../db');
const { HttpError } = require('../../http');

const PERFIS = ['admin'];
const COLS = 'id, email, nome, perfil, ativo, criado_em';
let HASH_FICTICIO = null;

function normalizarEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function validarSenha(s) {
  if (typeof s !== 'string' || s.length < 10) throw new HttpError(400, 'A senha precisa ter pelo menos 10 caracteres');
}

// Cria o primeiro administrador a partir das variáveis de ambiente, se ainda não houver nenhum.
async function garantirAdmin() {
  const { rows } = await db.query("SELECT 1 FROM usuarios WHERE perfil = 'admin' LIMIT 1");
  if (rows.length) return;
  const email = normalizarEmail(process.env.ADMIN_EMAIL);
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) {
    console.warn('Nenhum administrador cadastrado. Defina ADMIN_EMAIL e ADMIN_SENHA para criar o primeiro.');
    return;
  }
  await db.query(
    "INSERT INTO usuarios (email, nome, senha_hash, perfil) VALUES ($1, 'Administrador', $2, 'admin')",
    [email, await bcrypt.hash(senha, 12)]
  );
  console.log(`Administrador inicial criado: ${email}`);
}

async function autenticar(email, senha) {
  const { rows } = await db.query('SELECT * FROM usuarios WHERE email = $1 AND ativo', [normalizarEmail(email)]);
  const u = rows[0];
  // Compara mesmo quando o usuário não existe, para não revelar quais e-mails existem pelo tempo de resposta.
  if (!HASH_FICTICIO) HASH_FICTICIO = await bcrypt.hash('senha-ficticia', 12);
  const hash = u ? u.senha_hash : HASH_FICTICIO;
  const ok = await bcrypt.compare(String(senha || ''), hash);
  if (!u || !ok) return null;
  return { id: u.id, email: u.email, nome: u.nome, perfil: u.perfil };
}

async function obterAtivo(id) {
  const { rows } = await db.query(`SELECT ${COLS} FROM usuarios WHERE id = $1 AND ativo`, [id]);
  return rows[0] || null;
}

async function listar() {
  const { rows } = await db.query(`SELECT ${COLS} FROM usuarios ORDER BY perfil, nome`);
  return rows;
}

async function criar({ email, nome, senha, perfil = 'admin' }) {
  email = normalizarEmail(email);
  nome = String(nome || '').trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'E-mail inválido');
  if (!nome) throw new HttpError(400, 'Informe o nome');
  if (!PERFIS.includes(perfil)) throw new HttpError(400, 'Perfil inválido');
  validarSenha(senha);
  try {
    const { rows } = await db.query(
      `INSERT INTO usuarios (email, nome, senha_hash, perfil) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
      [email, nome, await bcrypt.hash(senha, 12), perfil]
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe uma conta com este e-mail');
    throw e;
  }
}

async function atualizar(id, { ativo, senha }, autorId) {
  if (ativo === false && Number(id) === autorId) throw new HttpError(400, 'Você não pode desativar a própria conta');
  if (ativo !== undefined) {
    await db.query('UPDATE usuarios SET ativo = $2 WHERE id = $1', [id, !!ativo]);
  }
  if (senha !== undefined) {
    validarSenha(senha);
    await db.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [id, await bcrypt.hash(senha, 12)]);
  }
  const { rows } = await db.query(`SELECT ${COLS} FROM usuarios WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Usuário não encontrado');
  return rows[0];
}

module.exports = { garantirAdmin, autenticar, obterAtivo, listar, criar, atualizar };
