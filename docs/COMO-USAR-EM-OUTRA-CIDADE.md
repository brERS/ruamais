# Como usar o RuaMais na sua cidade

O RuaMais funciona para **qualquer município brasileiro**. Cada instalação atende **uma cidade**: o mapa fica restrito ao contorno oficial do município, e os textos do site mostram o nome dela.

O projeto já vem com uma cidade de exemplo, **Resende/RJ** (escolhida só como exemplo, sem relação com o projeto). Para a sua cidade, você mesmo baixa os dados com um script, em poucos minutos. O projeto não traz os dados de todas as cidades, para continuar leve.

---

## O que você vai precisar

- **Docker Desktop** instalado e rodando ([docker.com](https://www.docker.com/products/docker-desktop/)).
- O **código IBGE** do seu município: 7 dígitos.
  - Consulte em [ibge.gov.br/explica/codigos-dos-municipios.php](https://www.ibge.gov.br/explica/codigos-dos-municipios.php).
  - Exemplos: Resende/RJ = `3304201`, Lages/SC = `4209300`, Garanhuns/PE = `2606002`.
- Internet, só durante a preparação, para baixar os dados.

---

## Passo a passo

Os comandos abaixo são executados num terminal **dentro da pasta do projeto**. No Windows, use o PowerShell ou o terminal do VS Code.

### 1. Configure o `.env`

Se ainda não fez:

```sh
cp .env.example .env
```

Abra o `.env` e troque pelo menos:

- `JWT_SEGREDO`: uma sequência aleatória longa. Pode gerar com `openssl rand -hex 32`.
- `ADMIN_EMAIL` e `ADMIN_SENHA`: o primeiro acesso ao painel. A senha precisa ter no mínimo 10 caracteres.

### 2. Construa a imagem do projeto

```sh
docker compose build
```

### 3. Baixe os dados da sua cidade

Troque `0000000` pelo código IBGE do seu município:

```sh
docker compose run --rm --no-deps -v "${PWD}:/projeto" app node /projeto/scripts/preparar-cidade.js 0000000
```

> **Windows (PowerShell):** o comando acima funciona como está.
> **Windows (Prompt de Comando, cmd):** troque `${PWD}` por `%cd%`.
> **Git Bash:** use `-v "$(pwd -W):/projeto"` e coloque `MSYS_NO_PATHCONV=1` antes do comando.

O script mostra algo assim:

```
Município: Resende/RJ (3304201) → cidades/resende-rj/
Contorno: 1118 vértices.
OpenStreetMap: 1716 ruas com nome, 56 bairros/distritos.
Centro: -22.468363, -44.446349 (sede no OpenStreetMap)

Pronto. Para usar esta cidade, coloque no .env:  CIDADE=resende-rj
```

Ele cria a pasta `cidades/<sua-cidade>-<uf>/` com:

| Arquivo | O que é | Fonte |
|---|---|---|
| `cidade.json` | Nome, UF, código, centro e zoom inicial do mapa | IBGE e OpenStreetMap |
| `limite.geojson` | Contorno oficial do município: só são aceitos pontos dentro dele | IBGE (malha municipal) |
| `osm.json` | Ruas com nome e bairros/distritos: dão o nome da rua de cada ponto e as regiões do mapa de calor | OpenStreetMap |

### 4. Escolha a cidade no `.env`

Use o nome que o script mostrou no final:

```
CIDADE=resende-rj
```

### 5. Suba o site

```sh
docker compose up -d
```

Abra **http://localhost:3000**. Na primeira inicialização, o sistema carrega as ruas no banco e gera as regiões aproximadas; isso leva alguns segundos. Para acompanhar:

```sh
docker compose logs app
```

---

## Ajustes opcionais

Edite `cidades/<sua-cidade>/cidade.json`:

- **`centro`**: `[latitude, longitude]` onde o mapa abre. Se o script avisar "meio do contorno — ajuste se precisar", troque pelo centro da cidade. No Google Maps, clique com o botão direito no local e copie as coordenadas.
- **`zoom`**: aproximação inicial. 13 mostra uma área maior, 15 mostra uma área menor.

Depois de editar: `docker compose restart app`.

**Contornos oficiais de bairros:** se a prefeitura ou o IBGE tiver os limites dos bairros em GeoJSON, importe-os no painel (`/admin`, aba "Bairros"). Eles substituem as regiões aproximadas.

---

## Perguntas frequentes

**Posso atender duas cidades no mesmo servidor?**
Sim, mas como **duas instalações separadas**, cada uma com o seu banco de dados. Por segurança, o sistema **se recusa a trocar a cidade** de um banco que já tem pontos marcados, para não misturar dados.

**Errei a cidade antes de marcar qualquer ponto. E agora?**
Basta trocar o `CIDADE` no `.env` e reiniciar (`docker compose restart app`). Com o banco ainda sem pontos, o sistema troca os dados geográficos sozinho.

**Os dados das ruas ficam desatualizados?**
Eles são uma "foto" do OpenStreetMap no dia em que você rodou o script. Para atualizar, rode o script de novo para a mesma cidade, apague as tabelas `vias`, `lugares` e as regiões `osm-aproximado` (ou use um banco novo) e reinicie.

**Algumas ruas aparecem sem nome, ou com nome errado.**
O nome vem do OpenStreetMap, um mapa colaborativo. Você pode corrigir ou completar em [openstreetmap.org](https://www.openstreetmap.org); é gratuito e todo mundo ganha. Depois, rode o script de novo.

**O script deu erro ao baixar do OpenStreetMap.**
O servidor público de consultas (Overpass) às vezes fica sobrecarregado. Espere alguns minutos e tente de novo.

**Preciso citar as fontes?**
Sim. O mapa e os nomes de ruas vêm do OpenStreetMap (licença ODbL), e o site já mostra o crédito no canto do mapa. O contorno vem do IBGE, que é dado público.

---

## Antes de abrir para o público

- Troque o servidor do mapa de fundo (`TILE_URL` no `.env`). Os servidores oficiais do OpenStreetMap não permitem uso intenso.
- Use HTTPS e `COOKIE_SEGURO=true`.
- Revise a **regra de neutralidade** e o **aviso de privacidade** em `public/privacidade.html`.
- Veja as demais recomendações no [README](../README.md).
