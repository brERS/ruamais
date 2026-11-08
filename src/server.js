const fs = require('fs');
const path = require('path');
const cidade = require('./cidade');
const express = require('express');
const cookieParser = require('cookie-parser');
const { migrar } = require('./migrate');
const { lerSessao, lerCodigo } = require('./auth');
const usuarios = require('./modules/usuarios/service');

const PORT = Number(process.env.PORT || 3000);
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Sem rastreadores: só scripts próprios e o Leaflet (unpkg).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    // Envia só a origem do site (sem caminho): os servidores de mapa exigem saber quem pede as imagens.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), interest-cohort=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(lerSessao);
app.use(lerCodigo);

app.get('/api/saude', (req, res) => res.json({ ok: true }));

// Módulos (monólito modular): cada um expõe suas rotas e conversa com os outros só pelos services.
for (const m of ['config', 'usuarios', 'pontos', 'votos', 'relatorios', 'bairros', 'dados-abertos', 'admin']) {
  app.use('/api', require(`./modules/${m}/routes`));
}

app.use('/api', (req, res) => res.status(404).json({ erro: 'Não encontrado' }));

// Páginas e manifesto com o nome da cidade configurada ({{CIDADE}} e {{UF}} nos arquivos).
const PUBLICO = path.join(__dirname, '..', 'public');
const comCidade = (texto) => texto.replace(/\{\{CIDADE\}\}/g, cidade.nome).replace(/\{\{UF\}\}/g, cidade.uf);
const PAGINAS = new Set(['index', 'calor', 'relatorio', 'privacidade', 'admin']);
app.get(/^\/(?:([a-z]+)(?:\.html)?)?$/, (req, res, next) => {
  const nome = req.params[0] || 'index';
  if (!PAGINAS.has(nome)) return next();
  res.type('html').send(comCidade(fs.readFileSync(path.join(PUBLICO, `${nome}.html`), 'utf8')));
});
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').send(comCidade(fs.readFileSync(path.join(PUBLICO, 'manifest.webmanifest'), 'utf8')));
});

app.use(express.static(PUBLICO, { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 ? 'Erro interno' : err.message });
});

(async () => {
  await migrar();
  await require('./geo').carregarDadosGeo();
  await usuarios.garantirAdmin();
  app.listen(PORT, () => console.log(`Servidor em http://localhost:${PORT}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
