/* ---------------------------------------------------------------------------
   ws_camadas_deploy_test.cjs — verifica o deploy EMBUTÍVEL das camadas.

   Roda DEPOIS de `npm run publicar:camadas`.

   O que ele impede: publicar um host de camadas que a plataforma não consegue
   embutir, ou que qualquer site consegue. Os dois falham em silêncio — o
   primeiro deixa a camada "carregando" para sempre, o segundo não deixa
   sintoma nenhum até alguém abusar.

   uso:  node 05-testes/ws_camadas_deploy_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PUB = path.join(RAIZ, 'publicar-camadas');

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };
const ler = f => fs.readFileSync(path.join(PUB, f), 'utf8');
const existe = f => fs.existsSync(path.join(PUB, f));

console.log('\nWS CAMADAS — verificacao do deploy embutivel\n');

if (!fs.existsSync(PUB)) {
  console.log('  A pasta publicar-camadas/ nao existe. Rode antes:  npm run publicar:camadas\n');
  process.exit(1);
}

const CAMADAS = ['WS_MINT.html', 'WS_REAL.html', 'WS_ATELIER.html',
  'WS_STUDIO.html', 'WS_MUNDO.html'];

/* ============================================== 1. conteudo */
console.log('conteudo');

t('as cinco camadas foram publicadas', () => {
  for (const c of CAMADAS) certo(existe(c), 'faltou ' + c);
});

t('o portal NAO vem junto', () => {
  /* O portal e a demonstracao: uma pagina de topo com seu proprio
     X-Frame-Options. Aqui ele so criaria uma segunda porta de entrada, fora do
     controle da aplicacao. Ele pertence ao publicar.mjs. */
  certo(!existe('index.html'), 'index.html (portal) entrou no deploy embutivel');
  certo(!existe('WS_PLATAFORMA.html'), 'o portal entrou no deploy embutivel');
});

t('nenhuma configuracao com chave', () => {
  certo(!existe('ws-config.json'), 'ws-config.json no pacote');
});

/* ============================================== 2. quem pode embutir */
console.log('\nquem pode embutir');

const HEADERS = ler('_headers');

t('o cabecalho declara frame-ancestors', () => {
  certo(/Content-Security-Policy:\s*frame-ancestors/i.test(HEADERS),
    'sem frame-ancestors qualquer site embute a camada');
});

t('NAO existe X-Frame-Options no host das camadas', () => {
  /* SAMEORIGIN aqui bloquearia justamente a aplicacao, que e outro host. O
     cabecalho antigo nao sabe expressar "so estas origens" — o novo sabe. */
  certo(!/^\s*X-Frame-Options/mi.test(HEADERS),
    'X-Frame-Options no host das camadas bloqueia quem deveria poder embutir');
});

