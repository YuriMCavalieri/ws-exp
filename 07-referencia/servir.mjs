/* ---------------------------------------------------------------------------
   servir.mjs — servidor local para abrir o portal e as camadas.

   uso:  npm run servir            porta 8080
         npm run servir -- 3000    outra porta

   POR QUE NÃO BASTA ABRIR O ARQUIVO

   As camadas usam `fetch` para configuração e assets, e navegador nenhum faz
   fetch de `file://` — é regra de segurança, não defeito. O README antigo
   mandava `python3 -m http.server`, que funciona, mas serve a ÁRVORE-FONTE:
   o portal referencia `WS_MINT.html` ao lado dele, e na árvore-fonte a camada
   está em `02-camadas/walkthrough/`. Dava 404 e a jornada não abria.

   Este servidor resolve a mesma tradução que o publicar.mjs faz — nome plano
   → caminho na árvore — só que em memória, sem gerar pasta. O que você vê aqui
   é o que vai ao ar.
--------------------------------------------------------------------------- */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const PORTA = Number(process.argv[2]) || 8080;

/* mesmo mapa do publicar.mjs — nome publicado → caminho na árvore-fonte */
const FONTE = {
  'index.html':          '01-portal/index.html',
  'WS_PLATAFORMA.html':  '01-portal/index.html',
  'WS_MUNDO.html':       '02-camadas/mundo-3d/WS_MUNDO.html',
  'WS_STUDIO.html':      '02-camadas/studio-3d/WS_STUDIO.html',
  'WS_ATELIER.html':     '02-camadas/atelier/WS_ATELIER.html',
  'WS_REAL.html':        '02-camadas/tour-360/WS_REAL.html',
  'WS_MINT.html':        '02-camadas/walkthrough/WS_MINT.html',
  'WS_SALA_RECONSTRUIDA.html': '02-camadas/sala-reconstruida/WS_SALA_RECONSTRUIDA.html',
};

const TIPO = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
};

function resolver(url) {
  const limpo = decodeURIComponent(url.split('?')[0].split('#')[0]);
  const nome = limpo === '/' ? 'index.html' : limpo.replace(/^\//, '');

  if (FONTE[nome]) return path.join(RAIZ, FONTE[nome]);

  /* rotas curtas, iguais às do _redirects */
  const curta = { mundo: 'mundo', studio: 'studio', atelier: 'atelier',
    real: 'real', tour: 'real', walkthrough: 'mint', ambiente: 'mint' }[nome];
  if (curta) return { redirect: '/index.html?j=' + curta };

  /* assets do pacote: publicar/assets/x.glb ← 06-assets/x.glb */
  if (nome.startsWith('assets/')) return path.join(RAIZ, '06-assets', nome.slice(7));

  /* qualquer outro caminho: serve direto da árvore (contrato, testes, docs) */
  const direto = path.join(RAIZ, nome);
  return direto.startsWith(RAIZ) ? direto : null;   /* barra travessia de diretório */
}

http.createServer((req, res) => {
  const alvo = resolver(req.url);

  if (alvo && alvo.redirect) {
    res.writeHead(302, { Location: alvo.redirect });
    return res.end();
  }
  if (!alvo || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — ' + req.url + '\n\nCaminhos servidos:\n  ' +
      Object.keys(FONTE).join('\n  ') + '\n  assets/*');
  }

  res.writeHead(200, {
    'Content-Type': TIPO[path.extname(alvo)] || 'application/octet-stream',
    /* os mesmos cabeçalhos que o _headers publica, para o dev bater com o ar */
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(alvo).pipe(res);
}).listen(PORTA, () => {
  console.log('\n  WS PLATAFORMA em  http://localhost:' + PORTA + '\n');
  console.log('    /                 portal');
  console.log('    /walkthrough      o tour em Gaussian splat');
  console.log('    /mundo /studio /atelier /tour\n');
  console.log('  As camadas rodam em localhost, que está na lista de origens');
  console.log('  aceitas do WS_MINT.html — o handshake funciona aqui.\n');
});
