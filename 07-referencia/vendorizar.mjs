/* ---------------------------------------------------------------------------
   vendorizar.mjs — baixa as bibliotecas de CDN para dentro do projeto.

   uso:  node 07-referencia/vendorizar.mjs           baixa e confere
         node 07-referencia/vendorizar.mjs --aplicar baixa e reescreve o import
                                                     map do WS_MINT.html

   POR QUE ISTO EXISTE

   O import map do walkthrough já traz `integrity` com hash de cada módulo, o
   que é a proteção correta contra o CDN entregar bytes diferentes amanhã. Mas
   ela não cobre dois riscos que continuam de pé:

     · DISPONIBILIDADE. Hash não ajuda quando o unpkg está fora do ar. As sete
       camadas carregam Three.js de CDN público; uma instabilidade derruba o
       produto inteiro, e isso já aconteceu com CDNs grandes mais de uma vez.

     · O SEGUNDO SALTO DO esm.sh. O que o mapa importa do esm.sh é um shim de
       109 bytes que reexporta do módulo real. O hash cobre o shim; o módulo
       real, não.

   Auto-hospedar resolve os dois de uma vez. O custo é ~900 KB no repositório e
   uma atualização manual quando a versão mudar — que é exatamente o tipo de
   mudança que se quer deliberada, não automática.
--------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const DESTINO = path.join(RAIZ, '02-camadas', 'vendor');
const CAMADA = path.join(RAIZ, '02-camadas', 'walkthrough', 'WS_MINT.html');
const APLICAR = process.argv.includes('--aplicar');

const TRES = '0.184.0';
const SPARK = '2.1.0';

/* caminho local  ←  url de origem */
const ARQUIVOS = {
  [`three@${TRES}/three.module.js`]:
    `https://unpkg.com/three@${TRES}/build/three.module.js`,
  [`three@${TRES}/addons/loaders/GLTFLoader.js`]:
    `https://unpkg.com/three@${TRES}/examples/jsm/loaders/GLTFLoader.js`,
  [`three@${TRES}/addons/loaders/DRACOLoader.js`]:
    `https://unpkg.com/three@${TRES}/examples/jsm/loaders/DRACOLoader.js`,
  [`three@${TRES}/addons/utils/BufferGeometryUtils.js`]:
    `https://unpkg.com/three@${TRES}/examples/jsm/utils/BufferGeometryUtils.js`,
  [`three@${TRES}/addons/utils/SkeletonUtils.js`]:
    `https://unpkg.com/three@${TRES}/examples/jsm/utils/SkeletonUtils.js`,
  [`spark@${SPARK}/spark.mjs`]:
    `https://esm.sh/@sparkjsdev/spark@${SPARK}/es2022/spark.mjs?external=three`,
};

const sha384 = (b) => 'sha384-' + crypto.createHash('sha384').update(b).digest('base64');
const log = (s) => console.log('  ' + s);

console.log('\nWS PLATAFORMA — auto-hospedando as bibliotecas\n');

let total = 0;
const hashes = {};

for (const [rel, url] of Object.entries(ARQUIVOS)) {
  const alvo = path.join(DESTINO, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });

  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) {
    console.log(`  ✘ ${rel}  —  ${url} respondeu ${r.status}`);
    process.exitCode = 1;
    continue;
  }
  let texto = await r.text();

  /* o esm.sh reescreve os especificadores para caminhos absolutos dele; para
     rodar local, `three` precisa voltar a ser o especificador do import map */
  texto = texto.replace(/from\s*["']https:\/\/esm\.sh\/[^"']*three[^"']*["']/g, 'from "three"');

  const buf = Buffer.from(texto, 'utf8');
  fs.writeFileSync(alvo, buf);
  hashes[rel] = sha384(buf);
  total += buf.length;
  log(`✔ ${rel}  ${(buf.length / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(DESTINO, 'PROCEDENCIA.json'),
  JSON.stringify({
    gerado_por: '07-referencia/vendorizar.mjs',
    three: TRES, spark: SPARK,
    arquivos: Object.fromEntries(
      Object.entries(ARQUIVOS).map(([rel, url]) => [rel, { url, integrity: hashes[rel] }])),
  }, null, 2));
log('✔ PROCEDENCIA.json  (de onde veio cada byte e com que hash)');

console.log(`\n  ${(total / 1024).toFixed(0)} KB em 02-camadas/vendor/\n`);

/* ------------------------------------------------------------------ aplicar */
const MAPA_LOCAL = `<script type="importmap">
{
  "imports": {
    "three": "../vendor/three@${TRES}/three.module.js",
    "three/addons/": "../vendor/three@${TRES}/addons/",
    "@sparkjsdev/spark": "../vendor/spark@${SPARK}/spark.mjs"
  }
}
<\/script>`;

if (!APLICAR) {
  console.log('  Nada foi alterado. Para trocar o import map do WS_MINT.html:');
  console.log('    node 07-referencia/vendorizar.mjs --aplicar\n');
  console.log('  O mapa ficaria assim:\n');
  console.log(MAPA_LOCAL.split('\n').map((l) => '    ' + l).join('\n') + '\n');
  console.log('  ATENÇÃO: o caminho relativo acima vale para a árvore-fonte.');
  console.log('  O pacote publicado é plano — ajuste publicar.mjs para copiar');
  console.log('  vendor/ junto e use "./vendor/…" no mapa.\n');
} else {
  const html = fs.readFileSync(CAMADA, 'utf8');
  const novo = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, MAPA_LOCAL);
  if (novo === html) {
    console.log('  ✘ não encontrei o import map em WS_MINT.html — nada alterado\n');
    process.exitCode = 1;
  } else {
    fs.writeFileSync(CAMADA, novo);
    console.log('  ✔ import map do WS_MINT.html apontado para vendor/');
    console.log('  ▲ ws_mint_test.cjs exige three@0.18x e spark@2 por HTTPS —');
    console.log('    ajuste o teste antes de commitar, ele vai reprovar de propósito.\n');
  }
}
