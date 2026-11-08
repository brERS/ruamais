const db = require('../../db');
const D = require('../../dominio');
const pontos = require('../pontos/service');
const { HttpError } = require('../../http');

// Sem limites ativados no início (decisão do projeto): só registra código, data e hora.
async function votar(pontoId, tipo, codigo) {
  if (!D.TIPOS_VOTO.includes(tipo)) throw new HttpError(400, 'Voto inválido');
  const p = await pontos.obterSimples(pontoId);
  if (!p || p.removido) throw new HttpError(404, 'Ponto não encontrado');
  if (tipo === 'contesta' && !p.final) {
    throw new HttpError(400, 'Só é possível contestar pontos marcados como resolvidos');
  }
  await db.query('INSERT INTO votos (ponto_id, tipo, codigo) VALUES ($1, $2, $3)', [pontoId, tipo, codigo]);
  return pontos.obter(pontoId);
}

module.exports = { votar };
