const jwt = require('jsonwebtoken');
const { HttpError, a } = require('./http');
const usuarios = require('./modules/usuarios/service');

const SEGREDO = process.env.JWT_SEGREDO || '';
if (SEGREDO.length < 32) {
  throw new Error('JWT_SEGREDO precisa ter pelo menos 32 caracteres');
}
const COOKIE = 'sessao';
const DURACAO_H = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iniciarSessao(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, SEGREDO, { expiresIn: `${DURACAO_H}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SEGURO === 'true',
    maxAge: DURACAO_H * 3600 * 1000,
  });
}

function encerrarSessao(res) {
  res.clearCookie(COOKIE);
}

// Lê o cookie de sessão (só a administração tem).
function lerSessao(req, res, next) {
  const t = req.cookies && req.cookies[COOKIE];
  if (t) {
    try {
      req.sessao = jwt.verify(t, SEGREDO);
    } catch {
      /* sessão inválida ou expirada: segue como público */
    }
  }
  next();
}

// Código aleatório gerado no navegador. Não identifica a pessoa.
function lerCodigo(req, res, next) {
  const c = req.get('x-codigo');
  req.codigo = c && UUID.test(c) ? c.toLowerCase() : null;
  next();
}

function exigirCodigo(req, res, next) {
  if (!req.codigo) return next(new HttpError(400, 'Código do navegador ausente. Recarregue a página.'));
  next();
}

// Confere no banco a cada requisição, para que desativar uma conta tenha efeito imediato.
function exigirPerfil(...perfis) {
  return a(async (req, res, next) => {
    if (!req.sessao) throw new HttpError(401, 'Faça login');
    const u = await usuarios.obterAtivo(req.sessao.id);
    if (!u) throw new HttpError(401, 'Sessão inválida');
    if (perfis.length && !perfis.includes(u.perfil)) throw new HttpError(403, 'Sem permissão');
    req.usuario = u;
    next();
  });
}

module.exports = { iniciarSessao, encerrarSessao, lerSessao, lerCodigo, exigirCodigo, exigirPerfil };
