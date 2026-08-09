/* ---------------------------------------------------------------------------
   ws_deploy_test.cjs — verifica o pacote de publicação antes de ele ir ao ar.
   Roda DEPOIS de `node pipeline/publicar.mjs`.
   O que este teste impede: subir chave, subir link quebrado, subir http://.
   uso:  node pipeline/ws_deploy_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PUB = path.join(RAIZ, 'publicar');

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };
const ler = f => fs.readFileSync(path.join(PUB, f), 'utf8');
const existe = f => fs.existsSync(path.join(PUB, f));

console.log('\nWS PLATAFORMA — verificacao do pacote de publicacao\n');

if (!fs.existsSync(PUB)) {
  console.log('  A pasta publicar/ nao existe. Rode antes:  node 07-referencia/publicar.mjs\n');
  process.exit(1);
}

const PAGINAS = ['index.html', 'WS_PLATAFORMA.html', 'WS_MUNDO.html',
  'WS_STUDIO.html', 'WS_ATELIER.html', 'WS_REAL.html', 'WS_MINT.html'];

/* ================================================== 1. conteudo do pacote */
console.log('conteudo');

t('todas as paginas foram para o pacote', () => {
  for (const p of PAGINAS) certo(existe(p), 'faltou ' + p);
});

t('a raiz do dominio abre no portal', () => {
  certo(ler('index.html') === ler('WS_PLATAFORMA.html'),
    'index.html divergiu do portal — rode publicar.mjs de novo');
});

t('os modelos 3D acompanham o pacote', () => {
  certo(existe('assets'), 'pasta assets ausente');
  const gl = fs.readdirSync(path.join(PUB, 'assets')).filter(f => /\.glb$/i.test(f));
  certo(gl.length > 0, 'nenhum GLB em assets/');
});

t('arquivos de operacao presentes', () => {
  for (const f of ['_headers', '_redirects', 'robots.txt', '404.html'])
    certo(existe(f), 'faltou ' + f);
});

/* ================================================== 2. segredos */
console.log('\nsegredos');

t('a configuracao com a chave NAO esta no pacote', () => {
  certo(!existe('ws-config.json'), 'ws-config.json foi para o pacote — remova antes de publicar');
  certo(existe('ws-config.exemplo.json'), 'o modelo sem chave deveria estar');
});

t('nenhuma chave embutida em nenhum arquivo do pacote', () => {
  const suspeitos = [];
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { varrer(p); continue; }
      if (!/\.(html|json|js|txt)$/i.test(n)) continue;
      const c = fs.readFileSync(p, 'utf8');
      if (/AIza[0-9A-Za-z_\-]{30,}/.test(c)) suspeitos.push('Google: ' + n);
      if (/sk-[A-Za-z0-9]{20,}/.test(c)) suspeitos.push('API: ' + n);
      if (/msy_[A-Za-z0-9]{20,}/.test(c)) suspeitos.push('Meshy: ' + n);
    }
  })(PUB);
  certo(suspeitos.length === 0, suspeitos.join(' · '));
});

t('.gitignore protege a chave', () => {
  const g = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
  for (const k of ['ws-config.json', 'node_modules', '.env'])
    certo(g.includes(k), '.gitignore nao cobre ' + k);
});

t('o modelo de configuracao nao tem chave de verdade', () => {
  const j = JSON.parse(ler('ws-config.exemplo.json'));
  certo(/COLE_AQUI|OPCIONAL/.test(j.googleMapsApiKey + j.tomtomKey),
    'o exemplo parece conter chave real');
});

/* ================================================== 3. links internos */
console.log('\nlinks internos');

