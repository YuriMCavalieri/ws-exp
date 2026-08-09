/* ---------------------------------------------------------------------------
   conferir-sri.mjs — baixa cada módulo do import map e confere o hash.

   uso:  node 05-testes/conferir-sri.mjs

   Isto NÃO é um teste de unidade e não entra no `npm test`: ele fala com a
   internet, e um unpkg fora do ar reprovaria código que está correto. Roda no
   job noturno do CI, com continue-on-error.

   O que ele detecta é a única coisa que o SRI não consegue avisar sozinho: o
   dia em que o CDN passar a entregar bytes diferentes sob a mesma URL. Nesse
   dia a página simplesmente para de carregar no navegador do usuário, sem
   erro que ajude. Aqui o aviso chega antes, e com o hash novo pronto para
   colar — depois de conferir por que ele mudou.
--------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');

const CAMADAS = [
  ['walkthrough', '02-camadas/walkthrough/WS_MINT.html'],
  ['mundo',       '02-camadas/mundo-3d/WS_MUNDO.html'],
  ['studio',      '02-camadas/studio-3d/WS_STUDIO.html'],
  ['atelier',     '02-camadas/atelier/WS_ATELIER.html'],
  ['tour',        '02-camadas/tour-360/WS_REAL.html'],
];

const sha384 = (b) => 'sha384-' + crypto.createHash('sha384').update(b).digest('base64');

let conferidos = 0, divergentes = 0, semHash = [];

console.log('\nWS PLATAFORMA — conferência dos hashes de CDN\n');

for (const [nome, rel] of CAMADAS) {
  const arq = path.join(RAIZ, rel);
  if (!fs.existsSync(arq)) continue;
  const html = fs.readFileSync(arq, 'utf8');

  const bruto = (html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [, ''])[1];
  if (!bruto.trim()) continue;

  let mapa;
  try { mapa = JSON.parse(bruto); }
  catch (e) { console.log(`  ✘ ${nome}: import map ilegível — ${e.message}`); divergentes++; continue; }

  const urls = Object.values(mapa.imports || {}).filter((u) => /^https:/.test(u) && !u.endsWith('/'));
  if (!urls.length) continue;

  if (!mapa.integrity) {
    semHash.push(`${nome} (${urls.length} módulo${urls.length > 1 ? 's' : ''} de CDN sem integrity)`);
    continue;
  }

  console.log(`  ${nome}`);
  for (const [url, esperado] of Object.entries(mapa.integrity)) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) { console.log(`    ▲ ${r.status}  ${url}`); continue; }
      const real = sha384(Buffer.from(await r.arrayBuffer()));
      conferidos++;
      if (real === esperado) {
        console.log(`    ✔ ${url.replace(/^https:\/\//, '')}`);
      } else {
        divergentes++;
        console.log(`    ✘ HASH MUDOU  ${url}`);
        console.log(`        no arquivo: ${esperado}`);
        console.log(`        no CDN:     ${real}`);
      }
    } catch (e) {
      console.log(`    ▲ inalcançável: ${url} — ${e.message}`);
    }
  }
}

console.log('\n' + '─'.repeat(64));
console.log(`  ${conferidos} módulos conferidos, ${divergentes} divergentes`);
for (const s of semHash) console.log(`  ○ sem hash: ${s}`);
if (semHash.length) {
  console.log('\n  As camadas acima ainda carregam Three.js de CDN sem verificação');
  console.log('  de integridade. É o achado nº 4 da auditoria. O padrão a seguir');
  console.log('  está no import map do WS_MINT.html.');
}
console.log('─'.repeat(64) + '\n');

if (divergentes) {
  console.log('  Um hash divergente significa que o CDN entregou bytes diferentes');
  console.log('  sob a mesma URL. Descubra POR QUE antes de atualizar o hash —');
  console.log('  é exatamente o evento contra o qual o SRI existe para proteger.\n');
  process.exit(1);
}
