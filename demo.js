// Versão de demonstração (site estático): substitui o servidor.
// Os dados fixos (configuração, limite do município, regiões, ruas dos pontos simulados)
// vêm de ./dados.js (window.DADOS_DEMO), gerado por scripts/gerar-demo.js. Nada é salvo.
// Ficam num script (e não em .json) para a demonstração abrir também com clique duplo
// (file://), onde o navegador bloqueia a leitura de arquivos .json.
window.MODO_DEMO = true;

(function () {
  const carregar = async (nome) => {
    const d = window.DADOS_DEMO && window.DADOS_DEMO[nome];
    if (!d) throw new Error('Dados da demonstração não encontrados (dados.js).');
    return d;
  };

  function distancia(a, b) {
    const R = 6371000;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  window.demoApi = async function (caminho, opcoes = {}) {
    const metodo = opcoes.method || 'GET';
    const [rotaApi, busca = ''] = caminho.split('?');
    const q = new URLSearchParams(busca);
    const cenario = Simulacao.cenarioDaUrl();

    if (rotaApi === '/api/config') return carregar('config.json');
    if (rotaApi === '/api/limite') return carregar('limite.json');
    if (rotaApi === '/api/relatorios/bairros') return carregar('regioes.json');
    if (rotaApi === '/api/localizar') return carregar(`sim-${cenario}.json`);
    if (rotaApi === '/api/pontos' && metodo === 'GET') return Simulacao.gerar(CONFIG, cenario);
    if (rotaApi === '/api/pontos' && metodo === 'POST') return Simulacao.criar(CONFIG, cenario, opcoes.body);
    if (rotaApi === '/api/pontos/proximos') {
      const alvo = [Number(q.get('lat')), Number(q.get('lng'))];
      const raio = Number(q.get('raio')) || 30;
      return Simulacao.gerar(CONFIG, cenario)
        .map((p) => ({ ...p, distancia: Math.round(distancia(alvo, [p.lat, p.lng])) }))
        .filter((p) => p.distancia <= raio)
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 5);
    }
    throw new Error('Esta função não está disponível na demonstração.');
  };
})();
