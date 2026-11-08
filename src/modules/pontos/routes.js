const express = require('express');
const { a } = require('../../http');
const { exigirCodigo, exigirPerfil } = require('../../auth');
const pontos = require('./service');

const r = express.Router();
const id = (req) => Number(req.params.id) || 0;

// Público
r.get('/pontos', a(async (req, res) => res.json(await pontos.listar())));

r.get('/pontos/proximos', a(async (req, res) => {
  res.json(await pontos.proximos(req.query.lat, req.query.lng, req.query.raio));
}));

r.get('/pontos/:id', a(async (req, res) => res.json(await pontos.obter(id(req)))));

r.post('/pontos', exigirCodigo, a(async (req, res) => {
  res.status(201).json(await pontos.criar(req.body, req.codigo));
}));

// Só administração
r.get('/staff/pontos', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await pontos.listarTrabalho(req.query.lista || 'conferencia'));
}));

r.get('/staff/pontos/:id', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await pontos.obter(id(req), { staff: true }));
}));

r.patch('/pontos/:id/status', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await pontos.alterarStatus(id(req), req.body, req.usuario));
}));

r.post('/pontos/:id/remover', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await pontos.remover(id(req), req.body.motivo, req.usuario));
}));

r.post('/pontos/:id/restaurar', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await pontos.restaurar(id(req), req.usuario));
}));

module.exports = r;
