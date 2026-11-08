const db = require('../../db');
const D = require('../../dominio');
const { HttpError } = require('../../http');

function filtros({ tipo, situacao, dias }) {
  const where = ["NOT removido", "verificacao = 'confirmado'"];
  const vals = [];
  if (tipo) {
    if (!D.TIPOS[tipo]) throw new HttpError(400, 'Tipo inválido');
    vals.push(tipo);
    where.push(`tipo = $${vals.length}`);
  }
  if (situacao === 'abertos') where.push("status NOT IN ('resolvido', 'pavimentada')");
  else if (situacao === 'resolvidos') where.push("status IN ('resolvido', 'pavimentada')");
  const d = Number(dias);
  if (d > 0) {
    vals.push(Math.min(d, 3650));
    where.push(`criado_em >= now() - make_interval(days => $${vals.length}::int)`);
  }
  return { where: where.join(' AND '), vals };
}

// Só pontos confirmados, com peso pela gravidade.
async function calor(q) {
  const { where, vals } = filtros(q);
  const { rows } = await db.query(`SELECT tipo, atributos, lat, lng FROM pontos_resumo WHERE ${where}`, vals);
  return rows.map((p) => [p.lat, p.lng, D.gravidade(p.tipo, p.atributos)]);
}

// Bairros pintados + ranking com tempo de espera (dias desde a marcação até a solução, ou até hoje).
async function bairros(q) {
  const { where, vals } = filtros({ ...q, situacao: undefined });
  const { rows: pts } = await db.query(
    `SELECT tipo, atributos, status, bairro,
            EXTRACT(EPOCH FROM (COALESCE(resolvido_em, now()) - criado_em)) / 86400 AS espera_dias,
            resolvido_em IS NOT NULL AS resolvido
       FROM pontos_resumo WHERE ${where}`,
    vals
  );
  const { rows: bs } = await db.query('SELECT id, nome, fonte, ST_AsGeoJSON(geom, 5)::json AS geometria FROM bairros ORDER BY nome');

  const porNome = new Map();
  const novo = (nome) => ({ nome, abertos: 0, resolvidos: 0, peso_aberto: 0, esperas_abertas: [], esperas_resolvidas: [] });
  for (const b of bs) porNome.set(b.nome, novo(b.nome));
  for (const p of pts) {
    const nome = p.bairro || 'Sem bairro definido';
    if (!porNome.has(nome)) porNome.set(nome, novo(nome));
    const s = porNome.get(nome);
    const final = D.ehFinal(p.tipo, p.status);
    if (final) s.resolvidos++;
    else {
      s.abertos++;
      s.peso_aberto += D.gravidade(p.tipo, p.atributos);
    }
    if (p.espera_dias != null) (final ? s.esperas_resolvidas : s.esperas_abertas).push(Number(p.espera_dias));
  }

  const media = (xs) => (xs.length ? Math.round((xs.reduce((x, y) => x + y, 0) / xs.length) * 10) / 10 : null);
  const ranking = [...porNome.values()]
    .map((s) => ({
      nome: s.nome,
      abertos: s.abertos,
      resolvidos: s.resolvidos,
      peso_aberto: Math.round(s.peso_aberto * 10) / 10,
      espera_media_abertos_dias: media(s.esperas_abertas),
      espera_media_resolvidos_dias: media(s.esperas_resolvidas),
    }))
    .sort((x, y) => y.peso_aberto - x.peso_aberto || x.nome.localeCompare(y.nome));

  const porBairro = new Map(ranking.map((r) => [r.nome, r]));
  const geojson = {
    type: 'FeatureCollection',
    features: bs.map((b) => ({ type: 'Feature', id: b.id, geometry: b.geometria, properties: porBairro.get(b.nome) })),
  };
  return {
    ranking,
    geojson,
    tem_contornos: bs.length > 0,
    aproximado: bs.some((b) => b.fonte === 'osm-aproximado'),
  };
}

module.exports = { calor, bairros };
