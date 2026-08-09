/* ---------------------------------------------------------------------------
   rodar-tudo.mjs — executa as seis suítes e devolve um total honesto.

   uso:  npm test              todas, incluindo o audit do Studio (lento, jsdom)
         npm run test:rapido   só as cinco rápidas — é o que roda a cada commit

   Por que este arquivo existe: as suítes viviam soltas, cada uma resolvendo
   caminho por conta própria, e o total de 161 que se citava incluía 21 testes
   de deploy que não tinham como rodar (dependem de publicar/, que não existia)
   e 24 do Studio que exigem jsdom. Aqui o total é o que de fato executou, e o
   que não executou aparece dito, não somado.
--------------------------------------------------------------------------- */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const RAPIDO = process.argv.includes('--rapido');

/* as cinco rápidas: só leem HTML, rodam em menos de um segundo cada */
const RAPIDAS = [
  ['walkthrough', 'ws_mint_test.cjs'],
  ['tour 360', 'ws_real_test.cjs'],
  ['atelier', 'ws_atelier_test.cjs'],
  ['sala reconstruída', 'ws_sala_test.cjs'],
  ['contrato de mensagens', 'ws_contrato_test.cjs'],
];

const linha = (c = '─') => c.repeat(64);
let totalOk = 0, totalFalhas = 0;
const pulados = [];
const quebrados = [];

function rodar(rotulo, arquivo, cwd = RAIZ) {
  const r = spawnSync(process.execPath, [path.join(AQUI, arquivo)], {
    cwd, encoding: 'utf8',
  });
  const saida = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(saida);

  /* "  21/21 testes passaram"  ou  "  18 passaram, 3 FALHARAM" */
  const bom = saida.match(/(\d+)\/\1 testes passaram/);
  const ruim = saida.match(/(\d+) passaram, (\d+) FALHARAM/);
  if (bom) { totalOk += +bom[1]; return true; }
  if (ruim) { totalOk += +ruim[1]; totalFalhas += +ruim[2]; return false; }

  /* o audit do Studio é mais antigo que as outras suítes e reporta noutro
     formato: "RESULTADO: 24 passaram · 0 falharam" */
  const studio = saida.match(/RESULTADO:\s*(\d+) passaram[^\d]+(\d+) falharam/);
  if (studio) {
    totalOk += +studio[1]; totalFalhas += +studio[2];
    return +studio[2] === 0;
  }

  quebrados.push(`${rotulo} — a suíte não chegou a reportar total (código ${r.status})`);
  return false;
}

console.log('\n' + linha('═'));
console.log('  WS PLATAFORMA — suíte completa' + (RAPIDO ? ' (modo rápido)' : ''));
console.log(linha('═'));

for (const [rotulo, arq] of RAPIDAS) rodar(rotulo, arq);

/* ---------------------------------------------------- deploy: precisa do pacote */
console.log('\n' + linha() + '\n  pacote de publicação\n' + linha());
const pub = spawnSync(process.execPath, [path.join(RAIZ, '07-referencia', 'publicar.mjs')], {
  cwd: RAIZ, encoding: 'utf8',
});
if (pub.status !== 0) {
  quebrados.push('deploy — publicar.mjs falhou, os 21 testes de pacote não rodaram');
  console.log('  ✘ publicar.mjs falhou:\n' + (pub.stderr || pub.stdout));
} else {
  console.log('  ✔ publicar/ gerado');
  rodar('deploy', 'ws_deploy_test.cjs');
}

/* ------------------------------- camadas: o deploy embutível (Pages)
   Pasta diferente do `publicar/` de propósito: aquele é a demonstração, com
   portal e X-Frame-Options de página de topo; esta é o produto embutível, com
   frame-ancestors e sem portal. Os dois precisam continuar existindo. */
console.log('\n' + linha() + '\n  deploy embutível das camadas\n' + linha());
const cam = spawnSync(process.execPath, [path.join(RAIZ, '07-referencia', 'publicar-camadas.mjs')], {
  cwd: RAIZ, encoding: 'utf8',
});
if (cam.status !== 0) {
  quebrados.push('camadas — publicar-camadas.mjs falhou');
  console.log('  ✘ publicar-camadas.mjs falhou:\n' + (cam.stderr || cam.stdout));
} else {
  console.log('  ✔ publicar-camadas/ gerado');
  rodar('camadas', 'ws_camadas_deploy_test.cjs');
}

/* ------------------------------------------------------- studio: exige jsdom */
if (RAPIDO) {
  pulados.push('audit do Studio (24 testes) — modo rápido; roda no job noturno');
} else {
  const temJsdom = fs.existsSync(path.join(RAIZ, 'node_modules', 'jsdom'));
  if (!temJsdom) {
    pulados.push('audit do Studio (24 testes) — jsdom não instalado; rode `npm install`');
  } else {
    console.log('\n' + linha() + '\n  studio (jsdom, lento)\n' + linha());
    rodar('studio', 'ws_audit.cjs');
  }
}

/* ------------------------------------------------------------------ resumo */
console.log('\n' + linha('═'));
console.log(`  TOTAL EXECUTADO: ${totalOk} passaram, ${totalFalhas} falharam`);
for (const p of pulados)    console.log('  ○ não executado: ' + p);
for (const q of quebrados)  console.log('  ✘ ' + q);
console.log(linha('═') + '\n');

process.exit(totalFalhas || quebrados.length ? 1 : 0);
