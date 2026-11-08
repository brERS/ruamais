const express = require('express');
const { a } = require('../../http');
const { exigirPerfil } = require('../../auth');
const bairros = require('./service');

const r = express.Router();

r.get('/bairros', a(async (req, res) => res.json(await bairros.listar())));

// Rua e região de várias coordenadas (usado pela simulação; não grava nada).
r.post('/localizar', a(async (req, res) => {
  res.json(await require('../../geo').localizar(req.body.pontos));
}));

r.post('/bairros/importar', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await bairros.importar(req.body.geojson, !!req.body.substituir));
}));

module.exports = r;
