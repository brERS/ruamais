const db = require('../../db');
const D = require('../../dominio');
const cidade = require('../../cidade');
const historico = require('../historico/service');
const { HttpError } = require('../../http');

// Nunca expor codigo_criador: é a única ligação com o navegador de quem reportou.
const COLS = `id, tipo, atributos, status, resolvido_em,
  removido, removido_em, motivo_remocao, criado_em, atualizado_em, lat, lng,
  confirmacoes, negacoes, contestacoes, verificacao, bairro, rua`;

function formatar(p) {
  return {
    ...p,
    rotulo_tipo: D.TIPOS[p.tipo],
    rotulo_status: D.rotuloStatus(p.tipo, p.status),
    gravidade: D.gravidade(p.tipo, p.atributos),
    final: D.ehFinal(p.tipo, p.status),
  };
}

function numero(v, nome) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) throw new HttpError(400, `${nome} inválida`);
  return n;
}

function validarLocal(lat, lng) {
  lat = numero(lat, 'Latitude');
  lng = numero(lng, 'Longitude');
  if (!cidade.dentro(lat, lng)) {
    throw new HttpError(400, `O local marcado fica fora do município de ${cidade.nome}`);
  }
  return { lat, lng };
}

async function listar({ incluirRemovidos = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM pontos_resumo WHERE ($1 OR NOT removido) ORDER BY id`,
    [incluirRemovidos]
  );
  return rows.map(formatar);
}

// Listas de trabalho da administração.
const LISTAS = {
  conferencia: "NOT removido AND verificacao = 'confirmado' AND status IN ('reportado', 'sem_asfalto')",
  verificacao: "NOT removido AND verificacao = 'em_verificacao'",
  contestados: "NOT removido AND contestacoes > 0 AND status IN ('resolvido', 'pavimentada')",
  andamento: `NOT removido AND status NOT IN ('reportado', 'sem_asfalto', 'resolvido', 'pavimentada')`,
  todos: 'NOT removido',
  removidos: 'removido',
};

async function listarTrabalho(lista) {
  const where = LISTAS[lista];
  if (!where) throw new HttpError(400, 'Lista inválida');
  const { rows } = await db.query(`SELECT ${COLS} FROM pontos_resumo WHERE ${where}`);
  return rows
    .map(formatar)
    .sort((x, y) => y.gravidade - x.gravidade || y.confirmacoes - x.confirmacoes || x.id - y.id);
}

async function obter(id, { staff = false } = {}) {
  const { rows } = await db.query(`SELECT ${COLS} FROM pontos_resumo WHERE id = $1`, [id]);
  const p = rows[0];
  if (!p || (p.removido && !staff)) throw new HttpError(404, 'Ponto não encontrado');
  return { ...formatar(p), historico: await historico.listar(id, { staff }) };
}

async function obterSimples(id) {
  const { rows } = await db.query(`SELECT ${COLS} FROM pontos_resumo WHERE id = $1`, [id]);
  return rows[0] ? formatar(rows[0]) : null;
}

async function proximos(lat, lng, raio = 30) {
  ({ lat, lng } = { lat: numero(lat, 'Latitude'), lng: numero(lng, 'Longitude') });
  raio = Math.min(Math.max(Number(raio) || 30, 5), 200);
  const { rows } = await db.query(
    `SELECT ${COLS},
            ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distancia
       FROM pontos_resumo
      WHERE NOT removido
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
      ORDER BY distancia LIMIT 5`,
    [lat, lng, raio]
  );
  return rows.map((p) => ({ ...formatar(p), distancia: Math.round(p.distancia) }));
}

async function criar({ tipo, lat, lng, atributos }, codigo) {
  if (!D.TIPOS[tipo]) throw new HttpError(400, 'Tipo inválido');
  const local = validarLocal(lat, lng);
  let at;
  try {
    at = D.validarAtributos(tipo, atributos);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const id = await db.tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO pontos (tipo, geom, atributos, status, codigo_criador)
       VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5, $6) RETURNING id`,
      [tipo, local.lat, local.lng, at, D.STATUS_INICIAL[tipo], codigo]
    );
    await historico.registrar(c, {
      pontoId: rows[0].id, acao: 'criado', paraStatus: D.STATUS_INICIAL[tipo], codigo,
    });
    return rows[0].id;
  });
  return obter(id);
}

function textoCurto(v, max, nome) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || v.trim().length > max) throw new HttpError(400, `${nome} inválido (máx. ${max} caracteres)`);
  return v.trim();
}

// Só administração. A nota é interna e não aparece no site público.
async function alterarStatus(id, entrada, usuario) {
  const nota = textoCurto(entrada.nota, 500, 'Nota');

  await db.tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM pontos WHERE id = $1 FOR UPDATE', [id]);
    const p = rows[0];
    if (!p) throw new HttpError(404, 'Ponto não encontrado');
    if (p.removido) throw new HttpError(409, 'Ponto removido. Restaure antes de alterar.');

    const novo = entrada.status || p.status;
    if (!D.statusValido(p.tipo, novo)) throw new HttpError(400, 'Status inválido para este tipo');

    const sets = ['status = $2', 'atualizado_em = now()'];
    if (D.ehFinal(p.tipo, novo) && !D.ehFinal(p.tipo, p.status)) sets.push('resolvido_em = now()');
    if (!D.ehFinal(p.tipo, novo) && D.ehFinal(p.tipo, p.status)) sets.push('resolvido_em = NULL');
    await c.query(`UPDATE pontos SET ${sets.join(', ')} WHERE id = $1`, [id, novo]);

    const detalhes = {};
    if (nota) detalhes.nota = nota;
    await historico.registrar(c, {
      pontoId: id,
      acao: novo !== p.status ? 'status' : 'dados',
      deStatus: p.status,
      paraStatus: novo,
      detalhes,
      usuarioId: usuario.id,
    });
  });
  return obter(id, { staff: true });
}

async function remover(id, motivo, usuario) {
  if (!D.MOTIVOS_REMOCAO[motivo]) throw new HttpError(400, 'Motivo inválido');
  await db.tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE pontos SET removido = true, removido_em = now(), motivo_remocao = $2, atualizado_em = now()
        WHERE id = $1 AND NOT removido`,
      [id, motivo]
    );
    if (!rowCount) throw new HttpError(409, 'Ponto não encontrado ou já removido');
    await historico.registrar(c, { pontoId: id, acao: 'removido', detalhes: { motivo }, usuarioId: usuario.id });
  });
  return obter(id, { staff: true });
}

async function restaurar(id, usuario) {
  await db.tx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE pontos SET removido = false, removido_em = NULL, motivo_remocao = NULL, atualizado_em = now()
        WHERE id = $1 AND removido`,
      [id]
    );
    if (!rowCount) throw new HttpError(409, 'Ponto não encontrado ou não está removido');
    await historico.registrar(c, { pontoId: id, acao: 'restaurado', usuarioId: usuario.id });
  });
  return obter(id, { staff: true });
}

module.exports = {
  listar, listarTrabalho, obter, obterSimples, proximos, criar, alterarStatus, remover, restaurar,
};
