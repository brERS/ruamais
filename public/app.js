// Página principal: mapa e lista de pontos, marcação de problemas e votos.
(async function () {
  const $ = (id) => document.getElementById(id);
  let cfg;
  try {
    cfg = await carregarConfig();
  } catch (e) {
    aviso(e.message, true);
    return;
  }

  const painel = $('painel');
  const btnMarcar = $('btn-marcar');
  const chkVerif = $('chk-verif');
  const AVISO_PRIVACIDADE = 'Este site não pede nem guarda seu nome, e-mail ou telefone. Guardamos só o local do problema marcado e um código aleatório no seu navegador.';

  // ---------- Mapa ----------
  const mapa = L.map('mapa', opcoesMapa({ zoomControl: false })).setView(cfg.centro, cfg.zoom || 14);
  L.control.zoom({ position: 'topright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);
  camadaBase(mapa, cfg);
  await limitarMapa(mapa);
  const camada = L.layerGroup().addTo(mapa);

  const ICONE_GPS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2"/></svg>';
  const ICONE_LEGENDA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="3.5" fill="#d55e00"/><rect x="2.5" y="14" width="7" height="7" fill="#0072b2"/><path d="M13 6h9M13 17.5h9" stroke="currentColor" stroke-width="2.4"/></svg>';
  const Botoes = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar controles-extra');
      div.innerHTML = `
        <button type="button" id="btn-gps" aria-label="Mostrar no mapa onde estou" title="Onde estou">${ICONE_GPS}</button>
        <button type="button" id="btn-legenda" aria-label="Legenda" title="Legenda" aria-expanded="false" aria-controls="legenda">${ICONE_LEGENDA}</button>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
  });
  new Botoes().addTo(mapa);

  let pontos = [];
  let simulacao = Simulacao.cenarioDaUrl();
  const votosSimulados = new Set();
  let modo = 'mapa';
  let marcando = null; // { local, tipo, atributos }
  let marcadorLocal = null;
  let focoAnterior = null;
  let limiteLista = 30;

  // Votos já dados neste navegador (mostra "Você já respondeu").
  const meusVotos = (() => {
    try { return JSON.parse(localStorage.getItem('votos') || '{}'); } catch { return {}; }
  })();
  function lembrarVoto(id, tipo) {
    (meusVotos[id] = meusVotos[id] || []).push(tipo);
    try { localStorage.setItem('votos', JSON.stringify(meusVotos)); } catch { /* sem armazenamento */ }
  }
  const jaVotou = (id, tipo) =>
    simulacao ? votosSimulados.has(`${simulacao}:${id}:${tipo}`) : (meusVotos[id] || []).includes(tipo);

  async function carregarPontos() {
    if (simulacao) {
      pontos = await Simulacao.enriquecer(cfg, simulacao);
    } else {
      try {
        pontos = await api('/api/pontos');
      } catch (e) {
        aviso(e.message, true);
      }
    }
    desenhar();
  }

  // ---------- Pontos que acompanho ----------
  // Guardado só neste navegador: os pontos que a pessoa marcou ou confirmou e a última situação vista.
  // Assim ela fica sabendo quando algo mudou, sem login e sem dados pessoais.
  const acompanho = (() => {
    try { return JSON.parse(localStorage.getItem('acompanho') || '{}'); } catch { return {}; }
  })();
  function salvarAcompanho() {
    try { localStorage.setItem('acompanho', JSON.stringify(acompanho)); } catch { /* sem armazenamento */ }
  }
  function acompanhar(p) {
    if (simulacao || !p) return;
    acompanho[p.id] = p.status;
    salvarAcompanho();
  }

  // Retorna os pontos acompanhados que mudaram de situação desde a última visita.
  function novidades() {
    if (simulacao) return [];
    const mudaram = [];
    for (const [id, visto] of Object.entries(acompanho)) {
      const p = pontos.find((x) => x.id === Number(id));
      if (p && p.status !== visto) {
        mudaram.push(p);
        acompanho[id] = p.status;
      }
    }
    if (mudaram.length) salvarAcompanho();
    return mudaram;
  }

  function mostrarAcompanhados(titulo = 'Pontos que acompanho', lista = null, texto = '') {
    const itens = lista || pontos.filter((p) => acompanho[p.id] !== undefined);
    abrirPainel(`
      ${cabecalho(titulo)}
      ${texto ? `<p>${texto}</p>` : ''}
      ${itens.length
        ? `<ul class="lista-itens">${itens.map((p) => itemPonto(p)).join('')}</ul>`
        : '<p>Você ainda não marcou nem confirmou nenhum ponto neste aparelho. Quando fizer isso, eles aparecem aqui e você fica sabendo quando a situação mudar.</p>'}
      <p class="suave">Esta lista fica só neste aparelho.</p>`);
    ligarItens(painel, { centralizar: true });
  }

  const visiveis = () => pontos.filter((p) => chkVerif.checked || p.verificacao !== 'em_verificacao');

  function desenhar() {
    camada.clearLayers();
    const zoom = mapa.getZoom();
    for (const p of visiveis()) criarMarcador(p, zoom).addTo(camada);
    if (modo === 'lista') renderLista();
  }

  let zoomAnterior = mapa.getZoom();
  mapa.on('zoomend', () => {
    const z = mapa.getZoom();
    const faixa = (x) => (x >= 16 ? 3 : x >= 15 ? 2 : x >= 14 ? 1 : 0);
    if (faixa(z) !== faixa(zoomAnterior)) desenhar();
    zoomAnterior = z;
  });

  // Garante que o ponto aberto não fique escondido atrás do painel.
  function mostrarAcimaDoPainel(latlng) {
    if (painel.hidden) return;
    const tam = mapa.getSize();
    const pt = mapa.latLngToContainerPoint(latlng);
    let dx = 0;
    let dy = 0;
    if (window.innerWidth >= 760) {
      const livre = tam.x - painel.offsetWidth - 24;
      if (pt.x > livre - 30) dx = pt.x - livre / 2;
    } else {
      const livre = tam.y - painel.offsetHeight;
      if (pt.y > livre - 30 || pt.y < 70) dy = pt.y - Math.max(90, livre / 2 + 30);
    }
    if (dx || dy) mapa.panBy([dx, dy], { animate: !REDUZ_MOVIMENTO });
  }

  // Toque com área generosa (24 px). Se houver vários pontos juntos, pergunta qual.
  mapa.on('click', (e) => {
    if (marcando) return;
    const c = e.containerPoint;
    const perto = visiveis()
      .map((p) => ({ p, d: mapa.latLngToContainerPoint([p.lat, p.lng]).distanceTo(c) }))
      .filter((x) => x.d <= 24)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
    if (perto.length === 1) abrirPonto(perto[0].id);
    else if (perto.length > 1) escolherPonto(perto);
  });

  // O GPS só centraliza o mapa. A localização da pessoa nunca é enviada ao servidor.
  $('btn-gps').addEventListener('click', () => {
    if (!navigator.geolocation) return aviso('Seu aparelho não informa a localização. Mova o mapa com o dedo.', true);
    aviso('Buscando sua localização…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapa.setView([pos.coords.latitude, pos.coords.longitude], 18, { animate: !REDUZ_MOVIMENTO });
        aviso('Mapa centralizado onde você está.');
      },
      () => aviso('Não foi possível obter sua localização. Mova o mapa com o dedo.', true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // ---------- Legenda ----------
  $('legenda-conteudo').innerHTML = `
    <ul>
      <li>${simboloSVG('buraco', 'aberto')} Círculo: buraco</li>
      <li>${simboloSVG('rua_sem_asfalto', 'aberto')} Quadrado: rua sem asfalto</li>
    </ul>
    <ul>
      ${Object.entries(ROTULO_CATEGORIA).map(([c, r]) => `<li>${simboloSVG('buraco', c)} ${esc(r)}</li>`).join('')}
      <li>${simboloSVG('buraco', 'aberto', 22, false)} Claro e tracejado: ainda não confirmado</li>
    </ul>
    <ul>
      <li><svg class="simbolo" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false"><path d="M1 11h20" stroke="#0b5cad" stroke-width="3" stroke-dasharray="5 3"/></svg> Limite do município (IBGE)</li>
    </ul>`;
  const btnLegenda = $('btn-legenda');
  btnLegenda.addEventListener('click', () => alternarLegenda());
  function alternarLegenda(abrir = $('legenda').hidden) {
    $('legenda').hidden = !abrir;
    btnLegenda.setAttribute('aria-expanded', String(abrir));
  }

  // ---------- Menu ----------
  const btnMenu = $('btn-menu');
  function alternarMenu(abrir = $('menu').hidden) {
    $('menu').hidden = !abrir;
    btnMenu.setAttribute('aria-expanded', String(abrir));
    if (abrir) $('menu').querySelector('a, button, input').focus();
  }
  btnMenu.addEventListener('click', () => alternarMenu());
  document.addEventListener('click', (e) => {
    if (!$('menu').hidden && !$('menu').contains(e.target) && !btnMenu.contains(e.target)) alternarMenu(false);
  });
  $('menu-como').addEventListener('click', () => {
    alternarMenu(false);
    mostrarComoFunciona();
  });
  $('menu-sim').addEventListener('click', () => {
    alternarMenu(false);
    aplicarSimulacao(simulacao ? null : 'moderado');
  });
  chkVerif.addEventListener('change', desenhar);
  const chkLetra = $('chk-letra');
  chkLetra.checked = document.documentElement.classList.contains('letra-maior');
  chkLetra.addEventListener('change', () => {
    aplicarLetraMaior(chkLetra.checked);
    mapa.invalidateSize();
  });

  // Esc fecha o que estiver aberto, do mais recente para o mais antigo.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('menu').hidden) { alternarMenu(false); btnMenu.focus(); }
    else if (!$('legenda').hidden) { alternarLegenda(false); btnLegenda.focus(); }
    else if (!painel.hidden) fecharPainel();
    else if (marcando) cancelarMarcacao();
  });

  // ---------- Painel ----------
  function cabecalho(titulo, { voltar = false } = {}) {
    return `<div class="alca" aria-hidden="true"></div>
      <div class="painel-topo">
        ${voltar ? '<button type="button" class="voltar" data-voltar><span aria-hidden="true">←</span> Voltar</button>' : ''}
        <h2 id="painel-titulo" tabindex="-1">${titulo}</h2>
        <button type="button" class="fechar" data-fechar aria-label="Fechar">✕</button>
      </div>`;
  }

  function abrirPainel(html) {
    if (painel.hidden) focoAnterior = document.activeElement;
    painel.innerHTML = html;
    painel.hidden = false;
    painel.scrollTop = 0;
    painel.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fecharPainel));
    atualizarBotoes();
    const t = $('painel-titulo');
    if (t) t.focus({ preventScroll: true });
  }

  function esconderPainel() {
    painel.hidden = true;
    painel.innerHTML = '';
    atualizarBotoes();
  }

  function fecharPainel() {
    esconderPainel();
    if (marcando) cancelarMarcacao(false);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (focoAnterior && document.contains(focoAnterior) && focoAnterior !== document.body) focoAnterior.focus();
    focoAnterior = null;
  }

  function aoVoltar(fn) {
    const b = painel.querySelector('[data-voltar]');
    if (b) b.addEventListener('click', fn);
  }

  function atualizarBotoes() {
    btnMarcar.hidden = (!!simulacao && !DEMO) || !!marcando || !painel.hidden;
    $('segmentado').hidden = !!marcando;
  }

  // ---------- Detalhe do ponto ----------
  function textoVoto(p, tipo) {
    if (tipo === 'confirma') {
      return p.tipo === 'buraco' ? 'Confirmo: o buraco está aqui' : 'Confirmo: moro ou passo sempre por esta rua';
    }
    if (tipo === 'nega') return p.tipo === 'buraco' ? 'Não tem buraco aqui' : 'Esta rua não está assim';
    return p.tipo === 'buraco' ? 'Ainda não foi consertado' : 'Ainda não foi pavimentada';
  }

  const rotuloStatus = (tipo, s) => ((cfg.status[tipo] || []).find(([id]) => id === s) || [s, s])[1];

  async function abrirPonto(id, { centralizar = false } = {}) {
    let p;
    if (simulacao) {
      const s = pontos.find((x) => x.id === id);
      if (!s) return;
      p = { ...s, historico: Simulacao.historico(cfg, s) };
    } else {
      try {
        p = await api(`/api/pontos/${id}`);
      } catch (e) {
        return aviso(e.message, true);
      }
    }
    if (centralizar) mapa.setView([p.lat, p.lng], Math.max(mapa.getZoom(), 17), { animate: false });
    history.replaceState(null, '', `${location.pathname}${location.search}#ponto=${p.id}`);

    const cat = categoria(p);
    const detalhes = descreverAtributos(cfg, p.tipo, p.atributos)
      .map((a) => `<dt>${esc(a.rotulo)}</dt><dd>${a.valores.map(esc).join(', ')}</dd>`).join('')
      + (p.rua ? `<dt>Perto de</dt><dd>${esc(p.rua)}</dd>` : '')
      + (p.bairro ? `<dt>Região</dt><dd>${esc(p.bairro)}</dd>` : '')
      + `<dt>Marcado em</dt><dd>${dataBR(p.criado_em)}</dd>`;

    const lista = cfg.status[p.tipo];
    const atual = lista.findIndex(([s]) => s === p.status);
    const datas = { [lista[0][0]]: p.criado_em };
    for (const h of p.historico) if (h.para_status) datas[h.para_status] = h.criado_em;
    const etapas = lista.map(([s, r], i) => {
      const classe = i < atual ? 'feito' : i === atual ? 'atual' : '';
      const marca = i < atual ? '✓' : i === atual ? '●' : '';
      const estado = i < atual ? ' (concluído)' : i === atual ? ' (situação atual)' : '';
      const data = datas[s] && i <= atual ? ` <span class="suave">· ${dataBR(datas[s])}</span>` : '';
      return `<li class="${classe}" ${i === atual ? 'aria-current="step"' : ''}>
        <span class="marca-etapa" aria-hidden="true">${marca}</span>
        <span>${esc(r)}<span class="sr-only">${estado}</span>${data}</span></li>`;
    }).join('');

    const hist = p.historico.map((h) => {
      let t = 'Marcado no mapa';
      if (h.acao === 'status' || h.acao === 'dados') {
        t = `Situação: ${esc(rotuloStatus(p.tipo, h.para_status))}`;
      } else if (h.acao === 'removido') t = 'Removido';
      else if (h.acao === 'restaurado') t = 'Restaurado';
      return `<li>${dataHoraBR(h.criado_em)}: ${t} <span class="suave">(${esc(h.autor)})</span></li>`;
    }).join('');

    const tiposVoto = p.final ? ['contesta'] : ['confirma', 'nega'];
    const botoesVoto = tiposVoto.map((t) => {
      const feito = jaVotou(p.id, t);
      return `<button type="button" class="largo ${t === 'nega' ? '' : 'primario'}" data-voto="${t}" ${feito ? 'disabled' : ''}>
        ${feito ? '✓ Você já respondeu: ' : ''}${esc(textoVoto(p, t))}</button>`;
    }).join('');

    abrirPainel(`
      ${cabecalho(`${simboloSVG(p.tipo, cat, 26)} ${esc(p.rotulo_tipo)}`)}
      ${simulacao ? '<p class="aviso-caixa">Ponto fictício da simulação.</p>' : ''}
      <p class="etiquetas">
        <span class="etiqueta cat-${cat}">${esc(p.rotulo_status)}</span>
        <span class="etiqueta">${ROTULO_VERIFICACAO[p.verificacao]}</span>
      </p>
      <dl class="detalhes">${detalhes}</dl>
      <h3>Andamento</h3>
      <ol class="etapas">${etapas}</ol>
      <h3>${p.final ? 'Continua com problema?' : 'Você conhece este local?'}</h3>
      <p class="suave">${p.confirmacoes} confirmações · ${p.negacoes} negações${p.final ? ` · ${p.contestacoes} contestações` : ''}</p>
      ${p.verificacao === 'nao_confirmado' && !p.final
        ? '<p class="suave">Com 3 confirmações, o ponto passa a aparecer como confirmado.</p>' : ''}
      <div class="pilha">
        ${botoesVoto}
      </div>
      <details>
        <summary>Histórico completo</summary>
        <ul class="historico">${hist}</ul>
      </details>
      ${simulacao ? '' : `<p><button type="button" class="botao-texto" data-copiar>Copiar link deste ponto</button></p>
        <p id="link-manual" hidden><label class="campo">Link deste ponto (copie manualmente)
          <input type="text" readonly value="${esc(`${urlPublica(`/#ponto=${p.id}`)}`)}"></label></p>`}
    `);

    if (modo === 'mapa') mostrarAcimaDoPainel([p.lat, p.lng]);
    painel.querySelectorAll('[data-voto]').forEach((b) => b.addEventListener('click', () => votar(p.id, b.dataset.voto)));
    const bc = painel.querySelector('[data-copiar]');
    if (bc) bc.addEventListener('click', async () => {
      if (await copiarTexto(`${urlPublica(`/#ponto=${p.id}`)}`)) {
        bc.textContent = '✓ Link copiado';
        aviso('Link copiado.');
        setTimeout(() => { bc.textContent = 'Copiar link deste ponto'; }, 3000);
      } else {
        // Se o navegador não deixar copiar, mostra o link para copiar à mão.
        const manual = $('link-manual');
        manual.hidden = false;
        const campo = manual.querySelector('input');
        campo.focus();
        campo.select();
      }
    });
  }

  function itemPonto(p, extra = '') {
    const cat = categoria(p);
    const at = descreverAtributos(cfg, p.tipo, p.atributos)[0];
    const confirmado = p.verificacao === 'confirmado' || p.final;
    return `<li><button type="button" class="item-ponto" data-abrir="${p.id}">
      ${simboloSVG(p.tipo, cat, 26, confirmado)}
      <span class="item-texto">
        <strong>${esc(p.rotulo_tipo)}${at ? ` · ${esc(at.valores.join(', '))}` : ''}</strong>
        ${p.rua || p.bairro ? `<span>${esc([p.rua, p.bairro].filter(Boolean).join(' · '))}</span>` : ''}
        <span>${esc(p.rotulo_status)}${p.final ? '' : ` · ${ROTULO_VERIFICACAO[p.verificacao]} (${p.confirmacoes})`}</span>
      </span>
      ${extra ? `<span class="item-extra">${extra}</span>` : ''}
    </button></li>`;
  }

  function ligarItens(raiz, opcoes) {
    raiz.querySelectorAll('[data-abrir]').forEach((b) =>
      b.addEventListener('click', () => abrirPonto(Number(b.dataset.abrir), opcoes))
    );
  }

  function escolherPonto(lista) {
    abrirPainel(`
      ${cabecalho(`${lista.length} pontos neste lugar`)}
      <p class="suave">Escolha qual você quer ver:</p>
      <ul class="lista-itens">${lista.map((p) => itemPonto(p)).join('')}</ul>`);
    ligarItens(painel);
  }

  async function votar(id, tipo) {
    if (simulacao) {
      Simulacao.votar(pontos.find((x) => x.id === id), tipo);
      votosSimulados.add(`${simulacao}:${id}:${tipo}`);
      aviso('Voto simulado: nada foi salvo.');
      desenhar();
      return abrirPonto(id);
    }
    try {
      await api(`/api/pontos/${id}/votos`, { method: 'POST', body: { tipo } });
      lembrarVoto(id, tipo);
      if (tipo === 'confirma') acompanhar(pontos.find((x) => x.id === id));
      aviso('Obrigado! Sua resposta foi registrada.');
      await carregarPontos();
      abrirPonto(id);
    } catch (e) {
      aviso(e.message, true);
    }
  }

  // ---------- Visão em lista (alternativa acessível ao mapa) ----------
  function definirModo(m) {
    modo = m;
    $('ver-mapa').setAttribute('aria-pressed', String(m === 'mapa'));
    $('ver-lista').setAttribute('aria-pressed', String(m === 'lista'));
    $('lista').hidden = m !== 'lista';
    if (m === 'lista') {
      limiteLista = 30;
      renderLista();
      $('titulo-lista').focus();
    } else {
      mapa.invalidateSize();
    }
  }

  function renderLista() {
    const tipo = $('lf-tipo').value;
    const sit = $('lf-sit').value;
    const centro = mapa.getCenter();
    const itens = visiveis()
      .filter((p) => (!tipo || p.tipo === tipo) && (sit === 'todos' || (sit === 'abertos') !== p.final))
      .map((p) => ({ p, d: centro.distanceTo([p.lat, p.lng]) }))
      .sort((a, b) => a.d - b.d);
    $('lista-resumo').textContent = itens.length
      ? `${itens.length} pontos, do mais perto ao mais longe do centro do mapa.`
      : 'Nenhum ponto com esses filtros.';
    $('lista-itens').innerHTML = itens.slice(0, limiteLista).map(({ p, d }) => itemPonto(p, distanciaTexto(d))).join('');
    $('lista-mais').hidden = itens.length <= limiteLista;
    ligarItens($('lista-itens'), { centralizar: true });
  }

  $('ver-mapa').addEventListener('click', () => definirModo('mapa'));
  $('ver-lista').addEventListener('click', () => definirModo('lista'));
  $('pular-lista').addEventListener('click', (e) => {
    e.preventDefault();
    definirModo('lista');
  });
  $('lf-tipo').addEventListener('change', renderLista);
  $('lf-sit').addEventListener('change', renderLista);
  $('lista-mais').addEventListener('click', () => {
    const antes = limiteLista;
    limiteLista += 30;
    renderLista();
    const novo = $('lista-itens').children[antes];
    if (novo) novo.querySelector('button').focus();
  });

  // ---------- Marcação de novo problema ----------
  const iconeLocal = L.divIcon({
    className: '',
    html: '<svg width="36" height="46" viewBox="0 0 44 56" aria-hidden="true"><path d="M22 2C11 2 2 11 2 22c0 15 20 32 20 32s20-17 20-32C42 11 33 2 22 2z" fill="#0b5cad" stroke="#fff" stroke-width="3"/><circle cx="22" cy="22" r="7" fill="#fff"/></svg>',
    iconSize: [36, 46],
    iconAnchor: [18, 46],
  });

  function mostrarEtapaLocal() {
    if (marcadorLocal) {
      mapa.removeLayer(marcadorLocal);
      marcadorLocal = null;
    }
    esconderPainel();
    $('mira').hidden = false;
    $('dica-local').hidden = false;
    $('acoes-local').hidden = false;
    atualizarBotoes();
    $('dica-local-texto').focus();
  }

  function iniciarMarcacao() {
    if (simulacao && !DEMO) return;
    focoAnterior = btnMarcar;
    definirModo('mapa');
    alternarLegenda(false);
    marcando = { local: null, tipo: null, atributos: {} };
    if (mapa.getZoom() < 17) mapa.setZoom(17, { animate: !REDUZ_MOVIMENTO });
    mostrarEtapaLocal();
  }

  function cancelarMarcacao(anunciar = true) {
    marcando = null;
    if (marcadorLocal) {
      mapa.removeLayer(marcadorLocal);
      marcadorLocal = null;
    }
    $('mira').hidden = true;
    $('dica-local').hidden = true;
    $('acoes-local').hidden = true;
    atualizarBotoes();
    if (anunciar) {
      aviso('Marcação cancelada.');
      btnMarcar.focus();
    }
  }

  $('local-cancelar').addEventListener('click', () => cancelarMarcacao());
  $('local-ok').addEventListener('click', () => {
    const centro = mapa.getCenter();
    if (!dentroDaCidade(centro.lat, centro.lng)) {
      aviso(`Este local fica fora de ${cfg.cidade.nome}. Mova o mapa para dentro da linha azul.`, true);
      return;
    }
    marcando.local = centro;
    $('mira').hidden = true;
    $('dica-local').hidden = true;
    $('acoes-local').hidden = true;
    marcadorLocal = L.marker(marcando.local, { icon: iconeLocal, interactive: false, keyboard: false }).addTo(mapa);
    etapaTipo();
  });

  function etapaTipo() {
    abrirPainel(`
      ${cabecalho('O que tem aqui?', { voltar: true })}
      <p class="passo">Passo 2 de 3</p>
      <div class="pilha">
        <button type="button" class="opcao-grande" data-tipo="buraco">
          ${simboloSVG('buraco', 'aberto', 34)}
          <span><strong>Buraco</strong><span>No asfalto ou no calçamento</span></span>
        </button>
        <button type="button" class="opcao-grande" data-tipo="rua_sem_asfalto">
          ${simboloSVG('rua_sem_asfalto', 'aberto', 34)}
          <span><strong>Rua sem asfalto</strong><span>Terra, cascalho ou calçamento ruim</span></span>
        </button>
      </div>`);
    aoVoltar(mostrarEtapaLocal);
    painel.querySelectorAll('[data-tipo]').forEach((b) =>
      b.addEventListener('click', () => {
        if (marcando.tipo !== b.dataset.tipo) marcando.atributos = {};
        marcando.tipo = b.dataset.tipo;
        etapaDetalhes();
      })
    );
  }

  function etapaDetalhes() {
    const def = cfg.opcoes[marcando.tipo];
    const at = marcando.atributos;
    const grupos = Object.entries(def).map(([campo, c]) => {
      const tipoInput = c.modo === 'um' ? 'radio' : 'checkbox';
      const marcado = (v) => (c.modo === 'um' ? at[campo] === v : (at[campo] || []).includes(v));
      return `
        <fieldset class="grupo-opcoes" id="grupo-${campo}" ${c.obrigatorio ? 'aria-describedby="erro-detalhes"' : ''}>
          <legend>${esc(c.rotulo)} ${c.obrigatorio ? '<span class="suave">(escolha uma)</span>' : '<span class="suave">(opcional, pode marcar várias)</span>'}</legend>
          <div class="chips">
            ${Object.entries(c.valores).map(([v, r]) => `
              <label class="chip"><input type="${tipoInput}" name="${campo}" value="${v}" ${marcado(v) ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}
          </div>
        </fieldset>`;
    }).join('');

    abrirPainel(`
      ${cabecalho(esc(cfg.tipos[marcando.tipo]), { voltar: true })}
      <p class="passo">Passo 3 de 3</p>
      <form id="form-detalhes" novalidate>
        ${grupos}
        <p id="erro-detalhes" class="erro" hidden></p>
        <button type="submit" class="primario largo">Enviar</button>
        <p class="suave">${AVISO_PRIVACIDADE}</p>
      </form>`);
    aoVoltar(etapaTipo);

    const form = $('form-detalhes');
    const lerForm = () => {
      const fd = new FormData(form);
      const r = {};
      for (const [campo, c] of Object.entries(def)) {
        if (c.modo === 'um') {
          if (fd.get(campo)) r[campo] = fd.get(campo);
        } else if (fd.getAll(campo).length) r[campo] = fd.getAll(campo);
      }
      return r;
    };
    form.addEventListener('change', () => {
      marcando.atributos = lerForm();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      marcando.atributos = lerForm();
      const faltando = Object.entries(def).find(([campo, c]) => c.obrigatorio && !marcando.atributos[campo]);
      const erro = $('erro-detalhes');
      form.querySelectorAll('fieldset').forEach((f) => f.removeAttribute('aria-invalid'));
      if (faltando) {
        const [campo, c] = faltando;
        erro.textContent = `Escolha uma opção em “${c.rotulo}”.`;
        erro.hidden = false;
        $(`grupo-${campo}`).setAttribute('aria-invalid', 'true');
        $(`grupo-${campo}`).querySelector('input').focus();
        return;
      }
      erro.hidden = true;
      verificarProximos();
    });
  }

  // Avisa se já existe um ponto a ~30 m ("É este?").
  async function verificarProximos() {
    const { lat, lng } = marcando.local;
    let perto = [];
    try {
      perto = await api(`/api/pontos/proximos?lat=${lat}&lng=${lng}&raio=30`);
    } catch (e) {
      return aviso(e.message, true);
    }
    if (!perto.length) return enviar();

    abrirPainel(`
      ${cabecalho('Já marcaram algo aqui perto. É o mesmo?', { voltar: true })}
      <p class="suave">Se for o mesmo problema, confirme o ponto que já existe. Assim ele ganha força.</p>
      <ul class="lista-itens">
        ${perto.map((p) => `
          <li class="cartao">
            <p style="margin:0 0 8px"><strong>${esc(p.rotulo_tipo)}</strong>, ${esc(p.rotulo_status)}, a ${p.distancia} m<br>
              <span class="suave">${descreverAtributos(cfg, p.tipo, p.atributos).map((a) => a.valores.map(esc).join(', ')).join(' · ')}</span></p>
            ${p.final || jaVotou(p.id, 'confirma') ? '' : `<button type="button" class="primario largo" data-confirmar="${p.id}">Sim, é este: confirmar</button>`}
          </li>`).join('')}
      </ul>
      <p><button type="button" class="largo" id="outro">Não, é outro problema: enviar novo</button></p>`);
    aoVoltar(etapaDetalhes);
    painel.querySelectorAll('[data-confirmar]').forEach((b) =>
      b.addEventListener('click', () => {
        cancelarMarcacao(false);
        votar(Number(b.dataset.confirmar), 'confirma');
      })
    );
    $('outro').addEventListener('click', enviar);
  }

  async function enviar() {
    const { lat, lng } = marcando.local;
    try {
      const p = await api('/api/pontos', {
        method: 'POST',
        body: { tipo: marcando.tipo, lat, lng, atributos: marcando.atributos },
      });
      cancelarMarcacao(false);
      acompanhar(p);
      await carregarPontos();
      abrirPainel(`
        ${cabecalho('Pronto! Obrigado.')}
        <p>O problema foi marcado no mapa${p.rua ? `, perto de <strong>${esc(p.rua)}</strong>` : ''}.</p>
        <p>Ele aparece como <strong>não confirmado</strong> até 3 pessoas confirmarem.</p>
        ${simulacao ? '' : '<p>Quando a situação dele mudar, você verá um aviso ao abrir o site neste aparelho.</p>'}
        <div class="pilha">
          <button type="button" class="primario largo" id="sucesso-ver">Ver o ponto</button>
          <button type="button" class="largo" data-fechar>Voltar ao mapa</button>
        </div>`);
      $('sucesso-ver').addEventListener('click', () => abrirPonto(p.id, { centralizar: true }));
    } catch (e) {
      aviso(e.message, true);
    }
  }

  btnMarcar.addEventListener('click', iniciarMarcacao);

  // ---------- Como funciona (primeira visita) ----------
  function mostrarComoFunciona() {
    const total = simulacao ? 0 : pontos.length;
    const resolvidos = simulacao ? 0 : pontos.filter((p) => p.final).length;
    abrirPainel(`
      ${cabecalho('Bem-vindo ao RuaMais')}
      <p><strong>O mapa das ruas de ${esc(cfg.cidade.nome)}:</strong> moradores marcam buracos e ruas sem asfalto, confirmam o que outros marcaram e acompanham o que foi resolvido.</p>
      ${total ? `<p><strong>Até agora:</strong> ${total} ${total === 1 ? 'problema marcado' : 'problemas marcados'}, ${resolvidos} ${resolvidos === 1 ? 'resolvido' : 'resolvidos'}.</p>` : ''}
      <ol class="pilha" style="padding-left:1.2em">
        <li>Toque em <strong>Marcar problema</strong> e mova o mapa até o pino ficar em cima do buraco ou da rua sem asfalto.</li>
        <li>Escolha o tipo e as opções. <strong>Não precisa escrever nada.</strong></li>
        <li>Confirme os pontos que outras pessoas marcaram. Com 3 confirmações, o ponto passa a aparecer como confirmado.</li>
        <li>Acompanhe o andamento de cada ponto até ser resolvido.</li>
      </ol>
      <p class="selo-neutro"><strong>Site neutro:</strong>
        <span>não apoia partido, candidato nem governo, não aceita logo de partido nem patrocínio, e os dados ficam abertos para todos igualmente.
        <a href="${rota('/privacidade#neutralidade')}">Ler a regra</a></span></p>
      <p class="aviso-caixa">${AVISO_PRIVACIDADE}</p>
      <p class="suave">Prefere sem mapa? Use o botão <strong>Lista</strong> no alto da tela.</p>
      <button type="button" class="primario largo" data-fechar>Entendi</button>`);
    painel.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => {
      try { localStorage.setItem('viu-intro', '1'); } catch { /* sem armazenamento */ }
    }));
  }

  // ---------- Simulação ----------
  const faixa = $('faixa-sim');
  const selSim = $('sel-sim');
  selSim.innerHTML = Object.entries(Simulacao.CENARIOS)
    .map(([id, c]) => `<option value="${id}">${esc(c.rotulo)}</option>`)
    .join('');

  async function aplicarSimulacao(cenario) {
    if (marcando) cancelarMarcacao(false);
    if (!painel.hidden) esconderPainel();
    simulacao = cenario;
    Simulacao.definirNaUrl(cenario);
    faixa.hidden = !cenario;
    $('menu-sim').textContent = cenario ? 'Sair da simulação' : 'Ver simulação do site em uso';
    $('link-calor').href = rota(cenario ? `/calor?simulacao=${cenario}` : '/calor');
    atualizarBotoes();
    if (cenario) {
      selSim.value = cenario;
      mapa.fitBounds(Simulacao.limites(cfg));
      if (!DEMO) aviso('Simulação ligada: os pontos são fictícios.');
    } else {
      aviso('Simulação desligada.');
    }
    await carregarPontos();
    mapa.invalidateSize();
  }

  selSim.addEventListener('change', () => aplicarSimulacao(selSim.value));
  $('sair-sim').addEventListener('click', () => aplicarSimulacao(null));

  // Na demonstração estática não existem dados reais: não há como sair da simulação.
  if (DEMO) {
    $('sair-sim').hidden = true;
    $('menu-sim').closest('li').hidden = true;
    faixa.querySelector('span').innerHTML = '<strong>Demonstração:</strong> pontos fictícios, nada é salvo.';
  }

  // ---------- Início ----------
  if (simulacao) await aplicarSimulacao(simulacao);
  else await carregarPontos();

  $('menu-meus').addEventListener('click', () => {
    alternarMenu(false);
    mostrarAcompanhados();
  });
  $('link-relatorio').addEventListener('click', () => {
    $('link-relatorio').href = rota(simulacao ? `/relatorio?simulacao=${simulacao}` : '/relatorio');
  });

  const mudaram = novidades();
  const m = location.hash.match(/ponto=(\d+)/);
  if (m) {
    abrirPonto(Number(m[1]), { centralizar: true });
  } else if (mudaram.length) {
    const resolvidos = mudaram.filter((p) => p.final).length;
    mostrarAcompanhados(
      'Novidades',
      mudaram,
      resolvidos
        ? `${resolvidos === 1 ? 'Um ponto que você acompanha foi resolvido' : `${resolvidos} pontos que você acompanha foram resolvidos`}. Obrigado por ajudar!`
        : 'A situação de pontos que você acompanha mudou desde a sua última visita.'
    );
  } else {
    let viu = false;
    try { viu = localStorage.getItem('viu-intro') === '1'; } catch { /* sem armazenamento */ }
    if (!viu && !simulacao) mostrarComoFunciona();
  }
})();
