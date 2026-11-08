// Observação de comportamento (sinais de abuso). Nenhum limite é aplicado: só se mostra.
const express = require('express');
const db = require('../../db');
const { a } = require('../../http');
const { exigirPerfil } = require('../../auth');

const r = express.Router();

r.get('/admin/atividade', exigirPerfil('admin'), a(async (req, res) => {
  // Códigos mais ativos nas últimas 24 h (mostrados abreviados).
  const { rows: codigos } = await db.query(`
    WITH acoes AS (
      SELECT codigo, 'voto' AS tipo, criado_em FROM votos WHERE criado_em > now() - interval '24 hours'
      UNION ALL
      SELECT codigo_criador, 'ponto', criado_em FROM pontos WHERE criado_em > now() - interval '24 hours'
    )
    SELECT left(codigo::text, 8) AS codigo,
           count(*) FILTER (WHERE tipo = 'ponto')::int AS pontos,
           count(*) FILTER (WHERE tipo = 'voto')::int AS votos,
           min(criado_em) AS primeira, max(criado_em) AS ultima
      FROM acoes GROUP BY codigo ORDER BY count(*) DESC LIMIT 20`);

  // Rajadas: 3+ votos no mesmo ponto em menos de 1 minuto (últimos 7 dias).
  const { rows: rajadas } = await db.query(`
    SELECT ponto_id, tipo, count(*)::int AS votos, min(criado_em) AS inicio,
           count(DISTINCT codigo)::int AS codigos
      FROM votos WHERE criado_em > now() - interval '7 days'
     GROUP BY ponto_id, tipo, date_trunc('minute', criado_em)
    HAVING count(*) >= 3 ORDER BY inicio DESC LIMIT 50`);

  const { rows: [totais] } = await db.query(`
    SELECT (SELECT count(*) FROM pontos)::int AS pontos,
           (SELECT count(*) FROM votos)::int AS votos,
           (SELECT count(DISTINCT codigo) FROM votos WHERE criado_em > now() - interval '30 days')::int AS codigos_30d`);

  // Indicadores por semana (últimas 12): para avaliar se o projeto está pegando.
  // "Voltaram" = códigos ativos na semana que já tinham participado em semanas anteriores.
  const { rows: semanas } = await db.query(`
    WITH acoes AS (
      SELECT codigo, criado_em FROM votos
      UNION ALL SELECT codigo_criador, criado_em FROM pontos
    ),
    sem AS (SELECT DISTINCT date_trunc('week', criado_em) AS s, codigo FROM acoes),
    primeira AS (SELECT codigo, min(s) AS p FROM sem GROUP BY codigo),
    grade AS (SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS s)
    SELECT g.s::date AS semana,
           (SELECT count(*) FROM pontos WHERE date_trunc('week', criado_em) = g.s)::int AS novos,
           (SELECT count(*) FROM votos WHERE date_trunc('week', criado_em) = g.s)::int AS votos,
           (SELECT count(*) FROM pontos WHERE date_trunc('week', resolvido_em) = g.s)::int AS resolvidos,
           (SELECT count(*) FROM sem WHERE sem.s = g.s)::int AS participantes,
           (SELECT count(*) FROM sem JOIN primeira USING (codigo) WHERE sem.s = g.s AND primeira.p < g.s)::int AS voltaram
      FROM grade g ORDER BY g.s DESC`);

  res.json({ totais, codigos, rajadas, semanas });
}));

module.exports = r;
