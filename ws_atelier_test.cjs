/* ---------------------------------------------------------------------------
   ws_atelier_test.cjs — testes do WS ATELIER
   Executa a busca semântica, o filtro geográfico e a tabela de custo de verdade.
   uso:  node pipeline/ws_atelier_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', '02-camadas', 'atelier', 'WS_ATELIER.html'), 'utf8');

function fatia(ini, fim) {
  const a = HTML.indexOf(ini), b = HTML.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('marcador nao encontrado: ' + ini);
  return HTML.slice(a, b);
}

/* monta um módulo com as partes puras: catálogo, busca, geografia e custo */
const src =
  fatia('const LOJAS=[', 'const EST={') +
  fatia('const CUSTO={', 'function todos()') +
  `const CRIAR={fotos:[],cfg:{modelo:'meshy-5',textura:'2048',poly:'16000',pbr:true}};
   const EST={consulta:'',cats:new Set(),raio:0,precoMax:0,gerados:[]};` +
  fatia('function todos()', '/* ------------------------------------------------------------------- 3D */') +
  'module.exports={LOJAS,REF,CATALOGO,CATS,SINONIMOS,semAcento,expandir,pontuar,' +
  'distanciaKm,todos,filtrados,custoTotal,CUSTO,CRIAR,EST};';

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const M = mod.exports;

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };
const perto = (a, b, tol = 1e-3) => { if (Math.abs(a - b) > tol) throw new Error(`esperado ~${b}, veio ${a}`); };
const buscar = q => { M.EST.consulta = q; return M.filtrados(); };
const reset = () => { M.EST.consulta = ''; M.EST.cats = new Set(); M.EST.raio = 0; M.EST.precoMax = 0; };

console.log('\nWS ATELIER — suite de testes\n');

/* =============================================== 1. normalizacao e sinonimos */
console.log('linguagem');

t('acento nao muda o resultado da busca', () => {
  certo(M.semAcento('Sofá Capitonê') === 'sofa capitone', M.semAcento('Sofá Capitonê'));
});

t('sinonimo funciona nos dois sentidos', () => {
  certo(M.expandir('sofa').includes('estofado'), 'sofa -> estofado');
  certo(M.expandir('estofado').includes('sofa'), 'estofado -> sofa');
});

t('busca vazia devolve o catalogo inteiro', () => {
  reset();
  certo(M.filtrados().length === M.CATALOGO.length, 'devolveu ' + M.filtrados().length);
});

/* =============================================== 2. intencao */
console.log('\nintencao de busca');

t('"sofa" traz os dois sofas antes de tudo', () => {
  reset();
  const r = buscar('sofa');
  certo(r.length >= 2, 'trouxe ' + r.length);
  certo(r[0].cat === 'sofa' && r[1].cat === 'sofa', 'os dois primeiros deviam ser sofas');
});

t('"pequeno" favorece movel estreito, em qualquer genero', () => {
  reset();
  for (const q of ['mesa pequena', 'mesa pequeno', 'mesas pequenas']) {
    const r = buscar(q);
    certo(r.length > 0, 'nada encontrado para "' + q + '"');
    certo(r[0].dim[0] < 2.0, q + ' trouxe ' + r[0].dim[0] + ' m de largura');
  }
});

t('"alto" e "baixo" filtram por altura real', () => {
  reset();
  const alto = buscar('estante alta');
  certo(alto.length && alto[0].dim[1] > 1.5, 'alta trouxe ' + (alto[0] && alto[0].dim[1]));
  const baixa = buscar('mesa baixa');
  certo(baixa.length && baixa[0].dim[1] < 0.6, 'baixa trouxe ' + (baixa[0] && baixa[0].dim[1]));
});

t('"caro" nao confunde com "carvalho"', () => {
  reset();
  const r = buscar('caro');
  certo(r.length > 0 && r[0].preco > 6000, 'primeiro custa ' + (r[0] && r[0].preco));
});

t('"barato" favorece preco baixo', () => {
  reset();
  const r = buscar('barato');
  certo(r.length > 0, 'nada encontrado');
  certo(r[0].preco < 3000, 'primeiro custa ' + r[0].preco);
});

t('nome da loja funciona como filtro', () => {
  reset();
  const r = buscar('wm mobilia');
  certo(r.length > 0, 'nada encontrado');
  certo(r.every(x => x.loja === 'wm'), 'trouxe item de outra loja');
});