t('nenhum curinga na lista de quem embute', () => {
  const linha = (HEADERS.match(/frame-ancestors[^\n]*/i) || [''])[0];
  certo(linha, 'linha de frame-ancestors ausente');
  certo(!/\*/.test(linha),
    'curinga em frame-ancestors: qualquer site passaria a poder embutir e comandar');
  certo(!/\bhttp:\/\//.test(linha), 'origem http:// em frame-ancestors');
});

t('as duas metades do contrato de origem concordam', () => {
  /* O cabecalho diz quem PODE EMBUTIR; a lista dentro da camada diz de quem ela
     ACEITA COMANDO. Se divergirem, o iframe carrega e ignora tudo: a camada
     fica "carregando" para sempre e nada no console explica. */
  const linha = (HEADERS.match(/frame-ancestors([^;\n]*)/i) || [, ''])[1];
  const noCabecalho = (linha.match(/https:\/\/[^\s;]+/g) || []);
  certo(noCabecalho.length > 0, 'nenhuma origem em frame-ancestors');

  const html = ler('WS_MINT.html');
  const bloco = (html.match(/const ORIGENS_APP=\[([\s\S]*?)\];/) || [, ''])[1];
  const naCamada = [...bloco.matchAll(/'(https:\/\/[^']+)'/g)].map(m => m[1]);
  certo(naCamada.length > 0, 'ORIGENS_APP nao encontrada no WS_MINT.html');

  const orfas = noCabecalho.filter(o => !naCamada.includes(o));
  certo(orfas.length === 0,
    'o cabecalho libera origens que a camada recusa: ' + orfas.join(' · '));
});

/* ============================================== 3. cache e indexacao */
console.log('\ncache e indexacao');

t('o HTML das camadas sempre revalida', () => {
  certo(/\/\*\.html[\s\S]*?must-revalidate/.test(HEADERS),
    'camada em cache serve contrato de mensagens velho, e o handshake falha sem explicacao');
});

t('as camadas nao sao indexaveis', () => {
  certo(existe('robots.txt'), 'sem robots.txt');
  certo(/Disallow:\s*\//.test(ler('robots.txt')),
    'camada indexada vira iframe orfao no buscador, sem a moldura que explica');
});

/* ============================================== 4. segredos e transporte */
console.log('\nsegredos e transporte');

t('nenhuma chave embutida em nenhum arquivo publicado', () => {
  const suspeitos = [];
  for (const n of fs.readdirSync(PUB)) {
    if (!/\.(html|json|js|txt)$/i.test(n)) continue;
    const c = ler(n);
    if (/AIza[0-9A-Za-z_\-]{30,}/.test(c)) suspeitos.push('Google: ' + n);
    if (/sk-[A-Za-z0-9]{20,}/.test(c)) suspeitos.push('API: ' + n);
    if (/mint_live_[A-Za-z0-9_\-]{10,}/.test(c)) suspeitos.push('Mint: ' + n);
    if (/msy_[A-Za-z0-9]{20,}/.test(c)) suspeitos.push('Meshy: ' + n);
  }
  certo(suspeitos.length === 0, suspeitos.join(' · '));
});

t('nenhuma referencia http:// insegura', () => {
  const ruins = [];
  for (const c of CAMADAS) {
    const m = ler(c).match(/http:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)[^\s'")]+/g);
    if (m) ruins.push(c + ': ' + m.slice(0, 2).join(', '));
  }
  certo(ruins.length === 0, ruins.join(' · '));
});

t('o walkthrough publicado valida a origem de quem manda', () => {
  const h = ler('WS_MINT.html');
  certo(/origemPermitida\(e\.origin\)/.test(h), 'sem checagem de origem');
  /* A folga de localhost e so para desenvolvimento; num deploy publicado ela
     nunca pode valer. Quem prende isso e o EM_DEV. */
  certo(/EM_DEV\s*&&\s*LOCAL\.test/.test(h),
    'a folga de localhost escapou do EM_DEV — em producao qualquer origem passaria');
  certo(!/postMessage\([^)]*'\*'\)/.test(h), "postMessage com destino curinga");
});

/* ============================================== 5. peso */
console.log('\npeso');

t('o host das camadas nao carrega os mundos pesados', () => {
  /* Os .rad de ~42 MB vivem em object storage com CDN. Um deles aqui
     transformaria cada deploy num upload de dezenas de megabytes. */
  const pesados = [];
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { varrer(p); continue; }
      if (/\.(rad|splat|ply)$/i.test(n)) pesados.push(n);
    }
  })(PUB);
  certo(pesados.length === 0, 'mundo em splat no deploy: ' + pesados.join(', '));
});

t('o deploy inteiro cabe num carregamento razoavel', () => {
  let total = 0;
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) varrer(p); else total += st.size;
    }
  })(PUB);
  const mb = total / 1048576;
  certo(mb < 8, 'deploy com ' + mb.toFixed(1) + ' MB');
  console.log('      (' + mb.toFixed(1) + ' MB no total)');
});

console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM — NAO PUBLIQUE\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram — camadas liberadas para publicacao');
  console.log('─'.repeat(58) + '\n');
}
