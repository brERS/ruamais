// Exportação de dados abertos, sem nenhuma informação pessoal (sem códigos de navegador).
const express = require('express');
const { a } = require('../../http');
const pontos = require('../pontos/service');

const r = express.Router();

const CAMPOS = [
  'id', 'tipo', 'status', 'verificacao', 'confirmacoes', 'negacoes', 'contestacoes', 'bairro',
  'criado_em', 'resolvido_em', 'removido', 'motivo_remocao',
];

function iso(v) {
  return v instanceof Date ? v.toISOString() : v;
}

async function todos() {
  return pontos.listar({ incluirRemovidos: true });
}

r.get('/dados-abertos/pontos.geojson', a(async (req, res) => {
  const ps = await todos();
  res.set('Content-Disposition', 'attachment; filename="pontos.geojson"');
  res.type('application/geo+json').send(JSON.stringify({
    type: 'FeatureCollection',
    gerado_em: new Date().toISOString(),
    licenca: 'ODbL (compatível com OpenStreetMap)',
    features: ps.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ...Object.fromEntries(CAMPOS.map((c) => [c, iso(p[c])])), atributos: p.atributos },
    })),
  }));
}));

function csv(v) {
  if (v == null) return '';
  const s = typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(iso(v));
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

r.get('/dados-abertos/pontos.csv', a(async (req, res) => {
  const ps = await todos();
  const cab = [...CAMPOS, 'lat', 'lng', 'atributos'];
  const linhas = [cab.join(',')].concat(ps.map((p) => cab.map((c) => csv(p[c])).join(',')));
  res.set('Content-Disposition', 'attachment; filename="pontos.csv"');
  res.type('text/csv; charset=utf-8').send('﻿' + linhas.join('\n'));
}));

module.exports = r;
