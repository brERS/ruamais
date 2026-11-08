# RuaMais — o mapa das ruas da sua cidade

Mapa colaborativo onde moradores marcam **buracos** e **ruas sem asfalto**, confirmam o que outras pessoas marcaram e acompanham o que foi resolvido. Funciona para **qualquer município brasileiro**.

**Quer usar na sua cidade?** Siga o guia [docs/COMO-USAR-EM-OUTRA-CIDADE.md](docs/COMO-USAR-EM-OUTRA-CIDADE.md): basta o código IBGE do município e um comando.

## Por que este projeto existe

Buraco na rua e rua de terra fazem parte do dia a dia de muita gente: carro quebrado, pedestre que cai, ônibus que não entra no bairro, ambulância que demora, lama na porta da escola. As reclamações já existem, mas ficam espalhadas em grupos de WhatsApp e comentários de redes sociais, e se perdem.

O RuaMais junta tudo num **mapa público**. Ele mostra onde estão os problemas, quantas pessoas confirmam cada um e há quanto tempo estão abertos. Com isso, o que era reclamação solta vira **registro coletivo**, que serve para:

- mostrar com dados onde a situação é pior;
- acompanhar se e quando os problemas são resolvidos;
- dar base a moradores, imprensa e qualquer pessoa que queira cobrar soluções pelos canais oficiais.

## O que ele é, e o que não é

| É | Não é |
|---|---|
| Uma ferramenta independente, feita por moradores | Um canal oficial de nenhum órgão público |
| Um registro público, com histórico e dados abertos | Um serviço que conserta ruas ou garante atendimento |
| Gratuito, sem anúncios e sem coleta de dados pessoais | Um substituto dos protocolos oficiais de reclamação |
| Neutro | Ferramenta de partido, candidato ou governo |

## Princípios

Quem usar este projeto, em qualquer cidade, deve manter estes princípios:

- **Neutralidade política.** Não apoia nem ataca partido, candidato, político ou governo; não aceita logo nem propaganda; vale igual em época de eleição. Veja a regra completa em [public/privacidade.html](public/privacidade.html).
- **Privacidade.** Não pede nome, e-mail nem telefone. Não tem fotos nem texto livre, para evitar exposição de pessoas e conteúdo impróprio. Não usa rastreadores. O GPS só centraliza o mapa; a localização de quem usa nunca é gravada.
- **Sem dinheiro.** Não aceita doação, patrocínio nem anúncio.
- **Transparência.** Nada é apagado de vez: remoções ficam registradas, com data e motivo, e podem ser desfeitas. Toda mudança de situação fica no histórico. Os dados ficam abertos para todos, igualmente.
- **Para todo mundo.** Pensado para celular simples e para pessoas idosas: botões grandes, poucas etapas, letra maior opcional, alternativa em lista para quem usa leitor de tela.

## Como ele gera resultado

O site sozinho não conserta nada. O resultado vem do uso:

1. Moradores marcam e confirmam. Com 3 confirmações, o ponto passa a contar como confirmado.
2. O **relatório mensal** (`/relatorio`) resume os casos mais confirmados, há quanto tempo estão abertos e as regiões mais afetadas, pronto para imprimir ou compartilhar.
3. Com esse registro, qualquer pessoa pode levar os casos aos canais oficiais por conta própria, como cidadão, e a comunidade e a imprensa podem acompanhar o que muda.
4. Quem marcou ou confirmou um ponto vê um aviso no site quando a situação dele muda.

Uma ressalva: mais pontos marcados não significa mais carência. Bairros com menos acesso à internet podem aparecer com menos pontos, e o site avisa isso nos relatórios.

## Rodar

Requisito: Docker Desktop.

```sh
cp .env.example .env        # ajuste JWT_SEGREDO (openssl rand -hex 32), ADMIN_EMAIL e ADMIN_SENHA
docker compose up -d --build
```

- Mapa público: http://localhost:3000
- Mapa de calor: http://localhost:3000/calor
- Relatório do mês (imprimir ou copiar resumo): http://localhost:3000/relatorio
- Painel da administração: http://localhost:3000/admin
- Privacidade e dados abertos: http://localhost:3000/privacidade

O primeiro administrador é criado a partir de `ADMIN_EMAIL`/`ADMIN_SENHA` quando ainda não existe nenhum. Outras contas de administração são criadas no painel, aba “Contas”.

A cidade atendida é definida por `CIDADE` no `.env`, que aponta para uma pasta em `cidades/`. Vem pronta só a cidade de exemplo, `resende-rj` (Resende/RJ, escolhida apenas como exemplo, sem relação com o projeto); outras são preparadas com `scripts/preparar-cidade.js` (ver o guia acima).

### Testar pelo celular na rede local

- Sem HTTPS: `http://<IP-do-PC>:3000`. Funciona tudo, menos o GPS ("Onde estou"), que os navegadores só liberam em HTTPS.
- Com HTTPS: defina `LAN_IP` no `.env` e rode `docker compose --profile https up -d`. Acesse `https://<IP-do-PC>:3443` e aceite o aviso de certificado (é gerado localmente pelo Caddy).

Depois de alterar arquivos em `src/`, reinicie: `docker compose restart app`. Arquivos em `public/` valem na hora.

### Demonstração estática (GitHub Pages, Netlify etc.)

