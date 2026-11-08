// Configuração pública usada pelas páginas (cidade, opções fixas, status, mapa).
const express = require('express');
const D = require('../../dominio');
const cidade = require('../../cidade');
const geo = require('../../geo');

const r = express.Router();

r.get('/config', (req, res) => {
  // Sem cache longo: muda quando a cidade ou o cidade.json mudam (o navegador revalida pelo ETag).
  res.set('Cache-Control', 'no-cache');
  res.json({
    cidade: { slug: cidade.SLUG, nome: cidade.nome, uf: cidade.uf },
    tipos: D.TIPOS,
    opcoes: D.OPCOES,
    status: D.STATUS,
    status_inicial: D.STATUS_INICIAL,
    status_final: D.STATUS_FINAL,
    motivos_remocao: D.MOTIVOS_REMOCAO,
    area: cidade.AREA,
    centro: cidade.centro,
    zoom: cidade.zoom,
    simulacao: geo.simulacao(),
    mapa: {
      url: process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      atribuicao: process.env.TILE_ATRIBUICAO || '&copy; colaboradores do OpenStreetMap',
    },
  });
});

// Contorno oficial do município, usado para limitar e destacar o mapa.
r.get('/limite', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ type: 'MultiPolygon', coordinates: cidade.LIMITE });
});

module.exports = r;
