// Gera a versão de demonstração estática (para GitHub Pages, Netlify Drop etc.) em ./demo-site.
// Precisa do servidor rodando (lê dele os dados fixos). Uso:
//   docker compose run --rm --no-deps -v "<pasta do projeto>:/projeto" app node /projeto/scripts/gerar-demo.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'public');
const DESTINO = path.join(RAIZ, 'demo-site');
const SERVIDOR = process.env.SERVIDOR || 'http://app:3000';

const PAGINAS = ['index.html', 'calor.html', 'relatorio.html', 'privacidade.html'];
const ARQUIVOS = ['estilo.css', 'comum.js', 'simulacao.js', 'app.js', 'calor.js', 'relatorio.js', 'icone.svg'];

async function json(caminho, opcoes) {
  const r = await fetch(SERVIDOR + caminho, opcoes);
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

// "/calor?x#y" → "./calor.html?x#y"; "/" → "./index.html"; "/estilo.css" → "./estilo.css"
function relativo(c) {
  const m = c.match(/^\/([a-z-]*)([?#].*)?$/);
  if (m) return `./${m[1] ? `${m[1]}.html` : 'index.html'}${m[2] || ''}`;
  return `.${c}`;
}

function transformarHtml(nome, html) {
  html = html.replace(/(href|src)="(\/[^"]*)"/g, (_, attr, c) => `${attr}="${relativo(c)}"`);
  // Carrega o substituto do servidor antes dos scripts do site.
  html = html.replace('<script src="./comum.js"></script>',
    '<script src="./dados.js"></script>\n  <script src="./demo.js"></script>\n  <script src="./comum.js"></script>');
  // Dados fictícios: não indexar em buscadores.
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex">');
  html = html.replace('<link rel="manifest" href="./manifest.webmanifest">\n', '');
  if (nome === 'privacidade.html') {
    html = html.replace(/<p><a class="botao" href="[^"]*pontos\.csv"[\s\S]*?<\/p>/,
      '<p class="aviso-caixa">Esta é uma <strong>demonstração</strong> com pontos fictícios. Na versão completa, todos os dados podem ser baixados em CSV e GeoJSON.</p>');
  }
  return html;
}

(async () => {
  // Esvazia a pasta em vez de apagá-la (ela pode estar aberta no Explorer ou sincronizando no OneDrive).
  fs.mkdirSync(DESTINO, { recursive: true });
  for (const item of fs.readdirSync(DESTINO)) fs.rmSync(path.join(DESTINO, item), { recursive: true, force: true });
  const dados = {};

  // Páginas lidas do servidor: já vêm com o nome da cidade configurada ({{CIDADE}} preenchido).
  for (const nome of PAGINAS) {
    const r = await fetch(`${SERVIDOR}/${nome}`);
    if (!r.ok) throw new Error(`/${nome}: ${r.status}`);
    fs.writeFileSync(path.join(DESTINO, nome), transformarHtml(nome, await r.text()));
  }
  for (const nome of ARQUIVOS) fs.copyFileSync(path.join(ORIGEM, nome), path.join(DESTINO, nome));
  for (const nome of ['demo.js', 'abrir-demonstracao.cmd', 'servidor-local.ps1']) {
    fs.copyFileSync(path.join(RAIZ, 'demo', nome), path.join(DESTINO, nome));
  }
  fs.writeFileSync(path.join(DESTINO, '.nojekyll'), ''); // GitHub Pages: servir os arquivos como estão

  // Dados fixos lidos do servidor.
  const config = await json('/api/config');
  dados['config.json'] = config;
  dados['limite.json'] = await json('/api/limite');
  const regioes = await json('/api/relatorios/bairros');
  dados['regioes.json'] = { ...regioes, ranking: [] };

  // Rua e região de cada ponto simulado (a simulação é determinística: mesma ordem sempre).
  const ctx = { window: {}, location: { search: '', href: 'http://demo/' }, history: { replaceState() {} }, URL, URLSearchParams, console };
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(ORIGEM, 'simulacao.js'), 'utf8')}\nthis.Simulacao = Simulacao;`, ctx);
  for (const cenario of Object.keys(ctx.Simulacao.CENARIOS)) {
    const pontos = ctx.Simulacao.gerar(config, cenario);
    const locais = await json('/api/localizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pontos: pontos.map((p) => [p.lat, p.lng]) }),
    });
    dados[`sim-${cenario}.json`] = locais;
    console.log(`Cenário ${cenario}: ${pontos.length} pontos, ${locais.filter((l) => l.rua).length} com nome de rua.`);
  }

  // Num script (e não .json) para abrir também com clique duplo (file://).
  fs.writeFileSync(path.join(DESTINO, 'dados.js'), `window.DADOS_DEMO = ${JSON.stringify(dados)};\n`);

  const total = fs.readdirSync(DESTINO, { recursive: true })
    .map((f) => path.join(DESTINO, f)).filter((f) => fs.statSync(f).isFile())
    .reduce((s, f) => s + fs.statSync(f).size, 0);
  console.log(`Demonstração gerada em demo-site/ (${Math.round(total / 1024)} KB).`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
