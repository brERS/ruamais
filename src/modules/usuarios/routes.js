const express = require('express');
const { a, HttpError } = require('../../http');
const { iniciarSessao, encerrarSessao, exigirPerfil } = require('../../auth');
const usuarios = require('./service');

const r = express.Router();

r.post('/auth/login', a(async (req, res) => {
  const u = await usuarios.autenticar(req.body.email, req.body.senha);
  if (!u) throw new HttpError(401, 'E-mail ou senha incorretos');
  iniciarSessao(res, u);
  res.json(u);
}));

r.post('/auth/logout', (req, res) => {
  encerrarSessao(res);
  res.json({ ok: true });
});

r.get('/auth/eu', exigirPerfil(), (req, res) => res.json(req.usuario));

r.get('/usuarios', exigirPerfil('admin'), a(async (req, res) => res.json(await usuarios.listar())));

r.post('/usuarios', exigirPerfil('admin'), a(async (req, res) => {
  res.status(201).json(await usuarios.criar(req.body));
}));

r.patch('/usuarios/:id', exigirPerfil('admin'), a(async (req, res) => {
  res.json(await usuarios.atualizar(Number(req.params.id), req.body, req.usuario.id));
}));

module.exports = r;
