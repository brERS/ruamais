// Regras do domínio: opções fixas dos reportes, status e permissões.
// Não há texto livre nos reportes públicos.

const TIPOS = {
  buraco: 'Buraco',
  rua_sem_asfalto: 'Rua sem asfalto',
};

const OPCOES = {
  buraco: {
    tamanho: {
      rotulo: 'Tamanho', modo: 'um', obrigatorio: true,
      valores: { pequeno: 'Pequeno', grande: 'Grande', cratera: 'Cratera' },
    },
    risco: {
      rotulo: 'Risco', modo: 'varios',
      valores: { carro: 'Atrapalha carro', pedestre: 'Atrapalha pedestre', acidente: 'Já causou acidente' },
    },
  },
  rua_sem_asfalto: {
    pavimento: {
      rotulo: 'Tipo de rua', modo: 'um', obrigatorio: true,
      valores: { terra: 'Terra', cascalho: 'Cascalho', calcamento_precario: 'Calçamento precário' },
    },
    problemas: {
      rotulo: 'Problemas', modo: 'varios',
      valores: { lama: 'Lama', poeira: 'Poeira', enxurrada: 'Enxurrada', erosao: 'Erosão' },
    },
    acesso: {
      rotulo: 'Acesso', modo: 'varios',
      valores: {
        onibus_nao_entra: 'Ônibus não entra',
        ambulancia_dificuldade: 'Ambulância tem dificuldade',
        carro_atola: 'Carro atola',
      },
    },
    proximo: {
      rotulo: 'Por perto', modo: 'varios',
      valores: { escola: 'Escola', posto_saude: 'Posto de saúde', creche: 'Creche' },
    },
  },
};

// Os status descrevem só o que se observa na rua. O projeto não tem vínculo com o poder público.
const STATUS = {
  buraco: [
    ['reportado', 'Reportado'],
    ['em_andamento', 'Em conserto'],
    ['resolvido', 'Resolvido'],
  ],
  rua_sem_asfalto: [
    ['sem_asfalto', 'Sem asfalto'],
    ['em_obra', 'Em obra'],
    ['pavimentada', 'Pavimentada'],
  ],
};

const STATUS_INICIAL = { buraco: 'reportado', rua_sem_asfalto: 'sem_asfalto' };
const STATUS_FINAL = { buraco: 'resolvido', rua_sem_asfalto: 'pavimentada' };

const MOTIVOS_REMOCAO = { falso: 'Falso', resolvido: 'Resolvido', duplicado: 'Duplicado' };
const TIPOS_VOTO = ['confirma', 'nega', 'contesta'];

// O limite da cidade (área aceita para pontos) fica em src/cidade.js, lido de cidades/<CIDADE>/.

function statusValido(tipo, status) {
  return (STATUS[tipo] || []).some(([s]) => s === status);
}

function rotuloStatus(tipo, status) {
  const s = (STATUS[tipo] || []).find(([id]) => id === status);
  return s ? s[1] : status;
}

function ehFinal(tipo, status) {
  return STATUS_FINAL[tipo] === status;
}

// Valida e limpa os atributos; lança Error com mensagem amigável.
function validarAtributos(tipo, entrada) {
  const def = OPCOES[tipo];
  if (!def) throw new Error('Tipo inválido');
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const saida = {};
  for (const [campo, cfg] of Object.entries(def)) {
    const v = e[campo];
    if (cfg.modo === 'um') {
      if (v == null || v === '') {
        if (cfg.obrigatorio) throw new Error(`Escolha: ${cfg.rotulo}`);
        continue;
      }
      if (!Object.hasOwn(cfg.valores, v)) throw new Error(`Opção inválida em ${cfg.rotulo}`);
      saida[campo] = v;
    } else {
      if (v == null) continue;
      if (!Array.isArray(v) || v.some((x) => !Object.hasOwn(cfg.valores, x))) {
        throw new Error(`Opção inválida em ${cfg.rotulo}`);
      }
      const unicos = [...new Set(v)];
      if (unicos.length) saida[campo] = unicos;
    }
  }
  return saida;
}

// Peso para o mapa de calor e para a ordem da lista de conferência.
function gravidade(tipo, at = {}) {
  if (tipo === 'buraco') {
    let g = { pequeno: 1, grande: 2, cratera: 3 }[at.tamanho] || 1;
    if ((at.risco || []).includes('acidente')) g += 1;
    if ((at.risco || []).includes('pedestre')) g += 0.5;
    return g;
  }
  let g = 1;
  g += 0.5 * (at.acesso || []).length;
  g += 0.5 * (at.proximo || []).length;
  g += 0.25 * (at.problemas || []).length;
  return g;
}

module.exports = {
  TIPOS, OPCOES, STATUS, STATUS_INICIAL, STATUS_FINAL,
  MOTIVOS_REMOCAO, TIPOS_VOTO,
  statusValido, rotuloStatus, ehFinal, validarAtributos, gravidade,
};