t('todo arquivo referenciado existe no pacote', () => {
  const faltando = [];
  for (const p of PAGINAS) {
    const c = ler(p);
    const refs = [...c.matchAll(/(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const r of refs) {
      if (/^(https?:|data:|about:|#|\$\{|mailto:)/.test(r)) continue;
      const alvo = r.replace(/^\.\//, '').split('?')[0].split('#')[0];
      if (!alvo) continue;
      if (!existe(alvo)) faltando.push(p + ' → ' + alvo);
    }
  }
  certo(faltando.length === 0, faltando.join(' · '));
});

t('nenhuma referencia http:// insegura', () => {
  const ruins = [];
  for (const p of PAGINAS) {
    const c = ler(p);
    const m = c.match(/http:\/\/(?!localhost|www\.w3\.org)[^\s'")]+/g);
    if (m) ruins.push(p + ': ' + m.slice(0, 2).join(', '));
  }
  certo(ruins.length === 0, ruins.join(' · '));
});

t('as bibliotecas externas vem por HTTPS', () => {
  const c = ler('WS_REAL.html');
  certo(/https:\/\/unpkg\.com\/three@0\.170\.0/.test(c), 'Three.js sem origem HTTPS fixada');
});

/* ================================================== 4. cabecalhos e rotas */
console.log('\ncabecalhos e rotas');

t('a pagina pode ser exibida em iframe pelo proprio portal', () => {
  const h = ler('_headers');
  certo(/X-Frame-Options: SAMEORIGIN/.test(h),
    'DENY quebraria os iframes do portal; SAMEORIGIN e o correto aqui');
});

t('cabecalhos de seguranca minimos presentes', () => {
  const h = ler('_headers');
  for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'])
    certo(h.includes(k), 'faltou ' + k);
});

t('a configuracao nunca fica em cache de CDN', () => {
  certo(/\/ws-config\.json[\s\S]*no-store/.test(ler('_headers')), 'ws-config.json cacheavel');
});

t('modelos 3D com cache longo, paginas sempre revalidadas', () => {
  const h = ler('_headers');
  certo(/\/assets\/\*[\s\S]*immutable/.test(h), 'assets sem cache longo');
  certo(/\/\*\.html[\s\S]*must-revalidate/.test(h), 'HTML pode ficar velho no navegador');
});

t('rotas curtas apontam para as quatro jornadas', () => {
  const r = ler('_redirects');
  for (const j of ['mundo', 'studio', 'atelier', 'real'])
    certo(new RegExp('^/' + j + '\\s', 'm').test(r), 'sem rota /' + j);
});

/* ================================================== 5. link direto */
console.log('\nlink direto por jornada');

/* reproduz jornadaDaURL do portal para testar sem navegador */
const JORNADAS = ['mundo', 'studio', 'atelier', 'real'];
function jornadaDaURL(href) {
  const u = new URL(href);
  const q = (u.searchParams.get('j') || u.hash.replace('#', '') || '').toLowerCase();
  if (JORNADAS.includes(q)) return q;
  const cam = u.pathname.split('/').filter(Boolean).pop() || '';
  const c = cam.replace(/\.html$/, '').toLowerCase();
  if (JORNADAS.includes(c)) return c;
  if (c === 'tour') return 'real';
  return null;
}

t('a funcao de link direto existe no portal', () => {
  certo(/function jornadaDaURL/.test(ler('index.html')), 'sem leitura de jornada na URL');
  certo(/history\.replaceState/.test(ler('index.html')), 'a URL nao acompanha a navegacao');
});

t('?j=, #hash e caminho curto levam a mesma jornada', () => {
  certo(jornadaDaURL('https://ws.example/?j=real') === 'real', 'query');
  certo(jornadaDaURL('https://ws.example/#atelier') === 'atelier', 'hash');
  certo(jornadaDaURL('https://ws.example/studio') === 'studio', 'caminho');
  certo(jornadaDaURL('https://ws.example/tour') === 'real', 'apelido /tour');
  certo(jornadaDaURL('https://ws.example/') === null, 'raiz deveria abrir o portal');
  certo(jornadaDaURL('https://ws.example/?j=lixo') === null, 'valor invalido deveria ser ignorado');
});

t('existe botao para copiar o link da jornada aberta', () => {
  certo(/id="copiar"/.test(ler('index.html')), 'sem botao copiar link');
  certo(/clipboard\.writeText/.test(ler('index.html')), 'nao copia de fato');
});

/* ================================================== 6. peso */
console.log('\npeso');

t('o pacote cabe num carregamento razoavel', () => {
  let total = 0;
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) varrer(p); else total += st.size;
    }
  })(PUB);
  const mb = total / 1048576;
  /* os mundos em splat dominam o peso; o que importa é o que carrega ANTES deles */
  let leve = 0;
  (function varrer(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (n !== 'mundos') varrer(p); }
      else leve += st.size;
    }
  })(PUB);
  certo(leve / 1048576 < 8, 'carga inicial com ' + (leve / 1048576).toFixed(1) + ' MB — pesada para 4G');
  const sobra = fs.existsSync(path.join(PUB, 'assets', 'mundos'));
  certo(mb < 8, 'pacote com ' + mb.toFixed(1) + ' MB.' + (sobra
    ? ' Sobrou publicar/assets/mundos de uma versao anterior — os mundos agora vem'
      + ' do CDN por HTTPS. APAGUE essa pasta a mao (o OneDrive trava a exclusao'
      + ' automatica) e rode publicar.mjs de novo.'
    : ' Algo pesado entrou no pacote.'));
  console.log('      (' + mb.toFixed(1) + ' MB no total)');
});

t('nenhuma pagina isolada passa de 1 MB', () => {
  for (const p of PAGINAS) {
    const kb = fs.statSync(path.join(PUB, p)).size / 1024;
    certo(kb < 1024, p + ' com ' + kb.toFixed(0) + ' KB');
  }
});

console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM — NAO PUBLIQUE\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram — pacote liberado para publicacao');
  console.log('─'.repeat(58) + '\n');
}
