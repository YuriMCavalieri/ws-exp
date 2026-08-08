/* ---------------------------------------------------------------------------
   publicar.mjs — monta a pasta `publicar/` pronta para subir na internet.
   Funciona igual em Netlify, Cloudflare Pages e Vercel.

   uso:  node pipeline/publicar.mjs
   saída: publicar/  → arraste esta pasta no Netlify Drop, ou aponte o build para ela

   Regra inegociável: este script NUNCA copia ws-config.json.
   A chave entra depois, direto no painel do provedor ou por upload manual.
--------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const SAIDA = path.join(RAIZ, 'publicar');

const PAGINAS = ['WS_PLATAFORMA.html', 'WS_MUNDO.html', 'WS_STUDIO.html',
  'WS_ATELIER.html', 'WS_REAL.html', 'WS_MINT.html'];
const PASTAS = ['assets'];
const PROIBIDOS = [/ws-config\.json$/i, /\.env/i, /node_modules/];

const log = (s) => console.log('  ' + s);

/* ------------------------------------------------------------------ limpeza */
/* OneDrive costuma segurar arquivo aberto: apagar em bloco falha com EPERM.
   Sobrescrever é suficiente, e o que sobrar de versão antiga é reportado. */
try { if (fs.existsSync(SAIDA)) fs.rmSync(SAIDA, { recursive: true, force: true }); }
catch (e) { console.log('  ▲ pasta antiga em uso (' + e.code + ') — sobrescrevendo no lugar'); }
fs.mkdirSync(SAIDA, { recursive: true });
console.log('\nWS PLATAFORMA — montando o pacote de publicação\n');

/* ------------------------------------------------------------------ páginas */
let bytes = 0;
for (const p of PAGINAS) {
  const orig = path.join(RAIZ, p);
  if (!fs.existsSync(orig)) throw new Error('faltando: ' + p);
  const conteudo = fs.readFileSync(orig);
  fs.writeFileSync(path.join(SAIDA, p), conteudo);
  bytes += conteudo.length;
  log('✔ ' + p + '  ' + (conteudo.length / 1024).toFixed(0) + ' KB');
}
/* o portal também responde na raiz do domínio */
fs.copyFileSync(path.join(RAIZ, 'WS_PLATAFORMA.html'), path.join(SAIDA, 'index.html'));
log('✔ index.html  (cópia do portal — a raiz do domínio abre nele)');

/* ------------------------------------------------------------------- pastas */
for (const d of PASTAS) {
  const orig = path.join(RAIZ, d);
  if (!fs.existsSync(orig)) continue;
  /* os mundos em splat vão junto: sem eles o link publicado não abre sozinho.
     São grandes, mas ficam com cache imutável no CDN. */
  /* os mundos agora vêm do CDN por HTTPS: os .splat locais viraram sobra */
  try{ fs.cpSync(orig, path.join(SAIDA, d), { recursive: true, force: true,
    filter: (src) => !src.includes(`${path.sep}mundos`) });
  }catch(e){ console.log('  ▲ ' + d + '/ parcialmente em uso (' + e.code + ') — mantido o que já estava'); }
  const n = fs.readdirSync(orig).length;
  log('✔ ' + d + '/  (' + n + ' arquivo' + (n > 1 ? 's' : '') + ')');
}

/* ------------------------------------------------- cabeçalhos de segurança */
fs.writeFileSync(path.join(SAIDA, '_headers'), `# Netlify e Cloudflare Pages leem este arquivo.
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), payment=(), geolocation=(self)
  Cross-Origin-Opener-Policy: same-origin

# modelos e mundos 3D não mudam: cache longo e imutável
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# as páginas mudam a cada publicação: sempre revalidar
/*.html
  Cache-Control: public, max-age=0, must-revalidate

# a configuração com a chave nunca pode ficar em cache de CDN
/ws-config.json
  Cache-Control: no-store
`);
log('✔ _headers  (segurança + cache)');

/* ----------------------------------------------------- rotas amigáveis ---- */
fs.writeFileSync(path.join(SAIDA, '_redirects'), `# endereços curtos para compartilhar
/mundo     /index.html?j=mundo     200
/studio    /index.html?j=studio    200
/atelier   /index.html?j=atelier   200
/real      /index.html?j=real      200
/tour      /index.html?j=real      200
/walkthrough /index.html?j=mint    200
/ambiente  /index.html?j=mint      200
`);
log('✔ _redirects  (/mundo, /studio, /atelier, /real)');

/* ---------------------------------------------------------------- netlify -- */
fs.writeFileSync(path.join(RAIZ, 'netlify.toml'), `# Netlify: aponte o repositório para esta pasta e publique.
[build]
  command = "node pipeline/publicar.mjs"
  publish = "publicar"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    Referrer-Policy = "strict-origin-when-cross-origin"
`);
log('✔ netlify.toml  (na raiz do projeto)');

