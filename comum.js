// Utilidades compartilhadas pelas páginas.

// ---------- Preferências de exibição (aplicadas o quanto antes) ----------
try {
  if (localStorage.getItem('letra') === '1') document.documentElement.classList.add('letra-maior');
} catch { /* sem armazenamento */ }

function aplicarLetraMaior(ligar) {
  document.documentElement.classList.toggle('letra-maior', ligar);
  try { localStorage.setItem('letra', ligar ? '1' : '0'); } catch { /* sem armazenamento */ }
}

const REDUZ_MOVIMENTO = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Versão de demonstração (site estático, ex.: GitHub Pages) ----------
// Na demonstração não há servidor: tudo é simulado no navegador (ver demo/demo.js).
const DEMO = !!window.MODO_DEMO;

// Endereço de uma página do site. Na demonstração vira caminho relativo ("./calor.html"),
// para funcionar dentro de uma subpasta (ex.: usuario.github.io/projeto/).
function rota(caminho) {
  if (!DEMO) return caminho;
  const m = caminho.match(/^\/([a-z-]*)([?#].*)?$/);
  if (!m) return caminho;
  return `./${m[1] ? `${m[1]}.html` : 'index.html'}${m[2] || ''}`;
}

// Endereço completo (para copiar link).
function urlPublica(caminho) {
  return new URL(rota(caminho), location.href).href;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll(DEMO ? '.so-servidor' : '.so-demo').forEach((el) => { el.hidden = true; });
});

// ---------- Código aleatório do navegador ----------
// Não identifica a pessoa; só liga reportes e votos entre si.
const CODIGO = (() => {
  const gerar = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  try {
    let c = localStorage.getItem('codigo');
    if (!c) {
      c = gerar();
      localStorage.setItem('codigo', c);
    }
    return c;
  } catch {
    return gerar();
  }
})();

async function api(caminho, opcoes = {}) {
  if (DEMO) return window.demoApi(caminho, opcoes);
  const init = {
    method: opcoes.method || 'GET',
    credentials: 'same-origin',
    headers: { 'X-Codigo': CODIGO },
  };
  if (opcoes.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opcoes.body);
  }
  let r;
  try {
    r = await fetch(caminho, init);
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new Error((dados && dados.erro) || 'Não foi possível concluir. Tente de novo.');
    e.status = r.status;
    throw e;
  }
  return dados;
}

let CONFIG = null;
async function carregarConfig() {
  if (!CONFIG) {
    CONFIG = await api('/api/config?v=2');
    aplicarNomeCidade(CONFIG);
  }
  return CONFIG;
}

// O servidor já entrega as páginas com o nome da cidade (do cidade.json). Se a página vier sem a troca
// (aberta direto do arquivo, ou servida por outro programa), troca aqui {{CIDADE}} e {{UF}}.
function aplicarNomeCidade(cfg) {
  if (!cfg || !cfg.cidade) return;
  const trocar = (t) => t.replace(/\{\{CIDADE\}\}/g, cfg.cidade.nome).replace(/\{\{UF\}\}/g, cfg.cidade.uf);
  if (document.title.includes('{{')) document.title = trocar(document.title);
  document.querySelectorAll('meta[content*="{{"]').forEach((m) => m.setAttribute('content', trocar(m.content)));
  const nos = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = nos.nextNode(); n; n = nos.nextNode()) {
    if (n.nodeValue.includes('{{')) n.nodeValue = trocar(n.nodeValue);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Avisos (lidos por leitores de tela) ----------
function regiaoAvisos(erro) {
  const id = erro ? 'avisos-erro' : 'avisos';
  let r = document.getElementById(id);
  if (!r) {
    r = document.createElement('div');
    r.id = id;
    r.className = 'avisos';
    r.setAttribute('role', erro ? 'alert' : 'status');
    r.setAttribute('aria-live', erro ? 'assertive' : 'polite');
    document.body.appendChild(r);
  }
  return r;
}

function aviso(texto, erro = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = texto;
  regiaoAvisos(erro).appendChild(t);
  setTimeout(() => t.remove(), erro ? 8000 : 5000);
}

// ---------- Datas e textos ----------
function dataBR(v) {
  if (!v) return '';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
  return d.toLocaleDateString('pt-BR');
}

function dataHoraBR(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function distanciaTexto(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// Descreve os atributos com os rótulos das opções fixas.
function descreverAtributos(cfg, tipo, at) {
  const def = cfg.opcoes[tipo] || {};
  const partes = [];
  for (const [campo, c] of Object.entries(def)) {
    const v = at[campo];
    if (v == null) continue;
    const vals = Array.isArray(v) ? v : [v];
    partes.push({ rotulo: c.rotulo, valores: vals.map((x) => c.valores[x] || x) });
  }
  return partes;
}

const ROTULO_VERIFICACAO = {
  nao_confirmado: 'Não confirmado',
  confirmado: 'Confirmado',
  em_verificacao: 'Em verificação',
};

// ---------- Situação visual de um ponto ----------
// A cor indica a situação; a forma indica o tipo (círculo = buraco, quadrado = rua sem asfalto).
// Paleta Okabe-Ito, distinguível por pessoas daltônicas.
const ROTULO_CATEGORIA = {
  aberto: 'Aberto',
  andamento: 'Em conserto ou em obra',
  resolvido: 'Resolvido ou pavimentada',
  verificacao: 'Em verificação',
};

function categoria(p) {
  if (p.verificacao === 'em_verificacao') return 'verificacao';
  if (p.final) return 'resolvido';
  if (CONFIG && p.status !== CONFIG.status_inicial[p.tipo]) return 'andamento';
  return 'aberto';
}

function corVar(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

// Símbolo em SVG para listas e legenda (mesma forma do mapa).
function simboloSVG(tipo, cat, tamanho = 22, confirmado = true) {
  const estilo = `fill:var(--st-${cat});fill-opacity:${confirmado ? 1 : 0.5}`;
  const traco = confirmado ? 'stroke="#fff" stroke-width="2"' : 'stroke="#1a1a1a" stroke-width="1.5" stroke-dasharray="3 2"';
  const forma = tipo === 'buraco'
    ? `<circle cx="11" cy="11" r="9" style="${estilo}" ${traco}/>`
    : `<rect x="2.5" y="2.5" width="17" height="17" rx="2" style="${estilo}" ${traco}/>`;
  return `<svg class="simbolo" width="${tamanho}" height="${tamanho}" viewBox="0 0 22 22" aria-hidden="true" focusable="false">${forma}</svg>`;
}

// ---------- Mapa ----------
function opcoesMapa(extra = {}) {
  return {
    preferCanvas: true,
    zoomAnimation: !REDUZ_MOVIMENTO,
    fadeAnimation: !REDUZ_MOVIMENTO,
    markerZoomAnimation: !REDUZ_MOVIMENTO,
    ...extra,
  };
}

function camadaBase(mapa, cfg) {
  // Aberto direto do arquivo (file://), o navegador não informa a origem e o servidor de mapas
  // bloqueia as imagens. Em vez de mostrar imagens de erro, mostra só contorno e pontos, com um aviso.
  if (DEMO && location.protocol === 'file:') {
    const Aviso = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd() {
        const div = L.DomUtil.create('div', 'aviso-caixa aviso-mapa');
        div.innerHTML = '<strong>Mapa de fundo indisponível</strong> ao abrir o arquivo direto. '
          + 'Para ver o mapa completo, use <strong>abrir-demonstracao.cmd</strong> nesta pasta ou o link publicado.';
        return div;
      },
    });
    new Aviso().addTo(mapa);
    return;
  }
  L.tileLayer(cfg.mapa.url, {
    maxZoom: 19,
    attribution: cfg.mapa.atribuicao,
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(mapa);
}

// ---------- Limite do município (IBGE) ----------
let LIMITE_GEO = null;

function dentroDoAnel(lng, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Mesma regra do servidor. Se o contorno não carregou, deixa o servidor decidir.
function dentroDaCidade(lat, lng) {
  if (!LIMITE_GEO) return true;
  return LIMITE_GEO.coordinates.some(([externo, ...buracos]) =>
    dentroDoAnel(lng, lat, externo) && !buracos.some((b) => dentroDoAnel(lng, lat, b)));
}

// Restringe o mapa ao município: escurece o que fica fora, desenha o contorno
// e impede arrastar ou afastar para longe.
async function limitarMapa(mapa) {
  try {
    if (!LIMITE_GEO) LIMITE_GEO = await api(`/api/limite?cidade=${CONFIG ? CONFIG.cidade.slug : ''}`);
  } catch {
    return null;
  }
  const pane = mapa.createPane('mascara');
  pane.style.zIndex = 350;
  pane.style.pointerEvents = 'none';

  const mundo = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
  const recortes = LIMITE_GEO.coordinates.map((pol) => pol[0].map(([lng, lat]) => [lat, lng]));
  L.polygon([mundo, ...recortes], {
    pane: 'mascara', stroke: false, fillColor: '#1a1a1a', fillOpacity: 0.4, interactive: false,
  }).addTo(mapa);
  const contorno = L.geoJSON(LIMITE_GEO, {
    pane: 'mascara', interactive: false,
    style: { color: '#0b5cad', weight: 3, opacity: 0.9, fill: false, dashArray: '8 6' },
  }).addTo(mapa);

  const limites = contorno.getBounds();
  mapa.setMaxBounds(limites.pad(0.1));
  mapa.options.maxBoundsViscosity = 1.0;
  mapa.setMinZoom(mapa.getBoundsZoom(limites.pad(0.05)));
  return limites;
}

if (window.L) {
  // Marcador quadrado desenhado no canvas (ruas sem asfalto).
  L.Canvas.include({
    _updateQuadrado(layer) {
      if (!this._drawing || layer._empty()) return;
      const p = layer._point;
      const r = Math.max(Math.round(layer._radius), 1) * 0.9;
      const ctx = this._ctx;
      ctx.beginPath();
      ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      this._fillStroke(ctx, layer);
    },
  });
  window.MarcadorQuadrado = L.CircleMarker.extend({
    _updatePath() {
      this._renderer._updateQuadrado(this);
    },
  });
}

// O tamanho acompanha o zoom: com a cidade inteira na tela, pontos menores mostram onde há mais concentração.
function estiloPonto(p, zoom = 16) {
  const confirmado = p.verificacao === 'confirmado' || p.final;
  const base = zoom >= 16 ? 10 : zoom >= 15 ? 8 : zoom >= 14 ? 6 : 4.5;
  return {
    interactive: false, // o toque é tratado pelo mapa, com área maior (ver app.js)
    radius: confirmado ? base : base * 0.8,
    color: confirmado ? '#ffffff' : '#1a1a1a',
    weight: zoom >= 14 ? (confirmado ? 2 : 1.5) : 1,
    fillColor: corVar(`--st-${categoria(p)}`),
    fillOpacity: confirmado ? 0.95 : 0.5,
    dashArray: confirmado ? null : '3 2',
  };
}

function criarMarcador(p, zoom) {
  const o = estiloPonto(p, zoom);
  return p.tipo === 'rua_sem_asfalto' ? new MarcadorQuadrado([p.lat, p.lng], o) : L.circleMarker([p.lat, p.lng], o);
}

// ---------- Copiar link ----------
// Só copia; a pessoa decide se e por onde envia. Retorna true se conseguiu.
async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* tenta o método antigo */ }
  // Alternativa para endereços sem HTTPS (ex.: teste na rede local).
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  campo.setSelectionRange(0, texto.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  campo.remove();
  return ok;
}
