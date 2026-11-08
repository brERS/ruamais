// Aba de mapa de calor: mancha de calor ou bairros pintados, com ranking e tempo de espera.
(async function () {
  const $ = (id) => document.getElementById(id);
  let cfg;
  try {
    cfg = await carregarConfig();
  } catch (e) {
    aviso(e.message, true);
    return;
  }
  const mapa = L.map('mapa-calor', opcoesMapa()).setView(cfg.centro, 13);
  camadaBase(mapa, cfg);
  await limitarMapa(mapa);
  let camada = null;
  let ultimaSim = null;

  const filtros = ['f-dados', 'f-tipo', 'f-situacao', 'f-dias', 'f-visao'].map($);
  document.querySelector('form.filtros').addEventListener('submit', (e) => e.preventDefault());

  // Opções de simulação (dados fictícios gerados no navegador).
  $('f-dados').insertAdjacentHTML('beforeend', Object.entries(Simulacao.CENARIOS)
    .map(([id, c]) => `<option value="${id}">Simulação: ${esc(c.rotulo)}</option>`).join(''));
  if (DEMO) $('f-dados').querySelector('option[value=""]').remove(); // demonstração: só simulação
  $('f-dados').value = Simulacao.cenarioDaUrl() || '';

  // Escala sequencial (claro → escuro): a intensidade também é dada pelo valor na tabela.
  const ESCALA = ['#fff5eb', '#fdd0a2', '#fd8d3c', '#d94801', '#7f2704'];
  function corPorValor(v, max) {
    if (!v || !max) return '#f0f0f0';
    const i = Math.min(ESCALA.length - 1, Math.floor((v / max) * (ESCALA.length - 1) + 0.0001));
    return ESCALA[i];
  }

  const dias = (v) => (v == null ? '—' : `${String(v).replace('.', ',')} dias`);
  const num = (v) => String(v).replace('.', ',');

  async function atualizar() {
    const q = new URLSearchParams({ tipo: $('f-tipo').value, situacao: $('f-situacao').value, dias: $('f-dias').value });
    const visao = $('f-visao').value;
    const sim = $('f-dados').value || null;
    $('f-situacao').disabled = visao === 'bairros';
    Simulacao.definirNaUrl(sim);
    $('faixa-sim').hidden = !sim;
    for (const id of ['link-mapa', 'link-mapa-2']) $(id).href = rota(sim ? `/?simulacao=${sim}` : '/');
    try {
      let pts;
      let bairros;
      if (sim) {
        const filtro = Object.fromEntries(q);
        const todos = await Simulacao.enriquecer(cfg, sim);
        const reais = await api('/api/relatorios/bairros').catch(() => null);
        pts = Simulacao.calor(todos, filtro);
        bairros = Simulacao.bairros(todos, filtro, reais && reais.geojson.features);
      } else {
        [pts, bairros] = await Promise.all([api(`/api/relatorios/calor?${q}`), api(`/api/relatorios/bairros?${q}`)]);
      }
      if (sim && sim !== ultimaSim) mapa.fitBounds(Simulacao.limites(cfg));
      ultimaSim = sim;
      if (camada) mapa.removeLayer(camada);
      camada = null;
      const vazio = $('vazio');
      vazio.hidden = true;
      $('escala').innerHTML = '';

      if (visao === 'mancha') {
        camada = L.heatLayer(pts, { radius: 28, blur: 22, maxZoom: 17, max: 3 }).addTo(mapa);
        $('escala').innerHTML = 'Menos <span class="cor" style="background:linear-gradient(90deg,blue,cyan,lime,yellow,red);width:120px"></span> Mais';
        if (!pts.length) {
          vazio.textContent = 'Ainda não há pontos confirmados com esses filtros.';
          vazio.hidden = false;
        }
      } else if (!bairros.tem_contornos) {
        vazio.textContent = 'Os contornos dos bairros ainda não foram cadastrados. O administrador pode importá-los no painel.';
        vazio.hidden = false;
      } else {
        const max = Math.max(0, ...bairros.geojson.features.map((f) => f.properties.peso_aberto));
        $('escala').innerHTML = `Menos ${ESCALA.map((c) => `<span class="cor" style="background:${c}"></span>`).join('')} Mais`;
        camada = L.geoJSON(bairros.geojson, {
          style: (f) => ({ color: '#555', weight: 1, fillOpacity: 0.7, fillColor: corPorValor(f.properties.peso_aberto, max) }),
          // Popup (abre com toque) em vez de tooltip (só passa o mouse).
          onEachFeature: (f, l) => l.bindPopup(
            `<strong>${esc(f.properties.nome)}</strong><br>${f.properties.abertos} abertos<br>Espera média: ${dias(f.properties.espera_media_abertos_dias)}`
          ),
        }).addTo(mapa);
      }

      $('nota-regioes').hidden = !bairros.aproximado;
      $('ranking').innerHTML = bairros.ranking.length
        ? bairros.ranking.map((r) => `<tr>
            <th scope="row">${esc(r.nome)}</th><td>${r.abertos}</td><td>${num(r.peso_aberto)}</td>
            <td>${r.resolvidos}</td><td>${dias(r.espera_media_abertos_dias)}</td><td>${dias(r.espera_media_resolvidos_dias)}</td>
          </tr>`).join('')
        : '<tr><td colspan="6" class="suave">Sem dados ainda.</td></tr>';
    } catch (e) {
      aviso(e.message, true);
    }
  }

  filtros.forEach((f) => f.addEventListener('change', atualizar));
  atualizar();
})();
