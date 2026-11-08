-- O projeto não tem vínculo com o poder público municipal.
-- Remove os status de encaminhamento, os campos de protocolo/previsão/data de envio
-- e o perfil de acesso externo. Os status passam a descrever só o que se vê na rua.

-- Status antigos → novos
UPDATE pontos SET status = 'reportado'   WHERE status = 'enviado';
UPDATE pontos SET status = 'sem_asfalto' WHERE status IN ('pedido_feito', 'previsto_orcamento');
UPDATE historico SET de_status = 'reportado'     WHERE de_status = 'enviado';
UPDATE historico SET para_status = 'reportado'   WHERE para_status = 'enviado';
UPDATE historico SET de_status = 'sem_asfalto'   WHERE de_status IN ('pedido_feito', 'previsto_orcamento');
UPDATE historico SET para_status = 'sem_asfalto' WHERE para_status IN ('pedido_feito', 'previsto_orcamento');
UPDATE historico SET detalhes = detalhes - 'protocolo' - 'previsao' WHERE detalhes IS NOT NULL;

-- Campos removidos (a view depende deles)
DROP VIEW pontos_resumo;
ALTER TABLE pontos DROP COLUMN protocolo, DROP COLUMN previsao, DROP COLUMN enviado_em;

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

-- Só existe o perfil de administração. Contas do perfil antigo são desativadas (nunca promovidas).
UPDATE usuarios SET ativo = false WHERE perfil <> 'admin';
DELETE FROM usuarios u
 WHERE perfil <> 'admin'
   AND NOT EXISTS (SELECT 1 FROM historico h WHERE h.usuario_id = u.id);
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
UPDATE usuarios SET perfil = 'desativado' WHERE perfil <> 'admin';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin', 'desativado'));
