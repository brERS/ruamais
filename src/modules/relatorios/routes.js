const express = require('express');
const { a } = require('../../http');
const relatorios = require('./service');

const r = express.Router();

r.get('/relatorios/calor', a(async (req, res) => res.json(await relatorios.calor(req.query))));
r.get('/relatorios/bairros', a(async (req, res) => res.json(await relatorios.bairros(req.query))));

module.exports = r;
