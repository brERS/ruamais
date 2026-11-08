// Modo simulação: gera pontos fictícios no navegador para mostrar o site em uso.
// Nada é enviado ao servidor nem gravado no banco.
const Simulacao = (() => {
  const CENARIOS = {
    lancamento: { rotulo: 'Lançamento (≈40 pontos)', total: 40 },
    moderado: { rotulo: 'Uso moderado (≈300 pontos)', total: 300 },
    intenso: { rotulo: 'Uso intenso (≈1.500 pontos)', total: 1500 },
  };

  // Área urbana e focos de concentração vêm da configuração da cidade (cfg.simulacao), calculados
  // no servidor a partir dos bairros mais próximos do centro. peso = fração dos pontos;
  // rua = chance de ser rua sem asfalto. O restante (~30%) fica espalhado, formando áreas pouco densas.
  let AREA = { sul: 0, norte: 0, oeste: 0, leste: 0 };
  let FOCOS = [];

  function configurar(cfg) {
    const s = cfg && cfg.simulacao;
    if (s && s.area) {
      AREA = s.area;
      FOCOS = s.focos || [];
    } else if (cfg && cfg.centro) {
      const [lat, lng] = cfg.centro;
      AREA = { sul: lat - 0.03, norte: lat + 0.03, oeste: lng - 0.035, leste: lng + 0.035 };
      FOCOS = [{ lat, lng, sd: 0.004, peso: 0.4, rua: 0.2 }];
    }
  }

  function limites(cfg) {
    configurar(cfg);
    return [[AREA.sul, AREA.oeste], [AREA.norte, AREA.leste]];
  }

  // Setores fictícios (grade 4 x 5) para a visão de bairros pintados.
  const LINHAS = 4;
  const COLUNAS = 5;
  const LETRAS = 'ABCD';

  const DIA = 864e5;
  const cache = {};

  function rngDe(semente) {
    let a = 0;
    for (const c of semente) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 7) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    const u = rng() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

  function setorDe(lat, lng) {
    const l = limitar(Math.floor(((lat - AREA.sul) / (AREA.norte - AREA.sul)) * LINHAS), 0, LINHAS - 1);
    const c = limitar(Math.floor(((lng - AREA.oeste) / (AREA.leste - AREA.oeste)) * COLUNAS), 0, COLUNAS - 1);
    return `Setor ${LETRAS[LINHAS - 1 - l]}${c + 1} (fictício)`;
  }

  function setoresGeoJSON() {
    const dLat = (AREA.norte - AREA.sul) / LINHAS;
    const dLng = (AREA.leste - AREA.oeste) / COLUNAS;
    const fs = [];
    for (let l = 0; l < LINHAS; l++) {
      for (let c = 0; c < COLUNAS; c++) {
        const s = AREA.sul + l * dLat;
        const o = AREA.oeste + c * dLng;
        fs.push({
          type: 'Feature',
          nome: setorDe(s + dLat / 2, o + dLng / 2),
          geometry: { type: 'Polygon', coordinates: [[[o, s], [o + dLng, s], [o + dLng, s + dLat], [o, s + dLat], [o, s]]] },
        });
      }
    }
    return fs;
  }

  // Mesma regra do servidor (src/dominio.js).
  function gravidade(tipo, at = {}) {
    if (tipo === 'buraco') {
      let g = { pequeno: 1, grande: 2, cratera: 3 }[at.tamanho] || 1;
      if ((at.risco || []).includes('acidente')) g += 1;
      if ((at.risco || []).includes('pedestre')) g += 0.5;
      return g;
    }
    return 1 + 0.5 * (at.acesso || []).length + 0.5 * (at.proximo || []).length + 0.25 * (at.problemas || []).length;
  }

  // Mesma regra da view pontos_resumo.
  function verificacaoDe(p) {
    if (p.negacoes >= 3 && p.negacoes > p.confirmacoes) return 'em_verificacao';
    if (p.confirmacoes >= 3) return 'confirmado';
    return 'nao_confirmado';
  }

  function sortearAtributos(def, rng) {
    const at = {};
    for (const [campo, c] of Object.entries(def)) {
      const vals = Object.keys(c.valores);
      if (c.modo === 'um') {
        // Valores mais leves são mais comuns.
        at[campo] = vals[Math.min(vals.length - 1, Math.floor(rng() ** 1.6 * vals.length))];
      } else {
        const escolhidos = vals.filter(() => rng() < 0.3);
        if (escolhidos.length) at[campo] = escolhidos;
      }
    }
    return at;
  }

  function rotuloStatus(cfg, tipo, s) {
    const x = cfg.status[tipo].find(([id]) => id === s);
    return x ? x[1] : s;
  }

  function gerar(cfg, cenario) {
    if (!CENARIOS[cenario]) cenario = 'moderado';
    if (cache[cenario]) return cache[cenario];
    configurar(cfg);
    const rng = rngDe(cenario);
    const agora = Date.now();
    const pontos = [];

    for (let i = 0; i < CENARIOS[cenario].total; i++) {
      let lat;
      let lng;
      let chanceRua = 0.4;
      let foco = null;
      const r = rng();
      let acum = 0;
      for (const f of FOCOS) {
        acum += f.peso;
        if (r < acum) {
          foco = f;
          break;
        }
      }
      if (foco) {
        lat = foco.lat + gauss(rng) * foco.sd;
        lng = foco.lng + gauss(rng) * foco.sd;
        chanceRua = foco.rua;
      } else {
        lat = AREA.sul + rng() * (AREA.norte - AREA.sul);
        lng = AREA.oeste + rng() * (AREA.leste - AREA.oeste);
      }
      lat = limitar(lat, AREA.sul, AREA.norte);
      lng = limitar(lng, AREA.oeste, AREA.leste);

      const tipo = rng() < chanceRua ? 'rua_sem_asfalto' : 'buraco';
      const atributos = sortearAtributos(cfg.opcoes[tipo], rng);
      const criado = agora - Math.floor(rng() ** 1.5 * 365) * DIA - rng() * DIA;

      // Focos densos recebem mais confirmações.
      const confirmacoes = Math.floor(rng() ** 2 * (foco ? 14 : 6));
      const negacoes = rng() < 0.05 ? 3 + Math.floor(rng() * 4) : rng() < 0.3 ? 1 : 0;

      const lista = cfg.status[tipo].map(([s]) => s);
      let idx = 0;
      if (confirmacoes >= 3) {
        const s = rng();
        const chanceFinal = tipo === 'buraco' ? 0.2 : 0.05;
        if (s < chanceFinal) idx = lista.length - 1;
        else if (s < chanceFinal + 0.4) idx = 1 + Math.floor(rng() * (lista.length - 2));
      }
      const status = lista[idx];
      const final = idx === lista.length - 1;

      const inicioObra = idx > 0 ? Math.min(agora, criado + (5 + rng() * 60) * DIA) : null;
      const resolvido = final ? Math.min(agora, inicioObra + (1 + rng() * 30) * DIA) : null;

      const p = {
        id: i + 1,
        simulado: true,
        tipo,
        atributos,
        status,
        inicio_obra: inicioObra ? new Date(inicioObra).toISOString() : null,
        resolvido_em: resolvido ? new Date(resolvido).toISOString() : null,
        removido: false,
        criado_em: new Date(criado).toISOString(),
        lat,
        lng,
        confirmacoes,
        negacoes,
        contestacoes: final && rng() < 0.15 ? 1 + Math.floor(rng() * 4) : 0,
        bairro: setorDe(lat, lng),
        indice_status: idx,
        rotulo_tipo: cfg.tipos[tipo],
        rotulo_status: rotuloStatus(cfg, tipo, status),
        gravidade: gravidade(tipo, atributos),
        final,
      };
      p.verificacao = verificacaoDe(p);
      pontos.push(p);
    }
    cache[cenario] = pontos;
    return pontos;
  }

  function historico(cfg, p) {
    const h = [{ acao: 'criado', criado_em: p.criado_em, autor: 'Morador', detalhes: {} }];
    const lista = cfg.status[p.tipo].map(([s]) => s);
    for (let i = 1; i <= p.indice_status; i++) {
      const quando = i === lista.length - 1 ? p.resolvido_em : p.inicio_obra;
      h.push({ acao: 'status', para_status: lista[i], criado_em: quando, autor: 'Administração', detalhes: {} });
    }
    return h;
  }

  // Registra um voto só na memória da página.
  function votar(p, tipo) {
    if (tipo === 'confirma') p.confirmacoes++;
    else if (tipo === 'nega') p.negacoes++;
    else p.contestacoes++;
    p.verificacao = verificacaoDe(p);
  }

  function filtrar(pontos, { tipo, situacao, dias }) {
    const desde = Number(dias) > 0 ? Date.now() - Number(dias) * DIA : 0;
    return pontos.filter((p) => p.verificacao === 'confirmado'
      && (!tipo || p.tipo === tipo)
      && (situacao !== 'abertos' || !p.final)
      && (situacao !== 'resolvidos' || p.final)
      && new Date(p.criado_em).getTime() >= desde);
  }

  // Mesmo formato de /api/relatorios/calor.
  function calor(pontos, q) {
    return filtrar(pontos, q).map((p) => [p.lat, p.lng, p.gravidade]);
  }

  // Preenche rua e região reais (calculadas no servidor, sem gravar nada).
  // Se não conseguir, os pontos ficam com os setores fictícios.
  async function enriquecer(cfg, cenario) {
    const pontos = gerar(cfg, cenario);
    if (pontos.enriquecido) return pontos;
    try {
      const r = await api('/api/localizar', { method: 'POST', body: { pontos: pontos.map((p) => [p.lat, p.lng]) } });
      r.forEach((x, i) => {
        pontos[i].rua = x.rua;
        if (x.bairro) pontos[i].bairro = x.bairro;
      });
      pontos.enriquecido = true;
    } catch { /* mantém setores fictícios */ }
    return pontos;
  }

  // Mesmo formato de /api/relatorios/bairros. Com "regioes" (features reais), usa as regiões reais.
  function bairros(pontos, q, regioes) {
    const setores = regioes && regioes.length && pontos.enriquecido
      ? regioes.map((f) => ({ type: 'Feature', nome: f.properties ? f.properties.nome : f.nome, geometry: f.geometry }))
      : setoresGeoJSON();
    const porNome = new Map(setores.map((s) => [s.nome, { nome: s.nome, abertos: 0, resolvidos: 0, peso: 0, ea: [], er: [] }]));
    for (const p of filtrar(pontos, { ...q, situacao: '' })) {
      const s = porNome.get(p.bairro);
      if (!s) continue;
      if (p.final) s.resolvidos++;
      else {
        s.abertos++;
        s.peso += p.gravidade;
      }
      const dias = (new Date(p.resolvido_em || Date.now()) - new Date(p.criado_em)) / DIA;
      (p.final ? s.er : s.ea).push(dias);
    }
    const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const ranking = [...porNome.values()]
      .map((s) => ({
        nome: s.nome,
        abertos: s.abertos,
        resolvidos: s.resolvidos,
        peso_aberto: Math.round(s.peso * 10) / 10,
        espera_media_abertos_dias: media(s.ea),
        espera_media_resolvidos_dias: media(s.er),
      }))
      .sort((a, b) => b.peso_aberto - a.peso_aberto || a.nome.localeCompare(b.nome));
    const porBairro = new Map(ranking.map((r) => [r.nome, r]));
    return {
      ranking,
      tem_contornos: true,
      aproximado: !!(regioes && regioes.length && pontos.enriquecido),
      geojson: {
        type: 'FeatureCollection',
        features: setores.map((s, i) => ({ type: 'Feature', id: i + 1, geometry: s.geometry, properties: porBairro.get(s.nome) })),
      },
    };
  }

  // Cenário escolhido na URL (?simulacao=moderado), ou null.
  // Na demonstração estática há sempre um cenário (não existem dados reais).
  function cenarioDaUrl() {
    const c = new URLSearchParams(location.search).get('simulacao');
    if (c && CENARIOS[c]) return c;
    return window.MODO_DEMO ? 'moderado' : null;
  }

  // Cria um ponto só na memória da página (usado na demonstração).
  function criar(cfg, cenario, { tipo, lat, lng, atributos }) {
    const pontos = gerar(cfg, cenario);
    const status = cfg.status_inicial[tipo];
    const p = {
      id: pontos.reduce((m, x) => Math.max(m, x.id), 0) + 1,
      simulado: true, tipo, atributos, status,
      inicio_obra: null, resolvido_em: null, removido: false,
      criado_em: new Date().toISOString(), lat, lng,
      confirmacoes: 0, negacoes: 0, contestacoes: 0,
      bairro: null, rua: null, indice_status: 0,
      rotulo_tipo: cfg.tipos[tipo], rotulo_status: rotuloStatus(cfg, tipo, status),
      gravidade: gravidade(tipo, atributos), final: false,
    };
    p.verificacao = verificacaoDe(p);
    pontos.push(p);
    return p;
  }

  function definirNaUrl(cenario) {
    const u = new URL(location.href);
    if (cenario) u.searchParams.set('simulacao', cenario);
    else u.searchParams.delete('simulacao');
    history.replaceState(null, '', u);
  }

  return { CENARIOS, limites, gerar, enriquecer, criar, historico, votar, calor, bairros, cenarioDaUrl, definirNaUrl };
})();
