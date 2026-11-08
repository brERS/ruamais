// Dados geográficos da cidade configurada (ver src/cidade.js):
// carrega ruas e bairros do OpenStreetMap no banco, gera regiões aproximadas,
// calcula os focos da simulação e localiza rua/região de coordenadas.
const fs = require('fs');
const db = require('./db');
const cidade = require('./cidade');

let infoSimulacao = null;

// Um banco pertence a uma cidade só. Trocar a cidade com pontos já gravados seria misturar dados.
async function conferirCidade() {
  const { rows } = await db.query("SELECT valor FROM meta WHERE chave = 'cidade'");
  const atual = rows[0] && rows[0].valor;
  if (atual === cidade.SLUG) return;
  if (atual) {
    const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM pontos');
    if (n > 0) {
      throw new Error(`Este banco pertence à cidade "${atual}" e já tem ${n} pontos; a configuração pede "${cidade.SLUG}". `
        + 'Use um banco separado para cada cidade (outro volume do Docker), ou volte CIDADE para a cidade original.');
    }
    // Banco sem pontos: troca de cidade limpa os dados geográficos da anterior.
    await db.query('DELETE FROM vias; DELETE FROM lugares; DELETE FROM bairros;');
    console.log(`Banco sem pontos: dados geográficos de "${atual}" removidos para usar "${cidade.SLUG}".`);
  }
  await db.query(
    "INSERT INTO meta (chave, valor) VALUES ('cidade', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
    [cidade.SLUG]
  );
}

async function carregarDadosGeo() {
  await conferirCidade();

  const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM vias');
  if (n === 0 && cidade.arquivoOsm) {
    const osm = JSON.parse(fs.readFileSync(cidade.arquivoOsm, 'utf8'));
    await db.query(
      `INSERT INTO vias (nome, tipo, geom)
       SELECT e->>'n', e->>'t', ST_SetSRID(ST_MakeLine(ARRAY(
                SELECT ST_MakePoint((c->>0)::float8, (c->>1)::float8)
                  FROM jsonb_array_elements(e->'c') WITH ORDINALITY AS x(c, i) ORDER BY i)), 4326)
         FROM jsonb_array_elements($1::jsonb) e`,
      [JSON.stringify(osm.vias || [])]
    );
    await db.query(
      `INSERT INTO lugares (nome, tipo, geom)
       SELECT e->>'n', e->>'t', ST_SetSRID(ST_MakePoint((e->'c'->>0)::float8, (e->'c'->>1)::float8), 4326)
         FROM jsonb_array_elements($1::jsonb) e`,
      [JSON.stringify(osm.lugares || [])]
    );
    console.log(`${cidade.nome}: ${(osm.vias || []).length} ruas e ${(osm.lugares || []).length} bairros/distritos carregados do OpenStreetMap.`);
  }

  // Sem contornos de bairro: gera regiões aproximadas (área mais próxima de cada bairro ou
  // distrito do OpenStreetMap), recortadas pelo limite do município.
  const { rows: [{ b }] } = await db.query('SELECT count(*)::int AS b FROM bairros');
  const { rows: [{ l }] } = await db.query('SELECT count(*)::int AS l FROM lugares');
  if (b === 0 && l >= 2) {
    const { rowCount } = await db.query(
      `WITH lim AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g),
            pts AS (SELECT DISTINCT ON (nome) nome, geom FROM lugares ORDER BY nome, id),
            cel AS (SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(geom), 0,
                            (SELECT ST_Envelope(ST_Buffer(g, 0.1)) FROM lim)))).geom AS g
                      FROM pts)
       INSERT INTO bairros (nome, geom, fonte)
       SELECT pts.nome, ST_Multi(ST_CollectionExtract(ST_Intersection(cel.g, lim.g), 3)), 'osm-aproximado'
         FROM cel JOIN pts ON ST_Contains(cel.g, pts.geom), lim
        WHERE NOT ST_IsEmpty(ST_Intersection(cel.g, lim.g))`,
      [JSON.stringify({ type: 'MultiPolygon', coordinates: cidade.LIMITE })]
    );
    console.log(`Regiões aproximadas geradas: ${rowCount}.`);
  }

  infoSimulacao = await calcularSimulacao();
}