t('material encontra o movel mesmo sem estar no nome', () => {
  reset();
  const r = buscar('travertino');
  certo(r.length === 1 && r[0].id === 'mesa-cen', 'trouxe ' + r.map(x => x.id).join(','));
});

t('busca exige que todas as palavras facam sentido', () => {
  reset();
  certo(buscar('sofa girafa astronauta').length === 0, 'aceitou termos sem relacao');
});

t('termo inexistente devolve vazio, nao o catalogo', () => {
  reset();
  certo(buscar('zzzzzz').length === 0, 'devolveu resultados para lixo');
});

t('consulta com duas intencoes combina as duas', () => {
  reset();
  const r = buscar('cama quarto');
  certo(r.length > 0 && r[0].cat === 'cama', 'primeiro veio ' + (r[0] && r[0].cat));
});

/* =============================================== 3. geografia */
console.log('\nfiltro geografico');

t('distancia entre BH e Sao Paulo bate com a realidade', () => {
  const bh = M.LOJAS.find(l => l.id === 'wm'), sp = M.LOJAS.find(l => l.id === 'sp');
  const d = M.distanciaKm(bh, sp);
  certo(d > 480 && d < 530, 'calculou ' + d.toFixed(0) + ' km (real ~490)');
});

t('distancia de um ponto para ele mesmo e zero', () => {
  const a = M.LOJAS[0];
  perto(M.distanciaKm(a, a), 0, 1e-6);
});

t('raio de 15 km exclui Sao Paulo', () => {
  reset(); M.EST.raio = 15;
  const r = M.filtrados();
  certo(r.length > 0, 'zerou tudo');
  certo(!r.some(x => x.loja === 'sp'), 'Sao Paulo passou pelo raio de 15 km');
});

t('regiao metropolitana inclui Nova Lima e Contagem', () => {
  reset(); M.EST.raio = 40;
  const r = M.filtrados();
  certo(r.some(x => x.loja === 'nb'), 'faltou Nova Lima');
  certo(r.some(x => x.loja === 'ct'), 'faltou Contagem');
  certo(!r.some(x => x.loja === 'sp'), 'Sao Paulo entrou');
});

t('sem raio, tudo entra', () => {
  reset();
  certo(M.filtrados().some(x => x.loja === 'sp'), 'Sao Paulo sumiu sem filtro');
});

t('resultado carrega a distancia calculada', () => {
  reset();
  const r = M.filtrados();
  certo(r.every(x => typeof x._km === 'number' && isFinite(x._km)), 'distancia ausente');
});

/* =============================================== 4. filtros combinados */
console.log('\nfiltros combinados');

t('categoria restringe corretamente', () => {
  reset(); M.EST.cats = new Set(['sofa']);
  const r = M.filtrados();
  certo(r.length === 2 && r.every(x => x.cat === 'sofa'), 'trouxe ' + r.length);
});

t('teto de preco corta o que passa', () => {
  reset(); M.EST.precoMax = 3000;
  certo(M.filtrados().every(x => x.preco <= 3000), 'passou item acima do teto');
});

t('categoria + raio + preco funcionam juntos', () => {
  reset();
  M.EST.cats = new Set(['mesa']); M.EST.raio = 40; M.EST.precoMax = 5000;
  const r = M.filtrados();
  certo(r.every(x => x.cat === 'mesa' && x._km <= 40 && x.preco <= 5000), 'algum filtro vazou');
});

t('ordenacao: relevancia, depois proximidade, depois preco', () => {
  reset(); M.EST.cats = new Set(['armario']);
  const r = M.filtrados();
  for (let i = 1; i < r.length; i++)
    certo(r[i - 1]._nota > r[i]._nota ||
      (r[i - 1]._nota === r[i]._nota && r[i - 1]._km <= r[i]._km + 1e-9), 'ordem quebrada em ' + i);
});

/* =============================================== 5. custo de geracao */
console.log('\ntabela de custo');

t('configuracao minima custa o esperado', () => {
  M.CRIAR.fotos = ['a'];
  M.CRIAR.cfg = { modelo: 'meshy-5', textura: '2048', poly: '8000', pbr: false };
  certo(M.custoTotal() === 6, 'deu ' + M.custoTotal() + ', esperado 6');
});

