/* ---------------------------------------------------------------------------
   ws_mint_test.cjs — testes do WS Walkthrough (WS_MINT.html).

   Este arquivo nasceu de um defeito real: a tela ficava 100% preta enquanto a
   malha de colisão aparecia normalmente. A causa foi `enableLod:false` no
   SparkRenderer. No Spark 2.1 o construtor faz

       enableDriveLod = opts.enableDriveLod ?? enableLod

   e o laço só chama driveLod() quando enableDriveLod é verdadeiro. É driveLod
   que escolhe e busca as páginas de um arquivo RAD paginado ("-lod.rad").
   Com o LOD desligado nenhuma página é buscada: zero gaussianas, tela preta —
   e o colisor, que é Three.js puro, continua desenhando. Daí a pista.

   Os testes abaixo existem para que essa combinação nunca mais suba.
   uso:  node pipeline/ws_mint_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const ARQ = path.join(RAIZ,'02-camadas','walkthrough','WS_MINT.html');
const H = fs.readFileSync(ARQ, 'utf8');

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };

/* o corpo do módulo, sem os imports (que o Node não resolveria aqui) */
const MOD = (H.match(/<script type="module">([\s\S]*?)<\/script>/) || [, ''])[1];
const JS = MOD.replace(/^\s*import[^;]+;/gm, '');

console.log('\nWS WALKTHROUGH — verificacao\n');

/* ============================================= 1. o defeito da tela preta */
console.log('streaming de gaussianas (a causa da tela preta)');

t('o SparkRenderer nunca e criado com LOD desligado', () => {
  const bloco = (JS.match(/new Spark\.SparkRenderer\(\{[\s\S]*?\}\)/) || [''])[0];
  certo(bloco, 'nao achei a criacao do SparkRenderer');
  certo(!/enableLod\s*:\s*false/.test(bloco),
    'enableLod:false — arquivo RAD paginado nao busca pagina nenhuma e a tela fica PRETA');
  certo(!/enableDriveLod\s*:\s*false/.test(bloco),
    'enableDriveLod:false tem o mesmo efeito de enableLod:false');
  certo(/enableLod\s*:\s*true/.test(bloco), 'enableLod precisa ser explicitamente true');
});

t('nenhuma variavel de estado volta a decidir a politica de LOD', () => {
  certo(!/EST\.lod/.test(JS),
    'EST.lod voltou — foi essa variavel que desligou o streaming e apagou a tela');
});

t('o streaming de paginas esta explicitamente ligado', () => {
  const bloco = (JS.match(/new Spark\.SparkRenderer\(\{[\s\S]*?\}\)/) || [''])[0];
  certo(/enableLodFetching\s*:\s*true/.test(bloco), 'sem enableLodFetching:true');
});

t('arquivo -lod.rad e sempre carregado como paginado', () => {
  const lods = [...H.matchAll(/rad\s*:\s*'([^']*-lod\.rad)'/g)].map(m => m[1]);
  certo(lods.length >= 1, 'nenhum ambiente RAD encontrado');
  certo(/paged\s*:\s*\(a\.formato\s*===\s*'rad'\)/.test(JS),
    'RAD precisa de paged:true no SplatMesh');
});

/* ============================================= 2. qualidade sem apagar tela */
console.log('\nqualidade');

t('os degraus de qualidade existem e sao numericos', () => {
  const m = JS.match(/const QUALIDADE=\{([\s\S]*?)\n\};/);
  certo(m, 'tabela QUALIDADE ausente');
  const tabela = m[1];
  for (const k of ['maxima', 'equilibrio', 'celular'])
    certo(new RegExp(k + '\\s*:').test(tabela), 'faltou o degrau ' + k);
  const orc = [...tabela.matchAll(/orcamento\s*:\s*(\d+)/g)].map(x => +x[1]);
  certo(orc.length === 3, 'cada degrau precisa de orcamento de gaussianas');
  certo(orc.every(n => n > 0), 'orcamento zerado apagaria a cena');
  certo(orc[0] > orc[1] && orc[1] > orc[2], 'Maxima > Equilibrio > Celular');
});

