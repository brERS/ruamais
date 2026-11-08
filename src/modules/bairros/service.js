const db = require('../../db');
const { HttpError } = require('../../http');

// Campos comuns de nome em arquivos do IBGE, do OpenStreetMap e de outras fontes.
const CAMPOS_NOME = ['nome', 'name', 'NOME', 'NM_BAIRRO', 'nm_bairro', 'BAIRRO', 'bairro', 'NM_SUBDIST'];

function nomeDe(props = {}) {
  for (const c of CAMPOS_NOME) if (props[c]) return String(props[c]).trim().slice(0, 120);
  return null;
}

// Importa um GeoJSON (FeatureCollection) de polígonos em WGS84.
async function importar(geojson, substituir) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new HttpError(400, 'Envie um GeoJSON do tipo FeatureCollection');
  }
  const validas = geojson.features.filter(
    (f) => f && f.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type)
  );
  if (!validas.length) throw new HttpError(400, 'Nenhum polígono encontrado');

  return db.tx(async (c) => {
    if (substituir) await c.query('DELETE FROM bairros');
    let n = 0;
    for (const [i, f] of validas.entries()) {
      const nome = nomeDe(f.properties) || `Bairro ${i + 1}`;
      try {
        await c.query('SAVEPOINT b');
        await c.query(
          `INSERT INTO bairros (nome, geom)
           VALUES ($1, ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))))`,
          [nome, JSON.stringify(f.geometry)]
        );
        await c.query('RELEASE SAVEPOINT b');
        n++;
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT b');
        throw new HttpError(400, `Geometria inválida em "${nome}": ${e.message}`);
      }
    }
    return { importados: n, ignorados: geojson.features.length - validas.length };
  });
}

async function listar() {
  const { rows } = await db.query('SELECT id, nome, fonte FROM bairros ORDER BY nome');
  return rows;
}

module.exports = { importar, listar };
