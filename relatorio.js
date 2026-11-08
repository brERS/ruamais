// Relatório mensal público: números do mês, mais confirmados em aberto, ruas sem asfalto
// com mais impacto, resolvidos e regiões. Pensado para imprimir e para copiar como texto.
(async function () {
  const $ = (id) => document.getElementById(id);
  let cfg;
  try {
    cfg = await carregarConfig();
  } catch (e) {
    $('relatorio').textContent = e.message;
    return;
  }

  const DIA = 864e5;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const hoje = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => new Date(hoje.getFullYear(), hoje.getMonth() - i, 1));
  $('f-mes').innerHTML = meses
    .map((d, i) => `<option value="${d.getFullYear()}-${d.getMonth()}">${MESES[d.getMonth()]} de ${d.getFullYear()}${i === 0 ? ' (até hoje)' : ''}</option>`)
    .join('');
  $('f-dados').insertAdjacentHTML('beforeend', Object.entries(Simulacao.CENARIOS)
    .map(([id, c]) => `<option value="${id}">Simulação: ${esc(c.rotulo)}</option>`).join(''));
  if (DEMO) $('f-dados').querySelector('option[value=""]').remove(); // demonstração: só simulação
  $('f-dados').value = Simulacao.cenarioDaUrl() || '';
  document.querySelector('.controles-relatorio').addEventListener('submit', (e) => e.preventDefault());

  let resumo = '';

  const dias = (ms) => Math.max(0, Math.round(ms / DIA));
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const local = (p) => [p.rua || 'local sem nome de rua no mapa', p.bairro].filter(Boolean).join(' · ');
  const principal = (p) => {
    const a = descreverAtributos(cfg, p.tipo, p.atributos)[0];
    return a ? a.valores.join(', ') : '';
  };
  const impactos = (p) => {
    const def = cfg.opcoes.rua_sem_asfalto;
    return [...(p.atributos.acesso || []).map((v) => def.acesso.valores[v]),
      ...(p.atributos.proximo || []).map((v) => `${def.proximo.valores[v].toLowerCase()} por perto`)];
  };

  async function carregar() {
    const sim = $('f-dados').value || null;
    Simulacao.definirNaUrl(sim);
    $('faixa-sim').hidden = !sim;
    for (const id of ['link-mapa', 'link-mapa-2']) $(id).href = rota(sim ? `/?simulacao=${sim}` : '/');
    $('relatorio').textContent = 'Carregando…';
    let pontos;
    try {
      pontos = sim ? await Simulacao.enriquecer(cfg, sim) : await api('/api/pontos');
    } catch (e) {
      $('relatorio').textContent = e.message;
      return;
    }
    const [ano, mes] = $('f-mes').value.split('-').map(Number);
    montar(pontos, new Date(ano, mes, 1).getTime(), new Date(ano, mes + 1, 1).getTime(), sim, `${MESES[mes]} de ${ano}`);
  }

  function montar(todos, inicio, fim, sim, nomeMes) {
    const ref = Math.min(Date.now(), fim); // situação no fim do mês (ou hoje)
    const t = (v) => (v ? new Date(v).getTime() : null);
    const existiam = todos.filter((p) => t(p.criado_em) < ref);
    const abertoEm = (p) => !p.resolvido_em || t(p.resolvido_em) >= ref;
    const confirmado = (p) => p.verificacao === 'confirmado' || p.final;

    const novos = existiam.filter((p) => t(p.criado_em) >= inicio);
    const resolvidosMes = todos.filter((p) => p.resolvido_em && t(p.resolvido_em) >= inicio && t(p.resolvido_em) < fim);
    const abertosConf = existiam.filter((p) => abertoEm(p) && confirmado(p));
    const esperaMedia = abertosConf.length
      ? dias(abertosConf.reduce((s, p) => s + (ref - t(p.criado_em)), 0) / abertosConf.length) : 0;

    const buracos = abertosConf.filter((p) => p.tipo === 'buraco')
      .sort((a, b) => b.confirmacoes - a.confirmacoes || b.gravidade - a.gravidade || t(a.criado_em) - t(b.criado_em))
      .slice(0, 10);
    const ruas = abertosConf.filter((p) => p.tipo === 'rua_sem_asfalto' && impactos(p).length)
      .sort((a, b) => b.gravidade - a.gravidade || b.confirmacoes - a.confirmacoes)
      .slice(0, 10);

    const porRegiao = new Map();
    for (const p of abertosConf) {
      const r = p.bairro || 'Sem região definida';
      const x = porRegiao.get(r) || { nome: r, abertos: 0, peso: 0, espera: 0 };
      x.abertos++;
      x.peso += p.gravidade;
      x.espera += ref - t(p.criado_em);
      porRegiao.set(r, x);
    }
    const regioes = [...porRegiao.values()].sort((a, b) => b.peso - a.peso).slice(0, 10);

    const linkPonto = (p) => rota(`/${sim ? `?simulacao=${sim}` : ''}#ponto=${p.id}`);
    const itemBuraco = (p) => `<li><strong>${esc(p.rotulo_tipo)}${principal(p) ? ` (${esc(principal(p).toLowerCase())})` : ''}</strong>, ${esc(local(p))}
      <span class="suave">${plural(p.confirmacoes, 'confirmação', 'confirmações')} · aberto há ${plural(dias(ref - t(p.criado_em)), 'dia', 'dias')} ·
      <a class="so-tela" href="${linkPonto(p)}">ver no mapa</a></span></li>`;
    const itemRua = (p) => `<li><strong>${esc(principal(p))}</strong>, ${esc(local(p))}
      <span class="suave">${esc(impactos(p).join('; '))} · ${plural(p.confirmacoes, 'confirmação', 'confirmações')} ·
      <a class="so-tela" href="${linkPonto(p)}">ver no mapa</a></span></li>`;
    const itemResolvido = (p) => `<li><strong>${esc(p.rotulo_tipo)}</strong>, ${esc(local(p))}
      <span class="suave">resolvido em ${plural(dias(t(p.resolvido_em) - t(p.criado_em)), 'dia', 'dias')} depois de marcado</span></li>`;

    const geradoEm = new Date().toLocaleDateString('pt-BR');
    $('relatorio').innerHTML = `
      <div class="cabecalho-relatorio">
        ${sim ? '<p class="aviso-caixa"><strong>Simulação com pontos fictícios.</strong> Não divulgue.</p>' : ''}
        <h1>Relatório de ${esc(nomeMes)}</h1>
        <p class="suave">Buracos e ruas sem asfalto marcados por moradores de ${esc(cfg.cidade.nome)}. Gerado em ${geradoEm}.
        Nas listas só entram pontos confirmados por pelo menos 3 pessoas.</p>
      </div>

      <section aria-labelledby="t-numeros">
        <h2 id="t-numeros" class="sr-only">Números do mês</h2>
        <div class="numeros">
          <div class="numero"><strong>${novos.length}</strong><span>problemas novos marcados no mês</span></div>
          <div class="numero"><strong>${resolvidosMes.length}</strong><span>resolvidos no mês</span></div>
          <div class="numero"><strong>${abertosConf.length}</strong><span>abertos e confirmados</span></div>
          <div class="numero"><strong>${esperaMedia}</strong><span>dias em aberto, em média</span></div>
        </div>
      </section>

      <section class="cartao" aria-labelledby="t-buracos">
        <h2 id="t-buracos">Buracos mais confirmados ainda abertos</h2>
        ${buracos.length ? `<ol class="ranking-lista">${buracos.map(itemBuraco).join('')}</ol>` : '<p>Nenhum buraco confirmado em aberto.</p>'}
      </section>

      <section class="cartao" aria-labelledby="t-ruas">
        <h2 id="t-ruas">Ruas sem asfalto com mais impacto</h2>
        <p class="suave">Ruas onde ônibus ou ambulância têm dificuldade, carros atolam, ou há escola, posto de saúde ou creche por perto.</p>
        ${ruas.length ? `<ol class="ranking-lista">${ruas.map(itemRua).join('')}</ol>` : '<p>Nenhuma rua sem asfalto confirmada com esses problemas.</p>'}
      </section>

      <section class="cartao" aria-labelledby="t-resolvidos">
        <h2 id="t-resolvidos">Resolvidos no mês</h2>
        ${resolvidosMes.length
          ? `<ul class="ranking-lista">${resolvidosMes.slice(0, 15).map(itemResolvido).join('')}</ul>
             ${resolvidosMes.length > 15 ? `<p class="suave">E mais ${resolvidosMes.length - 15}.</p>` : ''}`
          : '<p>Nenhum ponto marcado como resolvido neste mês.</p>'}
      </section>

      <section class="cartao" aria-labelledby="t-regioes">
        <h2 id="t-regioes">Regiões com mais problemas abertos</h2>
        ${regioes.length ? `
        <div class="tabela-rolagem" role="region" aria-label="Tabela de regiões" tabindex="0">
          <table>
            <thead><tr><th scope="col">Região</th><th scope="col">Abertos confirmados</th><th scope="col">Em aberto há (média)</th></tr></thead>
            <tbody>${regioes.map((r) => `<tr><th scope="row">${esc(r.nome)}</th><td>${r.abertos}</td>
              <td>${plural(dias(r.espera / r.abertos), 'dia', 'dias')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="suave">Regiões aproximadas a partir do OpenStreetMap, não são limites oficiais.</p>` : '<p>Sem dados.</p>'}
      </section>

      <section class="cartao" aria-labelledby="t-leitura">
        <h2 id="t-leitura">Como ler este relatório</h2>
        <ul>
          <li>Mais reportes não significa mais carência: bairros com menos acesso à internet podem aparecer com menos pontos.</li>
          <li>“Resolvido” é a situação registrada no site, conferida pela administração ou pelos moradores.</li>
          <li>Site independente e neutro: não apoia partido, candidato nem governo. Os dados são abertos para todos.</li>
        </ul>
        <p class="suave">Mapa e dados abertos: ${esc(urlPublica('/'))}</p>
      </section>`;

    // Resumo curto para redes sociais e mensagens.
    const linhas = [`RuaMais (o mapa das ruas de ${cfg.cidade.nome}): relatório de ${nomeMes}`];
    if (sim) linhas.push('(SIMULAÇÃO, dados fictícios)');
    linhas.push('', `No mês: ${plural(novos.length, 'problema novo marcado', 'problemas novos marcados')} e ${plural(resolvidosMes.length, 'resolvido', 'resolvidos')}.`);
    linhas.push(`Abertos e confirmados por moradores: ${abertosConf.length}${abertosConf.length ? ` (em média há ${plural(esperaMedia, 'dia', 'dias')})` : ''}.`);
    if (buracos.length) {
      linhas.push('', 'Buracos mais confirmados ainda abertos:');
      buracos.slice(0, 5).forEach((p, i) => linhas.push(
        `${i + 1}. ${principal(p) || p.rotulo_tipo}, ${local(p)}: ${plural(p.confirmacoes, 'confirmação', 'confirmações')}, aberto há ${plural(dias(ref - t(p.criado_em)), 'dia', 'dias')}`));
    }
    if (ruas.length) {
      linhas.push('', 'Ruas sem asfalto com mais impacto:');
      ruas.slice(0, 5).forEach((p, i) => linhas.push(`${i + 1}. ${local(p)}: ${impactos(p).join('; ')}`));
    }
    linhas.push('', `Veja o mapa e os dados abertos: ${urlPublica('/')}`);
    linhas.push('Site independente e neutro: não apoia partido, candidato nem governo.');
    resumo = linhas.join('\n');
    $('texto-resumo').value = resumo;
    $('texto-manual').hidden = true;
  }

  $('btn-copiar').addEventListener('click', async () => {
    if (await copiarTexto(resumo)) {
      aviso('Resumo copiado. Cole onde quiser.');
    } else {
      $('texto-manual').hidden = false;
      $('texto-resumo').focus();
      $('texto-resumo').select();
    }
  });
  $('btn-imprimir').addEventListener('click', () => window.print());
  $('f-mes').addEventListener('change', carregar);
  $('f-dados').addEventListener('change', carregar);
  carregar();
})();