/* ----------------------------------------------------------------- vercel -- */
fs.writeFileSync(path.join(RAIZ, 'vercel.json'), JSON.stringify({
  buildCommand: 'node pipeline/publicar.mjs',
  outputDirectory: 'publicar',
  cleanUrls: true,
  rewrites: [
    { source: '/mundo', destination: '/index.html' },
    { source: '/studio', destination: '/index.html' },
    { source: '/atelier', destination: '/index.html' },
    { source: '/real', destination: '/index.html' }
  ],
  headers: [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
    ]
  }]
}, null, 2));
log('✔ vercel.json  (na raiz do projeto)');

/* ------------------------------------------------------------------ robots */
fs.writeFileSync(path.join(SAIDA, 'robots.txt'),
  `User-agent: *\nAllow: /\n\n# enquanto for demonstração privada, troque as duas linhas acima por:\n# User-agent: *\n# Disallow: /\n`);
log('✔ robots.txt');

/* --------------------------------------------------------------------- 404 */
fs.writeFileSync(path.join(SAIDA, '404.html'), `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página não encontrada — White Stone</title><style>
html,body{height:100%;margin:0;background:#0B0D11;color:#F8F6F0;display:flex;
  align-items:center;justify-content:center;text-align:center;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
.m{font-family:Georgia,serif;font-size:13px;letter-spacing:.34em;color:#C9A961;margin-bottom:22px}
h1{font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:26px;margin:0 0 12px}
p{color:rgba(248,246,240,.55);font-size:13px;line-height:1.7;max-width:380px;margin:0 auto 26px}
a{display:inline-block;padding:11px 22px;border:1px solid #C9A961;border-radius:9px;
  color:#C9A961;text-decoration:none;font-size:11.5px;letter-spacing:.1em}
a:hover{background:rgba(201,169,97,.1)}
</style></head><body><div>
<div class="m">WHITE STONE</div>
<h1>Este endereço não existe</h1>
<p>O link pode ter expirado ou sido digitado com um caractere a mais.</p>
<a href="/">VOLTAR AO INÍCIO</a>
</div></body></html>`);
log('✔ 404.html');

/* -------------------------------------------------- exemplo de configuração */
fs.copyFileSync(path.join(RAIZ, 'ws-config.exemplo.json'),
  path.join(SAIDA, 'ws-config.exemplo.json'));
log('✔ ws-config.exemplo.json  (modelo, sem chave)');

/* ------------------------------------------------------------- .gitignore -- */
fs.writeFileSync(path.join(RAIZ, '.gitignore'), `# nunca versionar
ws-config.json
.env
.env.*
node_modules/
publicar/
*.log
.DS_Store
`);
log('✔ .gitignore  (protege a chave)');

/* ---------------------------------------------------- verificação de saída */
/* sobra de versões anteriores: os mundos migraram para o CDN */
try { fs.rmSync(path.join(SAIDA, 'assets', 'mundos'), { recursive: true, force: true }); }
catch (e) { console.log('  ▲ publicar/assets/mundos travado pelo sistema de arquivos — apague à mão'); }

console.log('\nverificando o pacote…');
let alertas = 0;
function varrer(dir) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) { varrer(p); continue; }
    const rel = path.relative(SAIDA, p);
    if (PROIBIDOS.some(re => re.test(nome)) && nome !== 'ws-config.exemplo.json') {
      console.log('  ✘ ARQUIVO PROIBIDO NO PACOTE: ' + rel); alertas++;
    }
    if (/\.(html|json|js)$/i.test(nome)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/AIza[0-9A-Za-z_\-]{30,}/.test(t)) { console.log('  ✘ CHAVE GOOGLE EMBUTIDA em ' + rel); alertas++; }
      if (/sk-[A-Za-z0-9]{20,}/.test(t)) { console.log('  ✘ CHAVE DE API EMBUTIDA em ' + rel); alertas++; }
      if (/http:\/\/(?!localhost|www\.w3\.org)/.test(t)) { console.log('  ▲ referência http:// em ' + rel); alertas++; }
    }
  }
}
varrer(SAIDA);

const total = fs.readdirSync(SAIDA).length;
console.log('  ' + (alertas ? alertas + ' alerta(s)' : 'nenhum segredo, nenhum http:// inseguro'));
console.log('\n  pasta: publicar/   ' + total + ' itens   ~' + ((bytes * 2) / 1048576).toFixed(1) + ' MB\n');

console.log('próximos passos');
console.log('  1. Abra app.netlify.com/drop e arraste a pasta publicar/');
console.log('  2. Copie o link que aparece — já é público e com HTTPS');
console.log('  3. Para o mundo 3D funcionar, suba ws-config.json com a chave do Google');
console.log('  4. ANTES disso, restrinja a chave por referenciador HTTP no Google Cloud');
console.log('     e defina um teto de gasto diário. Sem isso, qualquer um gasta seu crédito.\n');
