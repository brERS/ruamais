-- Ruas e lugares do OpenStreetMap, guardados localmente: o nome da rua é calculado aqui,
-- sem enviar a localização de ninguém para serviços de fora.

CREATE TABLE vias (
  id    serial PRIMARY KEY,
  nome  text NOT NULL,
  tipo  text,
  geom  geometry(LineString, 4326) NOT NULL
);
CREATE INDEX vias_geom_idx ON vias USING gist (geom);

CREATE TABLE lugares (
  id    serial PRIMARY KEY,
  nome  text NOT NULL,
  tipo  text,
  geom  geometry(Point, 4326) NOT NULL
);

-- Origem do contorno: 'importado' (arquivo enviado pela administração) ou 'osm-aproximado'.
ALTER TABLE bairros ADD COLUMN fonte text NOT NULL DEFAULT 'importado';

DROP VIEW pontos_resumo;
CREATE VIEW pontos_resumo AS
SELECT p.id, p.tipo, p.atributos, p.status, p.resolvido_em,
       p.removido, p.removido_em, p.motivo_remocao,
       p.codigo_criador, p.criado_em, p.atualizado_em, p.geom,
       ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       v.confirmacoes, v.negacoes, v.contestacoes,
       CASE
         WHEN v.negacoes >= 3 AND v.negacoes > v.confirmacoes THEN 'em_verificacao'
         WHEN v.confirmacoes >= 3 THEN 'confirmado'
         ELSE 'nao_confirmado'
       END AS verificacao,
       b.nome AS bairro,
       CASE WHEN ST_DWithin(r.geom::geography, p.geom::geography, 80) THEN r.nome END AS rua
FROM pontos p
CROSS JOIN LATERAL (
  SELECT count(*) FILTER (WHERE vt.tipo = 'confirma')::int AS confirmacoes,
         count(*) FILTER (WHERE vt.tipo = 'nega')::int     AS negacoes,
         count(*) FILTER (WHERE vt.tipo = 'contesta'
                            AND vt.criado_em > COALESCE(p.resolvido_em, '-infinity'::timestamptz))::int AS contestacoes
  FROM votos vt WHERE vt.ponto_id = p.id
) v
LEFT JOIN LATERAL (
  SELECT bb.nome FROM bairros bb WHERE ST_Contains(bb.geom, p.geom) ORDER BY bb.id LIMIT 1
) b ON true
LEFT JOIN LATERAL (
  SELECT vv.nome, vv.geom FROM vias vv ORDER BY vv.geom <-> p.geom LIMIT 1
) r ON true;
