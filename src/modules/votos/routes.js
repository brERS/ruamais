const express = require('express');
const { a } = require('../../http');
const { exigirCodigo } = require('../../auth');
const votos = require('./service');

const r = express.Router();

r.post('/pontos/:id/votos', exigirCodigo, a(async (req, res) => {
  res.status(201).json(await votos.votar(Number(req.params.id) || 0, req.body.tipo, req.codigo));
}));

module.exports = r;