Para apresentar a ideia sem servidor: uma versão só com pontos fictícios, que roda inteira no navegador (marcar, votar, lista, mapa de calor, relatório). Nada é salvo e não há painel.

```sh
docker compose up -d   # o servidor precisa estar rodando para gerar os dados fixos
docker compose run --rm --no-deps -v "<pasta do projeto>:/projeto" app node /projeto/scripts/gerar-demo.js
```

Publique **só o conteúdo de `demo-site/`** (nunca a pasta do projeto inteira: ela tem o `.env` com senhas).

Para apresentar sem internet de hospedagem (pendrive, pasta compactada), no Windows: clique duas vezes em `demo-site/abrir-demonstracao.cmd`. Ele abre um servidor só local (`http://localhost:8765`), necessário para o mapa de fundo do OpenStreetMap (aberto direto do arquivo, o navegador não informa a origem e o OpenStreetMap bloqueia as imagens). Abrindo o `index.html` direto, tudo funciona, mas sem o mapa de fundo.

### Dados geográficos

Cada cidade tem uma pasta em `cidades/<cidade>-<uf>/`:

- `cidade.json`: nome, UF, código IBGE, centro e zoom inicial.
- `limite.geojson`: limite oficial do município (IBGE). Só são aceitos pontos dentro dele.
- `osm.json`: ruas com nome e bairros/distritos do OpenStreetMap (© colaboradores do OpenStreetMap, ODbL). Carregado no banco na primeira inicialização; dá o nome da rua mais próxima (até 80 m) de cada ponto, gera **regiões aproximadas** quando não há contornos oficiais de bairro e define a área e os focos da simulação.

O banco guarda a cidade a que pertence (tabela `meta`) e se recusa a trocar de cidade se já houver pontos.

## Arquitetura

Monólito modular (Node.js 22 + Express, PostgreSQL 16 + PostGIS, Leaflet). Cada módulo em `src/modules/` tem suas rotas e um `service.js`; os módulos só se chamam pelos services.

| Módulo | Faz |
|---|---|
| `pontos` | Local, tipo, atributos (opções fixas), status, remoção reversível |
| `votos` | Confirmações, negações e contestações ligadas ao código aleatório |
| `usuarios` | Login e contas individuais (só administração; o público não tem login) |
| `historico` | Auditoria de toda mudança: quem, o quê e quando |
| `relatorios` | Mapa de calor, bairros pintados, ranking e tempo de espera |
| `bairros` | Importação de contornos em GeoJSON |
| `dados-abertos` | Exportação CSV/GeoJSON sem dados pessoais |
| `admin` | Observação de abuso (códigos mais ativos, rajadas de votos) |

Regras principais estão em [src/dominio.js](src/dominio.js) (opções, status, permissões, gravidade) e na view `pontos_resumo` em [db/migrations/001_inicial.sql](db/migrations/001_inicial.sql) (limiares de confirmação e verificação). Novas mudanças de banco entram como `db/migrations/002_...sql`, aplicadas ao iniciar.

## API

Público (cabeçalho `X-Codigo` com o código aleatório do navegador nas escritas):

- `GET /api/config`, `GET /api/pontos`, `GET /api/pontos/:id`, `GET /api/pontos/proximos?lat&lng&raio`
- `POST /api/pontos` `{tipo, lat, lng, atributos}`
- `POST /api/pontos/:id/votos` `{tipo: confirma|nega|contesta}`
- `GET /api/relatorios/calor`, `GET /api/relatorios/bairros` (`tipo`, `situacao`, `dias`)
- `GET /api/dados-abertos/pontos.csv`, `.geojson`

Com login: `PATCH /api/pontos/:id/status`, `POST /api/pontos/:id/remover|restaurar`, `GET /api/staff/pontos?lista=…`, `/api/usuarios`, `/api/bairros/importar`, `/api/admin/atividade` (admin).

## Antes de divulgar

- Trocar `TILE_URL`: os servidores oficiais do OpenStreetMap não permitem uso intenso. Opções com plano gratuito: MapTiler, Stadia Maps, Thunderforest, ou servir os próprios tiles.
- Rodar atrás de HTTPS (ex.: Caddy ou o proxy da hospedagem) e usar `COOKIE_SEGURO=true`.
- Trocar a senha do administrador e o `JWT_SEGREDO`.
- Fazer backup do volume do banco (`docker compose exec db pg_dump -U buracos buracos > backup.sql`).

## Licença

- **Código:** [GNU AGPL-3.0](LICENSE). Qualquer pessoa pode usar, copiar e adaptar, inclusive para outra cidade. Quem colocar no ar uma versão modificada precisa publicar o código dessa versão com a mesma licença, para que as melhorias fiquem disponíveis para todas as cidades.
- **Dados** (pontos exportados em `/api/dados-abertos`, ruas e bairros em `cidades/*/osm.json`): [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), a mesma licença do OpenStreetMap, de onde vêm os nomes de ruas e bairros (© colaboradores do OpenStreetMap). Os contornos dos municípios (`cidades/*/limite.geojson`) são dados públicos do IBGE.
- **Princípios:** neutralidade política, privacidade e não aceitar dinheiro (ver [Princípios](#princípios)) não fazem parte da licença, porque uma licença livre não pode restringir usos. São o compromisso deste projeto: o nome **RuaMais** deve ser usado só por instalações que mantenham esses princípios.