t('trocar de qualidade nao desliga o LOD, so muda o orcamento', () => {
  const bloco = (JS.match(/\$\$\('\[data-q\]'\)[\s\S]*?\}\);/) || [''])[0];
  certo(bloco, 'nao achei o seletor de qualidade');
  certo(!/enableLod/.test(bloco), 'o seletor voltou a mexer em enableLod');
  certo(/QUALIDADE\[q\]/.test(bloco), 'o seletor deveria ler a tabela QUALIDADE');
  certo(/spark=null/.test(bloco),
    'orcamento e foveacao sao congelados na criacao: o SparkRenderer precisa ser refeito');
});

t('Maxima desliga a foveacao (era ela que borrava periferia e fundo)', () => {
  const m = JS.match(/maxima\s*:\s*\{([^}]*)\}/);
  certo(m, 'degrau maxima ausente');
  certo(/atras\s*:\s*1(\.0)?\b/.test(m[1]), 'behindFoveate deveria ser 1 na Maxima');
  certo(/periferia\s*:\s*1(\.0)?\b/.test(m[1]), 'coneFoveate deveria ser 1 na Maxima');
});

/* ============================================= 3. o vigia de tela preta */
console.log('\nvigia de tela preta');

t('existe leitura real do quadro, nao suposicao', () => {
  certo(/readPixels/.test(JS), 'sem readPixels nao ha como saber se a tela acendeu');
  certo(/function vigia\(/.test(JS) && /vigia\(dt\);/.test(JS),
    'o vigia precisa rodar dentro do laco de render');
});

t('o vigia e armado toda vez que um ambiente fica pronto', () => {
  certo(/vigiaArmar\(\);/.test(JS), 'sem vigiaArmar() apos o carregamento');
  const i = JS.indexOf('vigiaArmar();'), j = JS.indexOf("window.__WS_OK=true");
  certo(i > j && i - j < 200, 'o vigia deveria ser armado logo apos a cena aparecer');
});

t('o vigia falha explicando, nunca em silencio', () => {
  const bloco = (JS.match(/function vigia\(dt\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/falhou\(/.test(bloco), 'o vigia precisa mostrar o diagnostico na tela');
  certo(/Gaussianas ativas/.test(bloco), 'o diagnostico precisa dizer quantas gaussianas ha');
  certo(/Colisor/.test(bloco), 'o diagnostico precisa separar splat de colisor');
});

t('leitura de quadro indisponivel nao acusa falso positivo', () => {
  const bloco = (JS.match(/function brilhoDoMiolo\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/catch\s*\([^)]*\)\s*\{\s*return\s*-1/.test(bloco),
    'sem readPixels o vigia tem que se calar, nao acusar tela preta');
});

/* ============================================= 4. ambientes e web */
console.log('\nambientes');

const AMB = [...H.matchAll(/\{\s*id:'([^']+)',\s*nome:'([^']+)'[\s\S]*?\}/g)];

t('todo ambiente embarcado vem por HTTPS', () => {
  const urls = [...H.matchAll(/(?:rad|colisor|capa)\s*:\s*'([^']+)'/g)].map(m => m[1]);
  certo(urls.length > 0, 'nenhuma URL de ambiente encontrada');
  const ruins = urls.filter(u => u && !/^https:\/\//.test(u));
  certo(ruins.length === 0, 'URL nao-HTTPS: ' + ruins.join(' · '));
});

t('todo ambiente embarcado tem colisor', () => {
  const rads = [...H.matchAll(/rad\s*:\s*'https:[^']+'/g)].length;
  const cols = [...H.matchAll(/colisor\s*:\s*'https:[^']+'/g)].length;
  certo(rads > 0, 'nenhum ambiente');
  certo(cols === rads, rads + ' ambientes mas ' + cols + ' colisores — medicao ficaria sem base');
});

t('sem colisor a medicao fica desligada, nao chutada', () => {
  certo(/Medicao indisponivel|Medição indisponível/.test(H),
    'o sistema precisa recusar medir captura solta');
});

/* ============================================= 5. recorte nao pode apagar */
console.log('\nrecorte da captura');

t('o recorte roda depois da cena aparecer', () => {
  const i = JS.indexOf("$('#carga').style.display='none'");
  const j = JS.indexOf('aplicarRecorte()', i);
  certo(i > 0 && j > i, 'recorte antes da cena visivel ja causou tela preta uma vez');
});

t('qualquer tropeco no recorte e absorvido', () => {
  const bloco = (JS.match(/function aplicarRecorte\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/catch\s*\(/.test(bloco), 'aplicarRecorte sem try/catch pode derrubar a cena');
  certo(/localClippingEnabled\s*=\s*false/.test(bloco),
    'no caminho de erro o corte tem que ser desligado');
});

t('recorte zero nao deixa plano de corte pendurado', () => {
  const bloco = (JS.match(/function aplicarRecorte\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/clippingPlanes\s*=\s*null/.test(bloco), 'planos precisam ser limpos quando o recorte e 0');
});

/* ============================================= 6. integridade */
console.log('\nintegridade');

t('o modulo tem sintaxe valida', () => {
  new Function(JS);
});

t('nenhuma chave de API embutida na pagina', () => {
  certo(!/AIza[0-9A-Za-z_\-]{30,}/.test(H), 'chave Google embutida');
  certo(!/mint_live_[A-Za-z0-9_\-]{10,}/.test(H), 'chave Mint embutida');
  certo(!/sk-[A-Za-z0-9]{20,}/.test(H), 'chave de API embutida');
});

t('o walkthrough se declara representacao ilustrativa', () => {
  certo(/ilustrativ/i.test(H),
    'o usuario precisa saber que e representacao grafica 3D, nao o imovel');
});

t('Three e Spark vem de origem HTTPS fixada em versao', () => {
  certo(/https:\/\/unpkg\.com\/three@0\.184\.0/.test(H), 'Three sem versao fixada');
  certo(/https:\/\/esm\.sh\/@sparkjsdev\/spark@2/.test(H), 'Spark sem versao fixada');
  certo(/three@0\.18/.test(H), 'Spark 2 exige Three 0.180 ou mais novo');
});

t('todo modulo de CDN tem hash de integridade', () => {
  const mapa = (H.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [, ''])[1];
  certo(mapa.trim(), 'sem import map');
  const m = JSON.parse(mapa);
  certo(m.integrity && Object.keys(m.integrity).length,
    'import map sem campo integrity — modulo ES nao aceita o atributo integrity=, '
    + 'o hash tem que vir aqui');

  /* todo especificador absoluto do mapa precisa de hash correspondente */
  for (const url of Object.values(m.imports)) {
    if (!/^https:/.test(url)) continue;
    if (url.endsWith('/')) continue;          /* prefixo, nao e um modulo */
    certo(m.integrity[url], 'sem integrity para ' + url);
  }
  for (const h of Object.values(m.integrity))
    certo(/^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(h), 'hash malformado: ' + h);
});

t('nenhuma faixa movel de versao com hash travado', () => {
  const mapa = (H.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [, '{}'])[1];
  const m = JSON.parse(mapa);
  for (const url of Object.keys(m.integrity || {})) {
    certo(/@\d+\.\d+\.\d+/.test(url),
      'hash travado numa faixa de versao: ' + url + ' — o hash quebra sozinho '
      + 'na proxima publicacao do pacote');
  }
});

/* ======================================= 7. o contrato do lado da camada */
console.log('\ncontrato de mensagens');

t('a camada escuta mensagens', () => {
  certo(/addEventListener\('message'/.test(JS),
    'o walkthrough era a unica camada surda: sem receptor, ws:carregar-imovel '
    + 'ficava preso na fila do ws-bridge para sempre');
});

t('a camada valida a origem e a fonte de quem manda', () => {
  const bloco = (JS.match(/addEventListener\('message',[\s\S]*?\n\}\);/) || [''])[0];
  certo(/ORIGENS\.includes\(e\.origin\)/.test(bloco), 'sem checagem de e.origin');
  certo(/e\.source!==parent/.test(bloco.replace(/\s/g, '')),
    'sem checagem de e.source: outra janela ainda conseguiria mandar comando');
});

t('a lista de origens e constante, nunca vem da URL', () => {
  const bloco = (JS.match(/const ORIGENS_APP=\[[\s\S]*?\];/) || [''])[0];
  certo(bloco, 'ORIGENS_APP ausente');
  certo(!/searchParams|location\.search|location\.hash/.test(bloco),
    'origem lida da URL seria escolhida pelo atacante que embutisse a camada — '
    + 'isso anula a checagem inteira');
});

t('nenhuma mensagem sai com destino curinga', () => {
  certo(!/postMessage\([^)]*'\*'\)/.test(JS),
    "postMessage(..., '*') entrega para qualquer origem que estiver ouvindo");
});

t('as fotos do imovel nunca saem por postMessage', () => {
  const bloco = (JS.match(/async function gerarMundo\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(bloco, 'gerarMundo ausente');
  certo(!/enviarAoApp\(carga\)|postMessage\(carga/.test(bloco),
    'carga carrega imagensDados: as fotos inteiras em base64. So o pedido pode sair');
  certo(/enviarAoApp\(\{tipo:'ws:pedido-mundo', pedido:pedido\(\)\}\)/.test(bloco),
    'o aviso a plataforma deveria levar so pedido(), que e metadado');
  certo(!/imagensDados/.test((JS.match(/function pedido\(\)\{[\s\S]*?\n\}/) || [''])[0]),
    'pedido() nao pode incluir o conteudo das imagens');
});

t('a camada anuncia ws:pronto quando embutida', () => {
  certo(/enviarAoApp\(\{tipo:'ws:pronto'\}\)/.test(JS),
    'sem ws:pronto o WsBridge espera para sempre e a aplicacao mostra erro '
    + 'por cima de uma camada que esta funcionando');
  certo(/const CAMADA='walkthrough'/.test(JS), 'ws:pronto precisa dizer qual camada e');
});

t('embutida, a camada NAO abre a demonstracao por conta propria', () => {
  const bloco = (JS.match(/if\(!EMBUTIDO\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/abrirAmbiente\(0\)/.test(bloco),
    'solta, a camada deveria abrir o acervo de demonstracao');
  const depois = JS.slice(JS.indexOf('}else{', JS.indexOf('if(!EMBUTIDO)')));
  certo(!/abrirAmbiente\(0\)/.test(depois.slice(0, 900)),
    'embutida, abrir a demonstracao mostra outro imovel sob o nome do imovel '
    + 'clicado — e o selo de representacao ilustrativa passa a legitimar o engano');
});

t('imovel sem midia e recusado, nao substituido pela demonstracao', () => {
  const bloco = (JS.match(/function carregarImovel\(msg\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(bloco, 'carregarImovel ausente');
  certo(/if\(!lista\.length\)/.test(bloco), 'sem tratamento de midia ausente');
  certo(/falhou\(/.test(bloco), 'a falta de midia precisa ser dita na tela');
});

/* ======================================= 8. a autoria do tour persiste */
console.log('\nautoria do tour');

t('existe um modelo serializavel de passagens e pinos', () => {
  certo(/function modeloDoWalkthrough\(\)/.test(JS), 'sem modeloDoWalkthrough');
  certo(/function aplicarModelo\(m\)/.test(JS), 'sem aplicarModelo: o grafo nao volta');
  const bloco = (JS.match(/function modeloDoWalkthrough\(\)\{[\s\S]*?\n\}/) || [''])[0];
  for (const campo of ['passagens', 'pinos', 'ambientes'])
    certo(new RegExp(campo).test(bloco), 'o modelo precisa carregar ' + campo);
});

t('a passagem carrega o ambiente de origem', () => {
  const bloco = (JS.match(/function modeloDoWalkthrough\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/de:a\.id/.test(bloco),
    'sem o ambiente de origem a passagem nao vira linha de tabela nem grafo');
});

t('toda mudanca de autoria agenda o salvamento', () => {
  /* Cada mutacao do modelo precisa avisar. Sao onze pontos hoje:
       1 criar passagem ou pino (clique na cena)
       2 renomear movel      3 precificar movel     4 apagar pino
       5 trocar destino da passagem                 6 apagar passagem
       7 escala   8 altura   9 giro   10 recorte    11 voltar ao padrao
     O numero e exato de proposito. Um ponto a menos e uma edicao que o
     corretor faz e perde no F5, que era o defeito original; um a mais quer
     dizer que ha caminho novo de autoria — atualize a lista acima junto. */
  const ESPERADO = 11;
  const chamadas = (JS.match(/modeloMudou\(\)/g) || []).length - 1;  /* fora a definicao */
  certo(chamadas === ESPERADO,
    'esperava ' + ESPERADO + ' pontos chamando modeloMudou(), achei ' + chamadas
    + ' — se um sumiu, aquela edicao volta a se perder no F5');
});

t('o salvamento e agrupado, nao um envio por tecla', () => {
  const bloco = (JS.match(/function modeloMudou\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/clearTimeout|setTimeout/.test(bloco),
    'sem debounce, digitar o nome de um movel dispara um evento por caractere');
});

/* --------------------------------------------------------------------------
   Os testes acima leem o codigo. Este EXECUTA as duas funcoes, com o corpo
   real extraido do HTML, e confere que o grafo sobrevive ao ciclo completo:
   autorar -> serializar -> zerar -> restaurar. E a unica forma de saber que a
   persistencia funciona, em vez de apenas existir.
-------------------------------------------------------------------------- */
t('o grafo sobrevive ao ciclo salvar -> restaurar', () => {
  const corpo = (fonte, nome) => {
    const m = JS.match(new RegExp('function ' + nome + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
    certo(m, nome + ' nao encontrada');
    return m[0];
  };

  /* AMBIENTES e VERSAO_CONTRATO sao as unicas coisas de fora que as duas
     funcoes tocam — o resto e fechado nelas mesmas */
  const sandbox = new Function('AMBIENTES', 'VERSAO_CONTRATO', `
    ${corpo(JS, 'modeloDoWalkthrough')}
    ${corpo(JS, 'aplicarModelo')}
    return { modeloDoWalkthrough, aplicarModelo };
  `);

  const novo = () => ([
    { id: 'sala',    nome: 'Sala',    cal: { rotY: 3.14, escala: 2.5, y: 1.5 }, crop: 0,   passagens: [], pinos: [] },
    { id: 'cozinha', nome: 'Cozinha', cal: { rotY: 0,    escala: 2.0, y: 1.2 }, crop: 0.1, passagens: [], pinos: [] },
  ]);

  /* --- autoria: a sala tem DUAS portas (uma ainda sem destino), a cozinha
         uma de volta, e um movel na sala. Duas portas no mesmo ambiente e o
         que denuncia um laco que so salva a primeira. --- */
  const ambientes = novo();
  const api = sandbox(ambientes, 1);
  ambientes[0].passagens.push({ x: 1.2, y: 0.9, z: -3.4, destino: 'cozinha' });
  ambientes[0].passagens.push({ x: 4.0, y: 0.9, z: -1.0, destino: null });
  ambientes[1].passagens.push({ x: 0.1, y: 0.9, z: 2.0,  destino: 'sala' });
  ambientes[0].pinos.push({ x: 0.4, y: 0.35, z: -1.1,
    movel: { sku: 'sofa-1', nome: 'Sofá retrátil', preco: 4890 } });
  /* calibracao e recorte acertados a mao — precisam diferir do valor inicial
     de novo(), senao a assercao passa mesmo se a restauracao nao acontecer */
  ambientes[1].cal.escala = 2.75;      /* novo() traz 2.0  */
  ambientes[1].crop = 0.28;            /* novo() traz 0.1  */

  const salvo = JSON.parse(JSON.stringify(api.modeloDoWalkthrough()));

  certo(salvo.passagens.length === 3,
    'esperava 3 arestas no modelo, achei ' + salvo.passagens.length
    + ' — um ambiente com duas portas nao pode perder a segunda');
  certo(salvo.passagens.filter(p => p.de === 'sala').length === 2,
    'as duas portas da sala deveriam estar no modelo');
  certo(salvo.passagens[0].de === 'sala' && salvo.passagens[0].para === 'cozinha',
    'a aresta perdeu origem ou destino');
  certo(salvo.pinos[0].ambiente === 'sala', 'o pino perdeu o ambiente');

  /* --- nova sessao: ambientes zerados, como depois de um F5 --- */
  const depois = novo();
  const api2 = sandbox(depois, 1);
  api2.aplicarModelo(salvo);

  certo(depois[0].passagens.length === 2,
    'a sala voltou com ' + depois[0].passagens.length + ' porta(s) em vez de 2');
  certo(depois[0].passagens[0].destino === 'cozinha',
    'a passagem sala -> cozinha nao voltou');
  certo(depois[0].passagens[1].destino === null,
    'a porta ainda sem destino precisa voltar como null, nao undefined: e ela '
    + 'que o painel lista para o usuario escolher o destino depois');
  certo(depois[1].passagens.length === 1 && depois[1].passagens[0].destino === 'sala',
    'a passagem cozinha -> sala nao voltou');
  certo(depois[0].pinos.length === 1 && depois[0].pinos[0].movel.preco === 4890,
    'o pino de movel voltou sem preco');
  certo(Math.abs(depois[1].cal.escala - 2.75) < 1e-9,
    'a calibracao acertada a mao se perdeu — o corretor teria que refazer '
    + '(voltou ' + depois[1].cal.escala + ', esperava 2.75)');
  certo(Math.abs(depois[1].crop - 0.28) < 1e-9,
    'o recorte se perdeu (voltou ' + depois[1].crop + ', esperava 0.28)');

  /* --- o ciclo e estavel: salvar de novo da o mesmo modelo --- */
  certo(JSON.stringify(api2.modeloDoWalkthrough()) === JSON.stringify(salvo),
    'o segundo ciclo divergiu do primeiro: a autoria muda sozinha a cada '
    + 'ida e volta ao banco');
});

t('passagem sem destino sobrevive ao ciclo', () => {
  /* o usuario cria a porta antes de existir o segundo ambiente — o caso que
     fazia a passagem ser recusada em silencio na versao antiga */
  const m = JS.match(/function aplicarModelo\(m\)\{[\s\S]*?\n\}/)[0];
  const amb = [{ id: 'sala', nome: 'Sala', cal: {}, passagens: [], pinos: [] }];
  /* `para` AUSENTE, nao nulo: e assim que o campo chega de um jsonb gravado
     por quem omitiu a chave. Precisa normalizar para null do mesmo jeito. */
  new Function('AMBIENTES', m + '\naplicarModelo(' + JSON.stringify({
    v: 1, ambientes: [], passagens: [{ de: 'sala', x: 0, y: 0, z: 0 }], pinos: [],
  }) + ');')(amb);
  certo(amb[0].passagens.length === 1, 'passagem sem destino foi descartada');
  certo(amb[0].passagens[0].destino === null,
    'destino ausente precisa virar null, nao undefined: o <select> do painel '
    + 'trata null como "escolha o destino" e undefined como valor valido');
});

console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram');
  console.log('─'.repeat(58) + '\n');
}