t('cada foto extra soma 1 credito', () => {
  M.CRIAR.cfg = { modelo: 'meshy-5', textura: '2048', poly: '8000', pbr: false };
  M.CRIAR.fotos = ['a']; const base = M.custoTotal();
  M.CRIAR.fotos = ['a', 'b', 'c']; certo(M.custoTotal() === base + 2, 'deu ' + M.custoTotal());
});

t('configuracao maxima custa o esperado', () => {
  M.CRIAR.fotos = new Array(10).fill('x');
  M.CRIAR.cfg = { modelo: 'meshy-6', textura: '8192', poly: '40000', pbr: true };
  const esp = 11 + 16 + 9 + 4 + 9;
  certo(M.custoTotal() === esp, 'deu ' + M.custoTotal() + ', esperado ' + esp);
});

t('custo cresce de forma monotonica com a qualidade', () => {
  M.CRIAR.fotos = ['a'];
  const c = (m, t2, p, pbr) => { M.CRIAR.cfg = { modelo: m, textura: t2, poly: p, pbr }; return M.custoTotal(); };
  certo(c('meshy-5', '2048', '8000', false) < c('meshy-5', '4096', '8000', false), 'textura');
  certo(c('meshy-5', '2048', '8000', false) < c('meshy-5', '2048', '16000', false), 'malha');
  certo(c('meshy-5', '2048', '8000', false) < c('meshy-6', '2048', '8000', false), 'motor');
  certo(c('meshy-5', '2048', '8000', false) < c('meshy-5', '2048', '8000', true), 'pbr');
});

t('sem foto nenhuma nao ha custo de foto extra', () => {
  M.CRIAR.fotos = [];
  M.CRIAR.cfg = { modelo: 'meshy-5', textura: '2048', poly: '8000', pbr: false };
  certo(M.custoTotal() === 6, 'deu ' + M.custoTotal());
});

/* =============================================== 6. integridade do arquivo */
console.log('\nintegridade do WS_ATELIER.html');

t('o modulo inteiro tem sintaxe valida', () => {
  let js = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  js = js.replace(/^\s*import[^\n]*\n/gm, '');
  new Function(js);
});

t('sem identificadores duplicados', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const v = new Set(), d = [];
  ids.forEach(i => { if (v.has(i)) d.push(i); v.add(i); });
  certo(d.length === 0, 'duplicados: ' + d.join(', '));
});

t('nenhuma chave de API embutida', () => {
  certo(!/AIza[0-9A-Za-z_\-]{30,}/.test(HTML) && !/sk-[A-Za-z0-9]{20,}/.test(HTML), 'chave embutida');
  certo(/window\.WS_MESHY_ENDPOINT/.test(HTML), 'endpoint deveria vir de fora');
});

t('sentinela de boot presente', () => {
  certo(/__WS_OK/.test(HTML) && /diagT/.test(HTML), 'sentinela ausente');
});

t('nao compartilha estado com o WS Studio', () => {
  certo(!/WS_STUDIO/.test(HTML), 'ainda referencia o Studio');
  certo(/ws:atelier-movel/.test(HTML) && /ws:atelier-pino/.test(HTML), 'faltam os destinos');
});

t('falha de geracao nao cobra credito', () => {
  certo(/Nenhum crédito foi consumido/.test(HTML), 'sem garantia explicita ao usuario');
});

t('licenca de terceiro sinalizada', () => {
  certo(/licença comercial/i.test(HTML), 'sem aviso de licenca');
});

t('todas as categorias do catalogo tem icone', () => {
  const ic = fatia('function icone(c){', 'return `<svg');
  for (const k of Object.keys(M.CATS)) certo(ic.includes(k + ':'), 'sem icone para ' + k);
});

t('todo item do catalogo tem loja valida e dimensoes plausiveis', () => {
  for (const it of M.CATALOGO) {
    certo(M.LOJAS.some(l => l.id === it.loja), it.id + ' aponta para loja inexistente');
    certo(it.dim.length === 3 && it.dim.every(d => d > 0 && d < 4), it.id + ' com dimensao estranha');
    certo(it.preco > 0, it.id + ' sem preco');
    certo(it.tags.length >= 4, it.id + ' com poucas etiquetas de busca');
    certo(M.CATS[it.cat], it.id + ' com categoria desconhecida: ' + it.cat);
  }
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
