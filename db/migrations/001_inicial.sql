CREATE EXTENSION IF NOT EXISTS postgis;

-- Módulo Usuários e perfis: só prefeitura e administrador. O público não tem login.
CREATE TABLE usuarios (
  id          serial PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  nome        text NOT NULL,
  senha_hash  text NOT NULL,
  perfil      text NOT NULL CHECK (perfil IN ('prefeitura', 'admin')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Contorno dos bairros (importado depois via painel do administrador).
CREATE TABLE bairros (
  id    serial PRIMARY KEY,
  nome  text NOT NULL,
  geom  geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX bairros_geom_idx ON bairros USING gist (geom);

-- Módulo Pontos. Grava-se o local do problema, nunca a localização da pessoa.
CREATE TABLE pontos (
  id              serial PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN ('buraco', 'rua_sem_asfalto')),
  geom            geometry(Point, 4326) NOT NULL,
  atributos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL,
  protocolo       text,
  previsao        date,
  enviado_em      timestamptz,
  resolvido_em    timestamptz,
  -- Nada é apagado de vez: remoção é uma marcação reversível.
  removido        boolean NOT NULL DEFAULT false,
  removido_em     timestamptz,
  motivo_remocao  text CHECK (motivo_remocao IN ('falso', 'resolvido', 'duplicado')),
  codigo_criador  uuid NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pontos_geom_idx ON pontos USING gist (geom);
CREATE INDEX pontos_geog_idx ON pontos USING gist ((geom::geography));

-- Módulo Votos: confirmações, negações e contestações ligadas ao código aleatório.
CREATE TABLE votos (
  id         bigserial PRIMARY KEY,
  ponto_id   integer NOT NULL REFERENCES pontos (id),
  tipo       text NOT NULL CHECK (tipo IN ('confirma', 'nega', 'contesta')),
  codigo     uuid NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX votos_ponto_idx ON votos (ponto_id);
CREATE INDEX votos_codigo_idx ON votos (codigo, criado_em);

-- Módulo Histórico: toda mudança, com autor e data (auditoria).
CREATE TABLE historico (
  id           bigserial PRIMARY KEY,
  ponto_id     integer NOT NULL REFERENCES pontos (id),
  acao         text NOT NULL,
  de_status    text,
  para_status  text,
  detalhes     jsonb,
  usuario_id   integer REFERENCES usuarios (id),
  codigo       uuid,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historico_ponto_idx ON historico (ponto_id, criado_em);

-- Resumo de cada ponto com contagem de votos e situação de verificação.
-- Regras: "confirmado" com 3+ confirmações; "em_verificacao" com 3+ negações e mais negações que confirmações.
-- Contestações só contam depois da última marcação de resolvido.
CREATE VIEW pontos_resumo AS
SELECT p.id, p.tipo, p.atributos, p.status, p.protocolo, p.previsao,
       p.enviado_em, p.resolvido_em, p.removido, p.removido_em, p.motivo_remocao,
       p.codigo_criador, p.criado_em, p.atualizado_em, p.geom,
       ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng,
       v.confirmacoes, v.negacoes, v.contestacoes,
       CASE
         WHEN v.negacoes >= 3 AND v.negacoes > v.confirmacoes THEN 'em_verificacao'
         WHEN v.confirmacoes >= 3 THEN 'confirmado'
         ELSE 'nao_confirmado'
       END AS verificacao,
       b.nome AS bairro
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
) b ON true;
