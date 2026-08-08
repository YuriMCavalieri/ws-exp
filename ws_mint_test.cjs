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

console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram');
  console.log('─'.repeat(58) + '\n');
}
