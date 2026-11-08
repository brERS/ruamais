// Cidade atendida por esta instalação. Escolhida pela variável CIDADE (padrão: resende-rj, a cidade de exemplo),
// que aponta para a pasta cidades/<CIDADE>/ com:
//   cidade.json     nome, UF, código IBGE, centro e zoom inicial
//   limite.geojson  contorno oficial do município (só são aceitos pontos dentro dele)
//   osm.json        ruas e bairros do OpenStreetMap (opcional; dá nome de rua e regiões)
// Para preparar uma cidade nova: scripts/preparar-cidade.js <código IBGE>
const fs = require('fs');
const path = require('path');

const SLUG = (process.env.CIDADE || 'resende-rj').trim();
if (!/^[a-z0-9-]+$/.test(SLUG)) throw new Error(`CIDADE inválida: "${SLUG}" (use letras minúsculas, números e hífen)`);

const PASTA = path.join(__dirname, '..', 'cidades', SLUG);
if (!fs.existsSync(path.join(PASTA, 'cidade.json'))) {
  throw new Error(`Cidade "${SLUG}" não encontrada em cidades/${SLUG}/. Prepare com: node scripts/preparar-cidade.js <código IBGE>`);
}

// cidade.json é relido quando o arquivo muda: editar nome, centro ou zoom vale sem reiniciar.
// (O contorno, limite.geojson, só é lido na inicialização.)
const ARQ_INFO = path.join(PASTA, 'cidade.json');
let info = null;
let mtimeInfo = 0;
function lerInfo() {
  const mtime = fs.statSync(ARQ_INFO).mtimeMs;
  if (info && mtime === mtimeInfo) return info;
  let novo;
  try {
    novo = JSON.parse(fs.readFileSync(ARQ_INFO, 'utf8'));
  } catch (e) {
    if (info) {
      console.error(`cidades/${SLUG}/cidade.json inválido (${e.message}); mantendo a versão anterior.`);
      return info;
    }
    throw e;
  }
  for (const campo of ['nome', 'uf', 'centro']) {
    if (!novo[campo]) {
      if (info) return info;
      throw new Error(`cidades/${SLUG}/cidade.json: falta o campo "${campo}"`);
    }
  }
  info = novo;
  mtimeInfo = mtime;
  return info;
}
lerInfo();

// Lista de polígonos; cada um é [anel externo, ...buracos], com pontos [lng, lat].
const LIMITE = (() => {
  const g = JSON.parse(fs.readFileSync(path.join(PASTA, 'limite.geojson'), 'utf8'));
  const geom = g.features ? g.features[0].geometry : g.geometry || g;
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  throw new Error(`cidades/${SLUG}/limite.geojson: esperado Polygon ou MultiPolygon`);
})();

const AREA = (() => {
  const pts = LIMITE.flat(2);
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return { sul: Math.min(...lats), norte: Math.max(...lats), oeste: Math.min(...lngs), leste: Math.max(...lngs) };
})();

function dentroDoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentro(lat, lng) {
  if (lat < AREA.sul || lat > AREA.norte || lng < AREA.oeste || lng > AREA.leste) return false;
  return LIMITE.some(([externo, ...buracos]) =>
    dentroDoAnel(lng, lat, externo) && !buracos.some((b) => dentroDoAnel(lng, lat, b)));
}

const arquivoOsm = path.join(PASTA, 'osm.json');

module.exports = {
  SLUG,
  get nome() { return lerInfo().nome; },
  get uf() { return lerInfo().uf; },
  get codigoIbge() { return lerInfo().codigo_ibge || null; },
  get centro() { return lerInfo().centro; },
  get zoom() { return lerInfo().zoom || 14; },
  get fontes() { return lerInfo().fontes || {}; },
  LIMITE,
  AREA,
  dentro,
  arquivoOsm: fs.existsSync(arquivoOsm) ? arquivoOsm : null,
};
