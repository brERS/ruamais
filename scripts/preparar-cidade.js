// Prepara a pasta cidades/<cidade>-<uf>/ de um município brasileiro a partir do código do IBGE:
//   cidade.json     nome, UF, código, centro e zoom (pode ajustar à mão depois)
//   limite.geojson  contorno oficial (IBGE, malha municipal)
//   osm.json        ruas com nome e bairros/distritos (OpenStreetMap)
//
// Uso (com o Docker do projeto):
//   docker compose run --rm --no-deps -v "<pasta do projeto>:/projeto" app node /projeto/scripts/preparar-cidade.js <código IBGE>
// Código IBGE: https://www.ibge.gov.br/explica/codigos-dos-municipios.php (7 dígitos)
// Depois, no .env: CIDADE=<pasta criada>
const fs = require('fs');
const path = require('path');

const AGENTE = 'RuaMais/0.1 (preparar-cidade)';
const codigo = String(process.argv[2] || '').trim();
if (!/^\d{7}$/.test(codigo)) {
  console.error('Informe o código IBGE do município (7 dígitos). Ex.: node scripts/preparar-cidade.js 3304201');
  process.exit(1);
}

async function obter(url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { 'User-Agent': AGENTE, ...(opcoes.headers || {}) } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugDe = (nome, uf) => `${semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${uf.toLowerCase()}`;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

function dentroDoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

(async () => {
  // 1. Nome e UF
  const mun = await obter(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo}`);
  if (!mun || !mun.nome) throw new Error('Município não encontrado no IBGE.');
  const uf = (mun.microrregiao && mun.microrregiao.mesorregiao.UF.sigla)
    || (mun['regiao-imediata'] && mun['regiao-imediata']['regiao-intermediaria'].UF.sigla);
  const slug = slugDe(mun.nome, uf);
  console.log(`Município: ${mun.nome}/${uf} (${codigo}) → cidades/${slug}/`);

  // 2. Contorno oficial
  const limite = await obter(
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigo}?formato=application/vnd.geo%2Bjson&qualidade=maxima`,
    { headers: { Accept: 'application/vnd.geo+json' } }
  );
  const geom = limite.features[0].geometry;
  const poligonos = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const pts = poligonos.flat(2);
  const lats = pts.map((p) => p[1]);
  const lngs = pts.map((p) => p[0]);
  const caixa = { s: Math.min(...lats), n: Math.max(...lats), o: Math.min(...lngs), l: Math.max(...lngs) };
  const dentro = (lat, lng) => poligonos.some(([ext, ...bur]) => dentroDoAnel(lng, lat, ext) && !bur.some((b) => dentroDoAnel(lng, lat, b)));
  console.log(`Contorno: ${pts.length} vértices.`);

  // 3. Ruas e lugares do OpenStreetMap (pela área com o código IBGE; se não houver, pela caixa + filtro)
  const consulta = (filtro) => `[out:json][timeout:180];(way["highway"]["name"]${filtro};node["place"~"city|town|suburb|neighbourhood|quarter|village|hamlet"]${filtro};);out geom;`;
  const overpass = (q) => obter('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(q)}`,
  });
  let osm = await overpass(`[out:json][timeout:180];area["IBGE:GEOCODIGO"="${codigo}"]->.a;${consulta('(area.a)').replace('[out:json][timeout:180];', '')}`);
  let elementos = osm.elements || [];
  if (!elementos.some((e) => e.type === 'way')) {
    console.log('Área com código IBGE não encontrada no OpenStreetMap; usando o contorno do IBGE.');
    osm = await overpass(consulta(`(${caixa.s},${caixa.o},${caixa.n},${caixa.l})`));
    elementos = (osm.elements || []).filter((e) => (e.type === 'node' ? dentro(e.lat, e.lon)
      : e.geometry && e.geometry.some((g) => dentro(g.lat, g.lon))));
  }
  const vias = elementos.filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
    .map((e) => ({ n: e.tags.name, t: e.tags.highway, c: e.geometry.map((g) => [r6(g.lon), r6(g.lat)]) }));
  const nos = elementos.filter((e) => e.type === 'node');
  const lugares = nos.filter((e) => e.tags.place !== 'city' && e.tags.place !== 'town')
    .map((e) => ({ n: e.tags.name, t: e.tags.place, c: [r6(e.lon), r6(e.lat)] }))
    .filter((l) => l.n);
  console.log(`OpenStreetMap: ${vias.length} ruas com nome, ${lugares.length} bairros/distritos.`);

  // 4. Centro: o ponto da sede no OpenStreetMap; senão, o meio do contorno.
  // Compara sem acento, maiúsculas nem pontuação ("São João del Rei" = "São João del-Rei").
  const chave = (s) => semAcento(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sede = nos.find((e) => ['city', 'town'].includes(e.tags.place) && chave(e.tags.name) === chave(mun.nome));
  let centro = sede ? [r6(sede.lat), r6(sede.lon)] : [r6((caixa.s + caixa.n) / 2), r6((caixa.o + caixa.l) / 2)];
  if (!dentro(centro[0], centro[1])) centro = [r6(pts[0][1]), r6(pts[0][0])];
  console.log(`Centro: ${centro.join(', ')}${sede ? ' (sede no OpenStreetMap)' : ' (meio do contorno — ajuste em cidade.json se precisar)'}`);

  // 5. Arquivos
  const pasta = path.join(__dirname, '..', 'cidades', slug);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'cidade.json'), `${JSON.stringify({
    nome: mun.nome,
    uf,
    codigo_ibge: codigo,
    centro,
    zoom: 14,
    fontes: {
      limite: 'IBGE, malha municipal (qualidade máxima)',
      ruas_e_bairros: 'OpenStreetMap (© colaboradores do OpenStreetMap, licença ODbL)',
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(pasta, 'limite.geojson'), JSON.stringify(limite));
  fs.writeFileSync(path.join(pasta, 'osm.json'), JSON.stringify({
    fonte: 'OpenStreetMap (© colaboradores do OpenStreetMap, licença ODbL)',
    baixado_em: osm.osm3s ? osm.osm3s.timestamp_osm_base : new Date().toISOString(),
    vias,
    lugares,
  }));
  console.log(`\nPronto. Para usar esta cidade, coloque no .env:  CIDADE=${slug}`);
  console.log('Use um banco de dados separado para cada cidade (o sistema recusa trocar de cidade num banco que já tem pontos).');
})().catch((e) => {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
});
