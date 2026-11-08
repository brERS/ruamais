// Painel da administração do site.
(async function () {
  const cfg = await carregarConfig();
  const $ = (id) => document.getElementById(id);
  let eu = null;

  const ABAS = [
    { id: 'conferencia', rotulo: 'Lista de conferência', perfis: ['admin'],
      ajuda: 'Pontos confirmados ainda sem andamento, dos mais graves e mais confirmados para os menos. Confira no local.' },
    { id: 'andamento', rotulo: 'Em conserto / em obra', perfis: ['admin'],
      ajuda: 'Pontos com conserto ou obra em andamento.' },
    { id: 'contestados', rotulo: 'Contestados', perfis: ['admin'],
      ajuda: 'Pontos marcados como resolvidos que moradores dizem continuar com problema. Confira no local.' },
    { id: 'verificacao', rotulo: 'Em verificação', perfis: ['admin'],
      ajuda: 'Pontos para conferir no local. Ficam ocultos do mapa principal, mas nunca são apagados.' },
    { id: 'todos', rotulo: 'Todos', perfis: ['admin'], ajuda: '' },
    { id: 'removidos', rotulo: 'Removidos', perfis: ['admin'], ajuda: 'Pontos removidos podem ser restaurados.' },
    { id: 'atividade', rotulo: 'Indicadores e atividade', perfis: ['admin'],
      ajuda: 'Comportamentos fora do normal para conferir.' },
    { id: 'usuarios', rotulo: 'Contas', perfis: ['admin'], ajuda: '' },
    { id: 'bairros', rotulo: 'Bairros', perfis: ['admin'], ajuda: '' },
  ];

  async function iniciar() {
    try {
      eu = await api('/api/auth/eu');
    } catch {
      eu = null;
    }
    $('login').hidden = !!eu;
    $('painel-gestao').hidden = !eu;
    $('sair').hidden = !eu;
    $('quem').textContent = eu ? eu.nome : '';
    if (eu) montarAbas();
  }

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: f.get('email'), senha: f.get('senha') } });
      e.target.reset();
      iniciar();
    } catch (err) {
      aviso(err.message, true);
    }
  });

  $('sair').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST' });
    iniciar();
  });

  function montarAbas() {
    const minhas = ABAS.filter((a) => a.perfis.includes(eu.perfil));
    $('abas').innerHTML = minhas
      .map((a) => `<button type="button" class="pequeno" aria-pressed="false" data-aba="${a.id}">${esc(a.rotulo)}</button>`)
      .join('');
    $('abas').querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
      abrirAba(b.dataset.aba);
      $('titulo-aba').focus();
    }));
    abrirAba(minhas[0].id);
  }

  function abrirAba(id) {
    $('abas').querySelectorAll('[data-aba]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.aba === id)));
    const aba = ABAS.find((a) => a.id === id);
    $('titulo-aba').textContent = aba.rotulo;
    const alvo = $('conteudo-aba');
    alvo.innerHTML = `${aba.ajuda ? `<p class="suave">${esc(aba.ajuda)}</p>` : ''}<div id="corpo">Carregando…</div>`;
    const corpo = $('corpo');
    if (id === 'atividade') return abaAtividade(corpo);
    if (id === 'usuarios') return abaUsuarios(corpo);
    if (id === 'bairros') return abaBairros(corpo);
    return abaPontos(corpo, id);
  }

  // ---------- Pontos ----------
  async function abaPontos(corpo, lista) {
    let ps;
    try {
      ps = await api(`/api/staff/pontos?lista=${lista}`);
    } catch (e) {
      corpo.textContent = e.message;
      return;
    }
    if (!ps.length) {
      corpo.innerHTML = '<p>Nenhum ponto nesta lista.</p>';
      return;
    }
    corpo.innerHTML = ps.map(cartaoPonto).join('');
    corpo.querySelectorAll('form[data-status]').forEach((f) => f.addEventListener('submit', salvarStatus));
    corpo.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', remover));
    corpo.querySelectorAll('[data-restaurar]').forEach((b) => b.addEventListener('click', restaurar));
    corpo.querySelectorAll('[data-historico]').forEach((b) => b.addEventListener('click', verHistorico));
  }

  function cartaoPonto(p) {
    const attrs = descreverAtributos(cfg, p.tipo, p.atributos)
      .map((a) => `${esc(a.rotulo)}: ${a.valores.map(esc).join(', ')}`)
      .join(' · ');
    const opcoesStatus = cfg.status[p.tipo]
      .map(([s, r]) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${esc(r)}</option>`)
      .join('');
    const motivos = Object.entries(cfg.motivos_remocao).map(([m, r]) => `<option value="${m}">${esc(r)}</option>`).join('');

    return `
      <div class="cartao" id="p-${p.id}">
        <div><strong>#${p.id} · ${esc(p.rotulo_tipo)}</strong>
          <span class="etiqueta">${esc(p.rotulo_status)}</span>
          <span class="etiqueta ${p.verificacao}">${ROTULO_VERIFICACAO[p.verificacao]}</span>
          ${p.removido ? `<span class="etiqueta">Removido (${esc(cfg.motivos_remocao[p.motivo_remocao] || '')}) em ${dataBR(p.removido_em)}</span>` : ''}
        </div>
        <div><strong>${esc([p.rua || 'sem nome de rua', p.bairro].filter(Boolean).join(' · '))}</strong></div>
        <div class="suave">${attrs}</div>
        <div class="contadores">
          <span>👍 ${p.confirmacoes}</span><span>👎 ${p.negacoes}</span><span>⚠️ ${p.contestacoes} contestações</span>
          <span>Gravidade ${String(p.gravidade).replace('.', ',')}</span>
          ${p.bairro ? `<span>${esc(p.bairro)}</span>` : ''}
        </div>
        <div class="suave">Marcado em ${dataBR(p.criado_em)}${p.resolvido_em ? ` · resolvido em ${dataBR(p.resolvido_em)}` : ''}</div>
        <p class="linha">
          <a class="botao pequeno" href="/#ponto=${p.id}" target="_blank" rel="noopener">Ver no mapa</a>
          <a class="botao pequeno" href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">Abrir rota</a>
          <button type="button" class="pequeno" data-historico="${p.id}">Histórico</button>
        </p>
        <div id="h-${p.id}"></div>
        ${p.removido ? '' : `
        <form data-status="${p.id}" class="pilha">
          <label class="campo">Status <select name="status">${opcoesStatus}</select></label>
          <label class="campo">Nota interna (opcional, não aparece no site) <input name="nota" maxlength="500"></label>
          <button type="submit" class="primario">Salvar</button>
        </form>`}
        ${p.removido
          ? `<p><button type="button" data-restaurar="${p.id}">Restaurar</button></p>`
          : `<p class="linha"><select data-motivo="${p.id}" aria-label="Motivo da remoção">${motivos}</select>
             <button type="button" class="perigo" data-remover="${p.id}">Remover</button></p>`}
      </div>`;
  }

  async function salvarStatus(e) {
    e.preventDefault();
    const id = e.target.dataset.status;
    const f = new FormData(e.target);
    try {
      await api(`/api/pontos/${id}/status`, {
        method: 'PATCH',
        body: { status: f.get('status'), nota: f.get('nota') || undefined },
      });
      aviso('Salvo.');
      abrirAba($('abas').querySelector('[aria-pressed="true"]').dataset.aba);
    } catch (err) {
      aviso(err.message, true);
    }
  }

  async function remover(e) {
    const id = e.target.dataset.remover;
    const motivo = document.querySelector(`[data-motivo="${id}"]`).value;
    if (!confirm(`Remover o ponto #${id}? Ele continua salvo e pode ser restaurado.`)) return;
    try {
      await api(`/api/pontos/${id}/remover`, { method: 'POST', body: { motivo } });
      aviso('Ponto removido.');
      $(`p-${id}`).remove();
    } catch (err) {
      aviso(err.message, true);
    }
  }

  async function restaurar(e) {
    const id = e.target.dataset.restaurar;
    try {
      await api(`/api/pontos/${id}/restaurar`, { method: 'POST' });
      aviso('Ponto restaurado.');
      $(`p-${id}`).remove();
    } catch (err) {
      aviso(err.message, true);
    }
  }

  async function verHistorico(e) {
    const id = e.target.dataset.historico;
    const alvo = $(`h-${id}`);
    if (alvo.innerHTML) {
      alvo.innerHTML = '';
      return;
    }
    const p = await api(`/api/staff/pontos/${id}`);
    alvo.innerHTML = `<ul class="historico">${p.historico.map((h) => {
      const d = h.detalhes || {};
      const extra = [
        h.de_status && h.para_status && h.de_status !== h.para_status ? `${esc(h.de_status)} → ${esc(h.para_status)}` : '',
        d.motivo ? `motivo ${esc(d.motivo)}` : '',
        d.nota ? `nota: “${esc(d.nota)}”` : '',
      ].filter(Boolean).join(' · ');
      return `<li>${dataHoraBR(h.criado_em)} — <strong>${esc(h.acao)}</strong> ${extra} <span class="suave">(${esc(h.autor)})</span></li>`;
    }).join('')}</ul>`;
  }

  // ---------- Atividade ----------
  async function abaAtividade(corpo) {
    const d = await api('/api/admin/atividade');
    corpo.innerHTML = `
      <div class="cartao">Total: ${d.totais.pontos} pontos · ${d.totais.votos} votos · ${d.totais.codigos_30d} códigos ativos nos últimos 30 dias</div>
      <h3>Indicadores por semana</h3>
      <p class="suave">Para avaliar se o site está sendo usado. “Voltaram” são participantes que já tinham usado o site em semanas anteriores: é o melhor sinal de que o projeto está pegando.</p>
      <div class="tabela-rolagem" role="region" aria-label="Indicadores por semana" tabindex="0"><table>
        <thead><tr><th scope="col">Semana de</th><th scope="col">Pontos novos</th><th scope="col">Votos</th><th scope="col">Resolvidos</th><th scope="col">Participantes</th><th scope="col">Voltaram</th></tr></thead>
        <tbody>${d.semanas.map((s) => `<tr><th scope="row">${dataBR(s.semana)}</th><td>${s.novos}</td><td>${s.votos}</td>
          <td>${s.resolvidos}</td><td>${s.participantes}</td><td>${s.voltaram}</td></tr>`).join('')}</tbody>
      </table></div>
      <h3>Códigos mais ativos (24 h)</h3>
      <div class="tabela-rolagem"><table>
        <thead><tr><th scope="col">Código</th><th scope="col">Pontos</th><th scope="col">Votos</th><th scope="col">Primeira ação</th><th scope="col">Última ação</th></tr></thead>
        <tbody>${d.codigos.map((c) => `<tr><td><code>${esc(c.codigo)}…</code></td><td>${c.pontos}</td><td>${c.votos}</td>
          <td>${dataHoraBR(c.primeira)}</td><td>${dataHoraBR(c.ultima)}</td></tr>`).join('') || '<tr><td colspan="5">Nada nas últimas 24 h.</td></tr>'}</tbody>
      </table></div>
      <h3>Rajadas de votos (últimos 7 dias)</h3>
      <div class="tabela-rolagem"><table>
        <thead><tr><th scope="col">Ponto</th><th scope="col">Voto</th><th scope="col">Quantidade</th><th scope="col">Códigos diferentes</th><th scope="col">Quando</th></tr></thead>
        <tbody>${d.rajadas.map((r) => `<tr><td><a href="/#ponto=${r.ponto_id}" target="_blank">#${r.ponto_id}</a></td>
          <td>${esc(r.tipo)}</td><td>${r.votos}</td><td>${r.codigos}</td><td>${dataHoraBR(r.inicio)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma.</td></tr>'}</tbody>
      </table></div>`;
  }

  // ---------- Contas ----------
  async function abaUsuarios(corpo) {
    const us = await api('/api/usuarios');
    corpo.innerHTML = `
      <div class="tabela-rolagem"><table>
        <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${us.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
          <td>${u.ativo ? 'Ativa' : 'Desativada'}</td>
          <td>${u.id === eu.id || u.perfil !== 'admin' ? '' : `<button type="button" class="pequeno" data-ativo="${u.id}" data-valor="${!u.ativo}">${u.ativo ? 'Desativar' : 'Reativar'}</button>`}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="cartao" style="margin-top:12px">
        <h3>Nova conta de administração</h3>
        <form id="novo-usuario" class="pilha">
          <div class="linha">
            <label class="campo">Nome <input name="nome" required></label>
            <label class="campo">E-mail <input name="email" type="email" required></label>
          </div>
          <label class="campo">Senha inicial (mín. 10) <input name="senha" type="password" minlength="10" required autocomplete="new-password"></label>
          <button class="primario" type="submit">Criar conta</button>
        </form>
      </div>`;
    corpo.querySelectorAll('[data-ativo]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api(`/api/usuarios/${b.dataset.ativo}`, { method: 'PATCH', body: { ativo: b.dataset.valor === 'true' } });
        abaUsuarios(corpo);
      } catch (e) {
        aviso(e.message, true);
      }
    }));
    $('novo-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/usuarios', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        aviso('Conta criada.');
        abaUsuarios(corpo);
      } catch (err) {
        aviso(err.message, true);
      }
    });
  }

  // ---------- Bairros ----------
  async function abaBairros(corpo) {
    const bs = await api('/api/bairros');
    corpo.innerHTML = `
      <p>${bs.length} regiões cadastradas${bs.length ? `: ${bs.map((b) => esc(b.nome)).join(', ')}` : ''}.</p>
      ${bs.some((b) => b.fonte === 'osm-aproximado')
        ? '<p class="aviso-caixa">As regiões atuais são <strong>aproximações</strong> geradas a partir dos nomes de bairros e distritos do OpenStreetMap (área mais próxima de cada um). Se conseguir os contornos oficiais (IBGE ou outra fonte), importe abaixo para substituir.</p>'
        : ''}
      <div class="cartao">
        <h3>Importar contornos (GeoJSON)</h3>
        <p class="suave">Arquivo GeoJSON (FeatureCollection) com polígonos em latitude/longitude (WGS84). O nome é lido de “nome”, “name” ou “NM_BAIRRO”.
        Fontes possíveis: setores do IBGE ou OpenStreetMap.</p>
        <form id="form-bairros" class="pilha">
          <input type="file" name="arquivo" accept=".geojson,.json,application/geo+json,application/json" required>
          <label><input type="checkbox" name="substituir" checked> Substituir os bairros existentes</label>
          <button class="primario" type="submit">Importar</button>
        </form>
      </div>`;
    $('form-bairros').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const geojson = JSON.parse(await f.get('arquivo').text());
        const r = await api('/api/bairros/importar', { method: 'POST', body: { geojson, substituir: f.get('substituir') === 'on' } });
        aviso(`${r.importados} bairros importados${r.ignorados ? `, ${r.ignorados} ignorados` : ''}.`);
        abaBairros(corpo);
      } catch (err) {
        aviso(err instanceof SyntaxError ? 'Arquivo não é um JSON válido' : err.message, true);
      }
    });
  }

  iniciar();
})();
