/* ---------------------------------------------------------------------------
   ws_contrato_test.cjs — o contrato de mensagens e quem o implementa.

   Nada disso tinha teste antes, e foi justamente aqui que a integração estava
   quebrada: o contrato dizia uma coisa, o schema outra, o portal uma terceira,
   e a camada de walkthrough não participava da conversa.

   Cobre quatro coisas:
     1. o portal mantém UM contexto WebGL vivo por vez;
     2. o portal enfileira comando até a camada se anunciar, em vez de
        reenviar três vezes torcendo;
     3. o ws-bridge não deixa evento de autoria cair no vazio;
     4. contrato .md, schema .json e ws-bridge.js falam dos mesmos tipos.

   uso:  node 05-testes/ws_contrato_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

const PORTAL   = ler('01-portal', 'index.html');
const BRIDGE   = ler('03-contrato', 'ws-bridge.js');
const CAMADA   = ler('03-contrato', 'WsCamada.tsx');
const CONTRATO = ler('03-contrato', 'CONTRATO-DE-MENSAGENS.md');
const SCHEMA   = JSON.parse(ler('03-contrato', 'ws-mensagens.schema.json'));
const STUDIO   = ler('02-camadas', 'studio-3d', 'WS_STUDIO.html');
const MINT     = ler('02-camadas', 'walkthrough', 'WS_MINT.html');
const PUBLICAR = ler('07-referencia', 'publicar-camadas.mjs');

/** As origens de uma lista `const ORIGENS_APP=[...]` em qualquer dos arquivos. */
const origensDe = (texto) => {
  const bloco = texto.match(/const ORIGENS_APP\s*=\s*\[([\s\S]*?)\];/);
  return bloco ? [...bloco[1].matchAll(/'(https:\/\/[^']+)'/g)].map(m => m[1]) : null;
};
/** O código sem comentários — para não achar `postMessage(…,'*')` numa nota. */
const semComentarios = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };

console.log('\nWS PLATAFORMA — contrato de mensagens\n');

/* ================================================= 1. contextos WebGL */
console.log('ciclo de vida das camadas no portal');