// Área urbana e focos da simulação, a partir dos bairros (OpenStreetMap) mais próximos do centro.
// Sem bairros, usa um quadrado ao redor do centro.
async function calcularSimulacao() {
  const [cLat, cLng] = cidade.centro;
  const { rows } = await db.query(
    `SELECT nome, ST_Y(geom) AS lat, ST_X(geom) AS lng,
            ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS dist
       FROM lugares WHERE tipo IN ('suburb', 'neighbourhood', 'quarter')
      ORDER BY dist LIMIT 40`,
    [cLat, cLng]
  );
  // Só bairros até 8 km do centro (área urbana).
  const urbanos = rows.filter((r) => r.dist < 8000);
  let area;
  if (urbanos.length >= 3) {
    const lats = urbanos.map((r) => r.lat);
    const lngs = urbanos.map((r) => r.lng);
    const folga = 0.006;
    area = { sul: Math.min(...lats) - folga, norte: Math.max(...lats) + folga, oeste: Math.min(...lngs) - folga, leste: Math.max(...lngs) + folga };
  } else {
    area = { sul: cLat - 0.03, norte: cLat + 0.03, oeste: cLng - 0.035, leste: cLng + 0.035 };
  }
  // Recorta pelo retângulo do município.
  area = {
    sul: Math.max(area.sul, cidade.AREA.sul), norte: Math.min(area.norte, cidade.AREA.norte),
    oeste: Math.max(area.oeste, cidade.AREA.oeste), leste: Math.min(area.leste, cidade.AREA.leste),
  };
  // Focos: centro denso (quase só buracos), bairros intermediários e periferia (ruas de terra).
  const escolhidos = urbanos.length >= 3
    ? [urbanos[0], urbanos[Math.floor(urbanos.length * 0.3)], urbanos[Math.floor(urbanos.length * 0.5)],
      urbanos[urbanos.length - 1], urbanos[urbanos.length - 2]]
    : [{ lat: cLat, lng: cLng }];
  const perfis = [
    { sd: 0.0035, peso: 0.22, rua: 0.05 }, { sd: 0.0045, peso: 0.16, rua: 0.35 }, { sd: 0.004, peso: 0.14, rua: 0.25 },
    { sd: 0.006, peso: 0.1, rua: 0.75 }, { sd: 0.0055, peso: 0.08, rua: 0.8 },
  ];
  const focos = escolhidos.map((f, i) => ({ lat: f.lat, lng: f.lng, ...perfis[i] }));
  return { area, focos };
}

function simulacao() {
  return infoSimulacao;
}

// Rua e região para várias coordenadas de uma vez (usado pela simulação).
async function localizar(coords) {
  if (!Array.isArray(coords) || coords.length > 3000) return [];
  const validos = coords.map((c) => (Array.isArray(c) ? [Number(c[0]), Number(c[1])] : [NaN, NaN]));
  const { rows } = await db.query(
    `SELECT i,
            (SELECT bb.nome FROM bairros bb WHERE ST_Contains(bb.geom, q.g) ORDER BY bb.id LIMIT 1) AS bairro,
            (SELECT CASE WHEN ST_DWithin(vv.geom::geography, q.g::geography, 80) THEN vv.nome END
               FROM vias vv ORDER BY vv.geom <-> q.g LIMIT 1) AS rua
       FROM (SELECT i, ST_SetSRID(ST_MakePoint((c->>1)::float8, (c->>0)::float8), 4326) AS g
               FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(c, i)) q
      ORDER BY i`,
    [JSON.stringify(validos.map(([a, b]) => (Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [0, 0])))]
  );
  return rows.map((r) => ({ rua: r.rua, bairro: r.bairro }));
}

module.exports = { carregarDadosGeo, localizar, simulacao };
