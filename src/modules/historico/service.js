const db = require('../../db');

const ROTULO_PERFIL = { admin: 'Administração', desativado: 'Administração' };

// Registra uma mudança. Aceita um cliente de transação para gravar junto com a alteração.
async function registrar(cliente, { pontoId, acao, deStatus = null, paraStatus = null, detalhes = null, usuarioId = null, codigo = null }) {
  await (cliente || db).query(
    `INSERT INTO historico (ponto_id, acao, de_status, para_status, detalhes, usuario_id, codigo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [pontoId, acao, deStatus, paraStatus, detalhes, usuarioId, codigo]
  );
}

// Versão pública: sem códigos, sem nomes de servidores e sem notas internas.
async function listar(pontoId, { staff = false } = {}) {
  const { rows } = await db.query(
    `SELECT h.acao, h.de_status, h.para_status, h.detalhes, h.criado_em, u.nome, u.perfil
       FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.ponto_id = $1 ORDER BY h.criado_em, h.id`,
    [pontoId]
  );
  return rows.map((r) => {
    const d = r.detalhes || {};
    let autor = 'Morador';
    if (r.perfil) autor = staff ? `${r.nome} (${ROTULO_PERFIL[r.perfil]})` : ROTULO_PERFIL[r.perfil];
    return {
      acao: r.acao,
      de_status: r.de_status,
      para_status: r.para_status,
      criado_em: r.criado_em,
      autor,
      detalhes: staff ? d : { motivo: d.motivo },
    };
  });
}

module.exports = { registrar, listar };