t('trocar de camada desmonta a anterior', () => {
  certo(/function desmontar\(/.test(PORTAL), 'sem funcao de desmontagem');
  certo(/about:blank/.test(PORTAL),
    'limpar o src sem passar por about:blank deixa o documento — e o contexto '
    + 'WebGL — vivo por mais tempo que o necessario');
  const carregar = (PORTAL.match(/function carregar\(qual\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/desmontar\(VIVA\)/.test(carregar),
    'carregar() precisa derrubar a camada anterior: cinco iframes vivos sao '
    + 'cinco contextos WebGL, e o navegador descarta o mais antigo sem avisar');
});

t('voltar ao portal tambem libera a GPU', () => {
  const inicio = (PORTAL.match(/function inicio\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/desmontar\(/.test(inicio), 'no portal ninguem esta olhando a camada');
});

t('nao ha pre-carregamento de camada', () => {
  certo(!/setTimeout\(\(\)=>carregar\(/.test(PORTAL),
    'pre-carregar ganhava menos de um segundo no primeiro clique e custava um '
    + 'contexto WebGL permanente numa pagina cujo produto e WebGL');
});

/* ================================================= 2. fila de comandos */
console.log('\nentrega de comandos');

t('o portal espera o anuncio da camada em vez de reenviar torcendo', () => {
  certo(/function enviarACamada\(/.test(PORTAL), 'sem fila de comandos');
  certo(/PRONTA\[qual\]/.test(PORTAL), 'sem handshake por camada');
  const codigo = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '');   /* fora os comentarios */
  certo(!/setTimeout\(enviar\s*,/.test(codigo),
    'o padrao "enviar(); setTimeout(enviar,1200); setTimeout(enviar,2800)" falha '
    + 'nos dois extremos: lento, as tres chegam antes da camada existir; rapido, '
    + 'a camada recebe o mesmo comando tres vezes');
});

t('desmontar invalida o handshake daquela camada', () => {
  const d = (PORTAL.match(/function desmontar\(qual\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/PRONTA\[qual\]=false/.test(d),
    'sem zerar, a proxima montagem herda um "pronto" de um documento que morreu');
});

t('o portal so aceita mensagem da propria origem', () => {
  certo(/ev\.origin!==ORIGEM/.test(PORTAL.replace(/\s/g, '')),
    'sem checagem de origem, qualquer janela comanda a navegacao do portal');
});

t('nenhum postMessage do portal usa destino curinga', () => {
  const codigo = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '');
  certo(!/postMessage\([^;]*'\*'\)/.test(codigo), "postMessage(..., '*') no portal");
});

/* ============================================ 3. o walkthrough na jornada */
console.log('\njornada mundo -> imovel -> walkthrough');

t('o portal nao promete um walkthrough que nao tem', () => {
  const bloco = (PORTAL.match(/if\(d\.tipo==='ws:entrar-walkthrough'\)\{[\s\S]*?\n  \}/) || [''])[0];
  certo(bloco, 'o portal nao trata ws:entrar-walkthrough');
  certo(/WALKTHROUGH_POR_IMOVEL/.test(bloco),
    'sem acervo por imovel o portal abre a demonstracao para qualquer imovel');
  certo(/ainda n[aã]o tem walkthrough/i.test(bloco),
    'quando nao ha midia, o portal precisa dizer isso — anunciar "carregando o '
    + 'walkthrough de X" e mostrar outro ambiente e o defeito que o selo de '
    + 'representacao ilustrativa passa a legitimar em vez de impedir');
});

t('o imovel viaja como ws:carregar-imovel, com a midia junto', () => {
  const bloco = (PORTAL.match(/if\(d\.tipo==='ws:entrar-walkthrough'\)\{[\s\S]*?\n  \}/) || [''])[0];
  certo(/ws:carregar-imovel/.test(bloco), 'a camada nao recebe o imovel');
  certo(/midia:/.test(bloco), 'sem midia a camada nao tem o que abrir');
});

/* ================================================= 4. o barramento */
console.log('\nws-bridge');

t('o bridge exige origem explicita e falha ruidosamente sem ela', () => {
  certo(/if \(!origem\)/.test(BRIDGE), 'origem opcional vira curinga na pratica');
  certo(/throw new Error/.test(BRIDGE), 'faltar origem precisa quebrar, nao degradar');
});

t('o bridge confere origem e fonte de cada mensagem', () => {
  certo(/ev\.origin !== this\.origem/.test(BRIDGE), 'sem checagem de origem');
  certo(/ev\.source !== this\.iframe\.contentWindow/.test(BRIDGE), 'sem checagem de fonte');
});

t('evento de autoria nunca cai no vazio em silencio', () => {
  certo(/EVENTOS_CRITICOS/.test(BRIDGE), 'sem lista de eventos que nao podem se perder');
  for (const e of ['ws:lead', 'ws:space-model', 'ws:walkthrough-modelo'])
    certo(new RegExp(e).test((BRIDGE.match(/EVENTOS_CRITICOS = new Set\(\[[\s\S]*?\]\)/) || [''])[0]),
      e + ' deveria ser critico: carrega dado que o usuario produziu e nao se recupera');
});

t('o componente React consome a autoria do walkthrough', () => {
  certo(/ws:walkthrough-modelo/.test(CAMADA), 'WsCamada ignora o modelo do tour');
  certo(/aoSalvarWalkthrough/.test(CAMADA), 'sem callback de persistencia');
});

t('a origem da camada e o src do iframe saem da mesma constante', () => {
  certo(/urlDaCamada\(camada, origem\)/.test(CAMADA),
    'src relativo com origem separada diverge em silencio ao mudar de '
    + 'subdominio: o iframe carrega, as mensagens vao para a origem errada, e '
    + 'a camada fica eternamente "carregando" sem erro no console');
});

/* ==================================== 5. contrato, schema e bridge alinhados */
console.log('\ncoerencia entre contrato, schema e bridge');

const tiposDoSchema = SCHEMA.oneOf
  .map(m => m.properties?.tipo?.const)
  .filter(Boolean);

t('todo tipo do schema aparece no contrato escrito', () => {
  const faltando = tiposDoSchema.filter(x => !CONTRATO.includes(x));
  certo(faltando.length === 0,
    'no schema mas nao documentado: ' + faltando.join(', '));
});

t('todo evento camada->app que o schema descreve e conhecido pelo bridge', () => {
  const conhecidos = (BRIDGE.match(/EVENTOS_CONHECIDOS = new Set\(\[[\s\S]*?\]\)/) || [''])[0];
  /* comandos app->camada nao passam pelo receptor do bridge */
  const comandos = new Set(['ws:carregar-imovel', 'ws:pedir-space', 'ws:ir-para',
    'ws:atelier-abrir', 'ws:pedir-walkthrough', 'ws:pedir-sessao']);
  const faltando = tiposDoSchema
    .filter(x => !comandos.has(x))
    .filter(x => !conhecidos.includes(x));
  certo(faltando.length === 0,
    'o bridge registraria como "nao catalogado": ' + faltando.join(', '));
});

t('o schema descreve o modelo autoral do walkthrough', () => {
  const m = SCHEMA.$defs.walkthroughModelo;
  certo(m, 'sem $defs/walkthroughModelo');
  for (const campo of ['ambientes', 'passagens', 'pinos'])
    certo(m.properties[campo], 'o modelo precisa de ' + campo);
  const p = m.properties.passagens.items;
  certo(p.required.includes('de'),
    'a passagem precisa carregar o ambiente de origem, senao nao vira grafo');
});

t('o schema proibe as fotos dentro do pedido de mundo', () => {
  const pm = SCHEMA.oneOf.find(x => x.properties?.tipo?.const === 'ws:pedido-mundo');
  certo(pm, 'ws:pedido-mundo ausente do schema');
  const img = pm.properties.pedido.properties.imagens.items;
  certo(img.not && img.not.required.includes('dado'),
    'o schema precisa recusar o campo com o conteudo da imagem');
});

t('o contrato registra a direcao certa de ws:pedido-mundo', () => {
  certo(/ws:pedido-mundo[^\n]*camada\s*→\s*app/.test(CONTRATO),
    'a tabela do contrato dizia "app -> camada", mas quem emite e a camada');
});

/* ==================================== 6. o Studio como camada embutível ==== */
/* O Studio ficou para trás quando o walkthrough foi endurecido: emitia tudo
   para '*' e aceitava comando de qualquer origem. Estes testes existem para
   que isso não volte — cada um deles corresponde a um defeito que estava no
   arquivo antes de 2026-08-12. */
console.log('\no Studio embutido');

t('o Studio valida a origem de quem manda comando', () => {
  certo(/origemPermitida\(/.test(STUDIO), 'sem funcao de validacao de origem');
  const l = STUDIO.replace(/\s/g, '');
  certo(/if\(!origemPermitida\(ev\.origin\)\)return/.test(l),
    'sem isso, qualquer pagina que embuta o Studio manda ws:carregar-imovel');
  certo(/if\(ev\.source!==parent\)return/.test(l),
    'origem certa vinda de outra janela — um iframe irmao, uma popup — ainda '
    + 'precisa ser recusada');
});

t('nenhuma emissao do Studio usa destino curinga', () => {
  const codigo = semComentarios(STUDIO);
  certo(!/postMessage\([^;]*'\*'\)/.test(codigo),
    "postMessage(...,'*') entrega o ws:lead — nome, telefone, e-mail — a "
    + 'qualquer pagina que embuta a camada');
});

t('o Studio anuncia ws:pronto com versao e camada', () => {
  certo(/enviarAoApp\(\{tipo:'ws:pronto'\}\)/.test(STUDIO), 'nao emite o nome canonico');
  certo(/ws:studio-pronto/.test(STUDIO),
    'o nome legado precisa sair junto por um release: e o que uma aplicacao '
    + 'publicada antes desta versao escuta');
  const env = (STUDIO.match(/function enviarAoApp\(msg\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/v:VERSAO_CONTRATO/.test(env) && /camada:CAMADA/.test(env),
    'regra 2 do contrato: toda mensagem carrega a versao');
});

t('o projeto do Studio chega ao banco sem depender do botao publicar', () => {
  certo(/function spaceMudou\(\)/.test(STUDIO),
    'sem autosave, quem desenha a planta e fecha a aba antes de publicar perde '
    + 'tudo — nao havia caminho nenhum ate o banco');
  const sched = (STUDIO.match(/function scheduleRebuild\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/spaceMudou\(\)/.test(sched),
    'o autosave precisa pendurar no ponto por onde TODA edicao passa; chamar '
    + 'em cada operacao e esquecer numa delas perde justamente aquele trabalho');
});

t('ws:pedir-space responde sem esperar o debounce', () => {
  const bloco = (STUDIO.match(/case 'ws:pedir-space':[\s\S]*?break;/) || [''])[0];
  certo(bloco, 'o Studio nao trata ws:pedir-space');
  certo(/clearTimeout\(tSpace\)/.test(bloco),
    'deixar o autosave pendente reenvia o mesmo space 2,5 s depois de ja ter '
    + 'respondido — e a aplicacao grava duas versoes iguais');
});

t('o carrinho e o Atelier saem do iframe', () => {
  const cs = (STUDIO.match(/function cartSync\(\)\{[\s\S]*?\n\}/) || [''])[0];
  certo(/ws:carrinho/.test(cs),
    'o carrinho so viajava dentro do ws:lead: quem NAO deixou contato — a '
    + 'maioria — nao produzia sinal nenhum de interesse por mobilia');
  certo(/ws:atelier-movel/.test(STUDIO), 'o movel criado no Atelier nao alimenta o catalogo');
});

t('o lead nao fica no localStorage da origem compartilhada', () => {
  /* O bloco inteiro: do `if(EMBUTIDO)` ate depois da gravacao local. */
  const bloco = (STUDIO.match(/if\(EMBUTIDO\)\{[\s\S]{0,600}?ws_leads[\s\S]{0,200}?\n {4}\}/) || [''])[0];
  certo(bloco, 'o lead precisa de caminhos distintos para embutido e solto');
  certo(/enviarAoApp\(\{tipo:'ws:lead'/.test(bloco) && /\}else\{/.test(bloco),
    'o espelho local so faz sentido solto: a origem das camadas e compartilhada '
    + 'por todas as marcas, e dado pessoal gravado ali e legivel por qualquer '
    + 'camada que outra marca embuta depois');
  certo(!/localStorage[\s\S]{0,80}ws_leads/.test(bloco.split('}else{')[0]),
    'gravar o lead antes do ramo embutido anula a separacao');
});

t('planta gerada da ficha aparece declarada como ilustrativa', () => {
  certo(/plantaGerada/.test(STUDIO), 'sem distinguir Space Model salvo de planta gerada');
  certo(/Representa[çc][ãa]o ilustrativa/i.test(STUDIO),
    'WORKERWS.md §7: um ambiente gerado exibido sob o nome de um imovel precisa '
    + 'dizer na tela que nao e a planta cadastrada dele');
});

t('o Studio embutido NAO trava esperando imovel', () => {
  /* Diferente do walkthrough de proposito: la, abrir a demonstracao mostraria
     um espaco que nao e o imovel; aqui a tela vazia e um editor esperando
     alguem desenhar, que e estado de trabalho legitimo. */
  certo(!/falhou\([^)]*ws:pronto/.test(STUDIO),
    'o Studio e um editor: tela vazia embutida nao afirma nada de errado, e '
    + 'transformar isso em erro fatal quebraria o uso autoral');
  certo(/console\.info\('\[WS\]/.test(STUDIO),
    'ainda assim, 20 s sem imovel e provavel falha de integracao e merece uma '
    + 'linha no console em vez de silencio');
});

/* ==================================== 7. as duas metades da origem ========= */
console.log('\nas duas listas de origem');

t('camada e frame-ancestors listam as mesmas origens', () => {
  const noDeploy = origensDe(PUBLICAR);
  certo(noDeploy, 'publicar-camadas.mjs sem ORIGENS_APP');
  for (const [nome, texto] of [['WS_MINT.html', MINT], ['WS_STUDIO.html', STUDIO]]) {
    const naCamada = origensDe(texto);
    certo(naCamada, nome + ' sem ORIGENS_APP');
    const faltando = noDeploy.filter(o => !naCamada.includes(o));
    certo(faltando.length === 0,
      nome + ' recusa origens que o frame-ancestors libera: ' + faltando.join(', ')
      + ' — o iframe carrega e ignora todo comando, e a camada fica '
      + '"carregando" para sempre');
  }
});

t('o publicar-camadas confere TODAS as camadas, nao so o WS_MINT', () => {
  certo(!/readFileSync\(path\.join\(SAIDA, 'WS_MINT\.html'\)/.test(PUBLICAR),
    'conferir uma camada so deixa a divergencia da outra passar sem aviso — '
    + 'que e exatamente o modo de falha que essa verificacao existe para pegar');
  certo(/for \(const nome of Object\.keys\(CAMADAS\)\)/.test(PUBLICAR),
    'a verificacao precisa iterar sobre as camadas publicadas');
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
