/* ---------------------------------------------------------------------------
   ws_real_test.cjs — testes da Camada Real (WS_REAL.html)
   Extrai as funções puras do arquivo entregue e as executa de verdade em Node.
   Não testa pixels: testa matemática, leitura de arquivo e integridade de dados.
   uso:  node pipeline/ws_real_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', '02-camadas', 'tour-360', 'WS_REAL.html'), 'utf8');

function fatia(ini, fim) {
  const a = HTML.indexOf(ini);
  const b = HTML.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('marcador nao encontrado: ' + ini);
  return HTML.slice(a, b);
}

const src =
  'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));\n' +
  fatia('function covDe(', '/* --- monta a malha na GPU --- */') +
  fatia('function exemploSplat(){', 'return {n,pos,esc,rot,cor,exemplo:true};') +
  'return {n,pos,esc,rot,cor,exemplo:true};}\n' +
  'module.exports={covDe,lerSplat,lerPly,reduzir,exemploSplat};';

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const { covDe, lerSplat, lerPly, reduzir, exemploSplat } = mod.exports;

/* ----------------------------------------------------------------- runner */
let ok = 0, falhas = [];
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
}
const perto = (a, b, tol = 1e-4) => {
  if (Math.abs(a - b) > tol) throw new Error(`esperado ~${b}, veio ${a}`);
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };

/* ------------------------------------------------- escritor .splat de teste */
function escreverSplat(lista) {
  const buf = Buffer.alloc(lista.length * 32);
  lista.forEach((g, i) => {
    const o = i * 32;
    buf.writeFloatLE(g.p[0], o); buf.writeFloatLE(g.p[1], o + 4); buf.writeFloatLE(g.p[2], o + 8);
    buf.writeFloatLE(g.s[0], o + 12); buf.writeFloatLE(g.s[1], o + 16); buf.writeFloatLE(g.s[2], o + 20);
    buf[o + 24] = g.c[0]; buf[o + 25] = g.c[1]; buf[o + 26] = g.c[2]; buf[o + 27] = g.c[3];
    // exportadores reais grampeiam em 0..255; sem isso, w=1 estoura para 0
    for (let k = 0; k < 4; k++)
      buf[o + 28 + k] = Math.max(0, Math.min(255, Math.round(g.r[k] * 128 + 128)));
  });
  return buf;
}
/* --------------------------------------------------- escritor .ply de teste */
function escreverPly(lista) {
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
    'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const cab = 'ply\nformat binary_little_endian 1.0\nelement vertex ' + lista.length + '\n' +
    props.map(p => 'property float ' + p).join('\n') + '\nend_header\n';
  const corpo = Buffer.alloc(lista.length * props.length * 4);
  lista.forEach((g, i) => props.forEach((p, j) =>
    corpo.writeFloatLE(g[p], (i * props.length + j) * 4)));
  return Buffer.concat([Buffer.from(cab, 'ascii'), corpo]);
}

console.log('\nWS CAMADA REAL — suite de testes\n');

/* =================================================== 1. covariancia 3D */
console.log('covariancia (escala + quaternio -> matriz 3x3)');

t('quaternio identidade produz covariancia diagonal', () => {
  const o = new Float32Array(6);
  covDe(2, 1, 0.5, 1, 0, 0, 0, o, 0);
  perto(o[0], 4);    // sigma00 = 2^2
  perto(o[3], 1);    // sigma11 = 1^2
  perto(o[5], 0.25); // sigma22 = 0.5^2
  perto(o[1], 0); perto(o[2], 0); perto(o[4], 0);
});

t('rotacao de 90 graus em Z troca os eixos X e Y', () => {
  const o = new Float32Array(6);
  const s = Math.SQRT1_2; // quat 90 deg em Z = (w=.707, x=0, y=0, z=.707)
  covDe(2, 1, 1, s, 0, 0, s, o, 0);
  perto(o[0], 1, 1e-3);
  perto(o[3], 4, 1e-3);
  perto(o[5], 1, 1e-3);
});

t('quaternio nao normalizado e corrigido internamente', () => {
  const a = new Float32Array(6), b = new Float32Array(6);
  covDe(1.3, 0.7, 0.2, 0.4, 0.1, -0.3, 0.6, a, 0);
  covDe(1.3, 0.7, 0.2, 0.8, 0.2, -0.6, 1.2, b, 0); // mesmo quat, escala 2x
  for (let i = 0; i < 6; i++) perto(a[i], b[i], 1e-4);
});

t('covariancia e simetrica e positiva semidefinida', () => {
  for (let k = 0; k < 200; k++) {
    const o = new Float32Array(6);
    const q = [Math.random() - .5, Math.random() - .5, Math.random() - .5, Math.random() - .5];
    covDe(Math.random() * 2 + .01, Math.random() * 2 + .01, Math.random() * 2 + .01,
      q[0], q[1], q[2], q[3], o, 0);
    certo(o[0] >= -1e-6 && o[3] >= -1e-6 && o[5] >= -1e-6, 'diagonal negativa');
    // determinante do menor 2x2 nao pode ser negativo
    certo(o[0] * o[3] - o[1] * o[1] >= -1e-5, 'menor 2x2 negativo');
    const det = o[0] * (o[3] * o[5] - o[4] * o[4])
      - o[1] * (o[1] * o[5] - o[4] * o[2])
      + o[2] * (o[1] * o[4] - o[3] * o[2]);
    certo(det >= -1e-5, 'determinante negativo: ' + det);
  }
});

t('rotacao preserva o traco (volume nao muda ao girar)', () => {
  const a = new Float32Array(6), b = new Float32Array(6);
  covDe(1.7, 0.4, 0.9, 1, 0, 0, 0, a, 0);
  const s = Math.SQRT1_2;
  covDe(1.7, 0.4, 0.9, s, s, 0, 0, b, 0);
  perto(a[0] + a[3] + a[5], b[0] + b[3] + b[5], 1e-3);
});

/* =================================================== 2. leitor .splat */
console.log('\nleitor .splat (32 bytes por gaussiana)');

const amostra = [
  { p: [1.5, -2.25, 3.0], s: [0.1, 0.2, 0.3], c: [255, 128, 0, 200], r: [1, 0, 0, 0] },
  { p: [-4.0, 0.5, 12.0], s: [0.05, 0.05, 0.9], c: [10, 20, 30, 40], r: [0.5, 0.5, -0.5, 0.5] },
  { p: [0, 0, 0], s: [1, 1, 1], c: [0, 0, 0, 255], r: [0, 1, 0, 0] }
];

t('posicoes, escalas e cores voltam identicas', () => {
  const buf = escreverSplat(amostra);
  const d = lerSplat(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  certo(d.n === 3, 'contou ' + d.n + ' gaussianas');
  perto(d.pos[0], 1.5); perto(d.pos[1], -2.25); perto(d.pos[2], 3.0);
  perto(d.esc[3], 0.05); perto(d.esc[5], 0.9);
  certo(d.cor[0] === 255 && d.cor[1] === 128 && d.cor[3] === 200, 'cor errada');
  certo(d.cor[8] === 0 && d.cor[11] === 255, 'cor da terceira errada');
});

t('quaternio sobrevive ao arredondamento de 8 bits', () => {
  const buf = escreverSplat(amostra);
  const d = lerSplat(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  perto(d.rot[0], 0.992, 0.01); // 255 -> (255-128)/128, o teto do formato
  perto(d.rot[1], 0, 0.01);
  perto(d.rot[4], 0.5, 0.01); perto(d.rot[6], -0.5, 0.01);
});

t('q e -q descrevem a mesma rotacao (imune ao sinal do quaternio)', () => {
  const a = new Float32Array(6), b = new Float32Array(6);
  covDe(1.1, 0.3, 0.7, 0.6, -0.2, 0.5, 0.4, a, 0);
  covDe(1.1, 0.3, 0.7, -0.6, 0.2, -0.5, -0.4, b, 0);
  for (let i = 0; i < 6; i++) perto(a[i], b[i], 1e-5);
});

t('arquivo vazio dispara erro legivel', () => {
  let deu = false;
  try { lerSplat(new ArrayBuffer(8)); } catch (e) {
    deu = /vazio|corrompido/.test(e.message);
  }
  certo(deu, 'nao levantou o erro esperado');
});

t('sobra de bytes no fim nao quebra a leitura', () => {
  const buf = Buffer.concat([escreverSplat(amostra), Buffer.alloc(7)]);
  const d = lerSplat(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  certo(d.n === 3, 'deveria ignorar a sobra, contou ' + d.n);
});

/* =================================================== 3. leitor .ply */
console.log('\nleitor .ply (saida do 3DGS / Polycam / SuperSplat)');

const plyAmostra = [{
  x: 2, y: -1, z: 0.5,
  f_dc_0: 1.0, f_dc_1: 0.0, f_dc_2: -1.0,
  opacity: 0,                       // sigmoid(0) = 0.5
  scale_0: 0, scale_1: Math.log(2), scale_2: Math.log(0.25), // exp -> 1, 2, 0.25
  rot_0: 1, rot_1: 0, rot_2: 0, rot_3: 0
}];

t('escalas logaritmicas viram escalas lineares', () => {
  const buf = escreverPly(plyAmostra);
  const d = lerPly(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  perto(d.esc[0], 1, 1e-3); perto(d.esc[1], 2, 1e-3); perto(d.esc[2], 0.25, 1e-3);
});

t('harmonico esferico grau 0 vira cor RGB', () => {
  const buf = escreverPly(plyAmostra);
  const d = lerPly(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  perto(d.cor[0], Math.round((0.5 + 0.28209479177387814) * 255), 1.5);
  perto(d.cor[1], Math.round(0.5 * 255), 1.5);
  perto(d.cor[2], Math.round((0.5 - 0.28209479177387814) * 255), 1.5);
});

t('opacidade passa por sigmoid', () => {
  const buf = escreverPly(plyAmostra);
  const d = lerPly(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  perto(d.cor[3], 127, 2); // sigmoid(0)=0.5 -> 127.5
});

t('ply ascii e recusado com mensagem clara', () => {
  const b = Buffer.from('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n');
  let msg = '';
  try { lerPly(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  catch (e) { msg = e.message; }
  certo(/binario|binário|little-endian/.test(msg), 'mensagem foi: ' + msg);
});

t('ply sem propriedades de splat e recusado', () => {
  const cab = 'ply\nformat binary_little_endian 1.0\nelement vertex 1\n' +
    'property float x\nproperty float y\nproperty float z\nend_header\n';
  const b = Buffer.concat([Buffer.from(cab), Buffer.alloc(12)]);
  let msg = '';
  try { lerPly(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  catch (e) { msg = e.message; }
  certo(/Gaussian Splatting|propriedade/.test(msg), 'mensagem foi: ' + msg);
});

/* =================================================== 4. reducao por importancia */
console.log('\nreducao por importancia (opacidade x volume)');

function fake(n) {
  const pos = new Float32Array(n * 3), esc = new Float32Array(n * 3),
    rot = new Float32Array(n * 4), cor = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = i;
    const e = 0.01 + (i / n) * 0.5;
    esc[i * 3] = esc[i * 3 + 1] = esc[i * 3 + 2] = e;
    rot[i * 4] = 1;
    cor[i * 4 + 3] = Math.min(255, 20 + i);
  }
  return { n, pos, esc, rot, cor };
}

t('abaixo do teto nada e descartado', () => {
  const d = fake(500);
  const r = reduzir(d, 1000);
  certo(r.n === 500, 'mudou para ' + r.n);
  certo(r === d, 'deveria devolver o mesmo objeto');
});

t('acima do teto sobra exatamente o teto', () => {
  const r = reduzir(fake(5000), 800);
  certo(r.n === 800, 'sobrou ' + r.n);
  certo(r.reduzido === 5000, 'nao registrou o total original');
});

t('as gaussianas mais importantes sao as que ficam', () => {
  const r = reduzir(fake(5000), 100);
  // importancia cresce com o indice, entao devem sobrar os indices altos
  let minPos = Infinity;
  for (let i = 0; i < r.n; i++) minPos = Math.min(minPos, r.pos[i * 3]);
  certo(minPos > 4000, 'manteve gaussiana irrelevante em ' + minPos);
});

t('nenhum dado corrompido apos a reducao', () => {
  const r = reduzir(fake(3000), 250);
  for (let i = 0; i < r.n * 3; i++) certo(Number.isFinite(r.pos[i]) && Number.isFinite(r.esc[i]), 'NaN em ' + i);
  for (let i = 0; i < r.n; i++) certo(r.esc[i * 3] > 0, 'escala zero');
});

/* =================================================== 5. cena de exemplo */
console.log('\ncena de exemplo gerada por codigo');

const ex = exemploSplat();

t('gera volume suficiente para parecer denso', () => {
  certo(ex.n > 60000, 'gerou apenas ' + ex.n + ' gaussianas');
});

t('marcada como exemplo, nunca como captura', () => {
  certo(ex.exemplo === true, 'faltou a marca exemplo:true');
});

t('todos os arrays tem o tamanho coerente com n', () => {
  certo(ex.pos.length === ex.n * 3, 'pos');
  certo(ex.esc.length === ex.n * 3, 'esc');
  certo(ex.rot.length === ex.n * 4, 'rot');
  certo(ex.cor.length === ex.n * 4, 'cor');
});

t('nenhuma coordenada NaN ou infinita', () => {
  for (let i = 0; i < ex.pos.length; i++)
    if (!Number.isFinite(ex.pos[i])) throw new Error('pos[' + i + '] = ' + ex.pos[i]);
});

t('nenhuma escala zero ou negativa', () => {
  for (let i = 0; i < ex.esc.length; i++)
    if (!(ex.esc[i] > 0)) throw new Error('esc[' + i + '] = ' + ex.esc[i]);
});

t('cores dentro de 0-255 e opacidade nunca zero', () => {
  for (let i = 0; i < ex.n; i++) {
    for (let j = 0; j < 4; j++) {
      const v = ex.cor[i * 4 + j];
      if (!(v >= 0 && v <= 255)) throw new Error('cor fora da faixa: ' + v);
    }
    if (ex.cor[i * 4 + 3] === 0) throw new Error('gaussiana invisivel em ' + i);
  }
});

t('quaternios sao unitarios (identidade)', () => {
  for (let i = 0; i < Math.min(ex.n, 2000); i++) {
    const n = Math.hypot(ex.rot[i * 4], ex.rot[i * 4 + 1], ex.rot[i * 4 + 2], ex.rot[i * 4 + 3]);
    perto(n, 1, 1e-3);
  }
});

t('a cena cabe num volume de comodo (nada disperso no infinito)', () => {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < ex.n; i++) for (let j = 0; j < 3; j++) {
    const v = ex.pos[i * 3 + j];
    if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v;
  }
  const dim = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  certo(dim[0] > 5 && dim[0] < 12, 'largura fora do esperado: ' + dim[0].toFixed(2));
  certo(dim[1] > 2 && dim[1] < 4, 'altura fora do esperado: ' + dim[1].toFixed(2));
  certo(dim[2] > 4 && dim[2] < 9, 'profundidade fora do esperado: ' + dim[2].toFixed(2));
});

t('a cena inteira converte para covariancia sem degenerar', () => {
  const o = new Float32Array(6);
  const passo = Math.max(1, Math.floor(ex.n / 4000));
  for (let i = 0; i < ex.n; i += passo) {
    covDe(ex.esc[i * 3], ex.esc[i * 3 + 1], ex.esc[i * 3 + 2],
      ex.rot[i * 4], ex.rot[i * 4 + 1], ex.rot[i * 4 + 2], ex.rot[i * 4 + 3], o, 0);
    for (let k = 0; k < 6; k++) if (!Number.isFinite(o[k])) throw new Error('cov NaN em ' + i);
    certo(o[0] > 0 && o[3] > 0 && o[5] > 0, 'covariancia degenerada em ' + i);
  }
});

t('a cena passa pela reducao do teto de celular', () => {
  const r = reduzir(ex, 200000);
  certo(r.n <= 200000, 'passou do teto');
  certo(r.n > 0, 'zerou');
});

/* =================================================== 6. integridade do arquivo */
console.log('\nintegridade do WS_REAL.html');

t('sentinela de boot presente', () => {
  certo(/__WS_OK/.test(HTML) && /diagT/.test(HTML), 'sentinela ausente');
});

t('sem identificadores duplicados no HTML', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const vistos = new Set(), dup = [];
  ids.forEach(i => { if (vistos.has(i)) dup.push(i); vistos.add(i); });
  certo(dup.length === 0, 'duplicados: ' + dup.join(', '));
});

t('nenhuma chave de API embutida', () => {
  certo(!/AIza[0-9A-Za-z_\-]{30,}/.test(HTML), 'chave Google embutida');
  certo(!/sk-[A-Za-z0-9]{20,}/.test(HTML), 'chave de API embutida');
});

t('os dois motores estao declarados', () => {
  certo(/const PANO=/.test(HTML), 'motor 360 ausente');
  certo(/const SPLAT=/.test(HTML), 'motor splat ausente');
});

t('mistura premultiplicada configurada corretamente', () => {
  certo(/blendSrc:THREE\.OneFactor/.test(HTML), 'blendSrc errado');
  certo(/blendDst:THREE\.OneMinusSrcAlphaFactor/.test(HTML), 'blendDst errado');
  certo(/depthWrite:false/.test(HTML), 'depthWrite deveria estar desligado');
});

t('ordenacao vai do mais longe para o mais perto', () => {
  certo(/for\(let b=65535;b>=0;b--\)/.test(HTML), 'prefixo do counting sort invertido');
});

t('o modulo inteiro tem sintaxe valida', () => {
  let js = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  js = js.replace(/^\s*import[^\n]*\n/gm, '');
  new Function(js); // so compila; nao executa
});

/* =================================================== 7. camada de paralaxe e pinos */
console.log('\nparalaxe, pinos de movel e carrinho');

t('os tres modos de exibicao existem', () => {
  for (const m of ['esfera', 'caixa', 'malha'])
    certo(HTML.includes("data-modo=\"" + m + "\""), 'modo ausente: ' + m);
  certo(/function construirSala/.test(HTML), 'caixa de ambiente ausente');
  certo(/function construirMalha/.test(HTML), 'malha por profundidade ausente');
});

t('o shader da caixa converte direcao em coordenada equirretangular', () => {
  certo(/atan\(d\.z,d\.x\)\/6\.283185307/.test(HTML), 'longitude errada');
  certo(/1\.0-acos\(clamp\(d\.y,-1\.0,1\.0\)\)\/3\.141592653/.test(HTML),
    'latitude sem a inversao — a panoramica sai de cabeca para baixo');
  certo(/colorspace_fragment/.test(HTML), 'faltou a conversao de espaco de cor');
});

/* --- reproduz a convencao de UV da SphereGeometry do Three e compara com o shader --- */
function uvDoShader(d) {
  const u = ((Math.atan2(d[2], d[0]) / (2 * Math.PI)) % 1 + 1) % 1;
  const v = 1 - Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI;
  return [u, v];
}
function vertice(uf, vt) {
  /* SphereGeometry: x=-cos(phi)sin(theta), y=cos(theta), z=sin(phi)sin(theta), uv=(u,1-v) */
  const phi = uf * 2 * Math.PI, theta = vt * Math.PI;
  const gx = -Math.cos(phi) * Math.sin(theta);
  const gy = Math.cos(theta);
  const gz = Math.sin(phi) * Math.sin(theta);
  return { dir: [-gx, gy, gz], uv: [uf, 1 - vt] };  /* a esfera do tour tem scale(-1,1,1) */
}

t('para cima aponta para o topo da foto (o bug de cabeca para baixo)', () => {
  const [, v] = uvDoShader([0, 1, 0]);
  perto(v, 1, 1e-6);                       // zenite = topo da equirretangular
  const [, vb] = uvDoShader([0, -1, 0]);
  perto(vb, 0, 1e-6);                      // nadir = base
  const [, vh] = uvDoShader([1, 0, 0]);
  perto(vh, 0.5, 1e-6);                    // horizonte = meio
});

t('o modo caminhar amostra a foto igual ao modo panoramica', () => {
  let pior = 0;
  for (let i = 1; i < 24; i++) for (let j = 0; j < 32; j++) {
    const { dir, uv } = vertice(j / 32, i / 24);
    const [u, v] = uvDoShader(dir);
    let du = Math.abs(u - uv[0]); du = Math.min(du, 1 - du);   // costura do 0/1
    pior = Math.max(pior, du, Math.abs(v - uv[1]));
  }
  certo(pior < 1e-6, 'divergencia maxima de ' + pior.toExponential(2) +
    ' entre a esfera e a caixa — a imagem muda ao trocar de modo');
});

t('o mapa de profundidade le a linha certa da imagem', () => {
  /* uv.y=1 e o topo da esfera; a linha 0 do canvas tambem e o topo */
  certo(/\(1-v\)\*\(d\.h-1\)/.test(HTML), 'a leitura do mapa esta invertida em Y');
});

/* =================================================== 8. UX de colocacao de pontos */
console.log('\nUX dos pontos na cena');

t('as acoes sao linhas descritivas, nao botoes mudos', () => {
  certo(/class="acao/.test(HTML), 'sem o componente de acao');
  certo(/Ponto de passagem/.test(HTML) && /Pino de móvel/.test(HTML), 'sem rotulos claros');
  certo(/Leva o visitante para outro ambiente/.test(HTML), 'sem explicacao da passagem');
  certo(/Abre um card com preço e botão de carrinho/.test(HTML), 'sem explicacao do pino');
});

t('faixa de instrucao aparece enquanto se posiciona', () => {
  certo(/id="colocar"/.test(HTML), 'sem faixa de instrucao');
  certo(/Clique na cena/.test(HTML), 'sem instrucao explicita');
  certo(/Cancelar · Esc/.test(HTML), 'sem saida visivel do modo');
  certo(/body\.colocando #cv\{cursor:crosshair\}/.test(HTML), 'cursor nao muda');
});

t('clicar num ponto nunca apaga — apaga so pela lixeira da lista', () => {
  const r = fatia('function pinosRender(){', 'function dirDe(');
  certo(!/splice/.test(r), 'o clique no ponto ainda remove');
  certo(/data-hdel/.test(HTML) && /data-pdel/.test(HTML), 'sem botao de remover na lista');
});

t('cada passagem e cada movel tem linha propria com destino, preco e remover', () => {
  certo(/data-hir/.test(HTML), 'sem atalho para ir ao destino');
  certo(/placeholder="nome do móvel"/.test(HTML), 'campo de nome sem rotulo');
  certo(/class="pr" data-pp/.test(HTML), 'campo de preco ausente');
});

t('a caminhada tem peso: velocidade, inercia e passo', () => {
  const b = fatia('const podeAndar =', 'aplicarCam();');
  certo(/ANDAR\.vel\.lerp/.test(b), 'movimento ainda e binario, sem aceleracao');
  certo(/andando\? 9\.0 : 13\.0/.test(b), 'aceleracao deveria ser assimetrica (para mais rapido do que sai)');
  certo(/ANDAR\.bob/.test(b) && /Math\.sin\(ANDAR\.fase/.test(b), 'sem balanco de passo');
  certo(/tecla\.KeyC/.test(b), 'sem agachar');
  certo(/fovAlvo/.test(b), 'sem abertura de lente ao correr');
});

t('velocidades sao humanas, nao arbitrarias', () => {
  const b = fatia('const alvoVel', '\n');
  /* caminhada normal ~1,4 m/s; corrida leve ~3 m/s; agachado bem devagar */
  const m = b.match(/correndo\?([\d.]+)\s*:\s*agachado\?([\d.]+)\s*:\s*([\d.]+)/);
  certo(m, 'nao achei as tres velocidades');
  const [, corr, agach, normal] = m.map(Number);
  certo(normal > 1.2 && normal < 1.8, 'caminhada de ' + normal + ' m/s foge do humano');
  certo(corr > 2.5 && corr < 4, 'corrida de ' + corr + ' m/s foge do humano');
  certo(agach < normal, 'agachado deveria ser mais lento');
});

t('quem tem enjoo de movimento pode desligar o balanco', () => {
  certo(/prefers-reduced-motion: reduce/.test(HTML), 'nao respeita a preferencia do sistema');
  certo(/ANDAR\.conforto/.test(HTML), 'sem modo conforto');
  certo(/'b'\|\|e\.key==='B'/.test(HTML), 'sem atalho para desligar');
});

t('o balanco para junto com a pessoa', () => {
  certo(/\} else \{ ANDAR\.vel\.set\(0,0,0\); ANDAR\.bob=0; ANDAR\.lat=0; \}/.test(HTML),
    'o balanco continua fora do modo caminhar');
});

t('o volume ajustado aparece como aresta visivel', () => {
  certo(/gradeMesh/.test(HTML), 'sem grade de referencia');
  certo(/EdgesGeometry/.test(HTML), 'sem arestas do volume');
  certo(/btGrade/.test(HTML), 'sem controle para mostrar ou ocultar');
  certo(/function limparGrade/.test(HTML), 'a grade vaza memoria ao reconstruir');
});

t('cada estacao mostra a propria miniatura', () => {
  certo(/toDataURL\('image\/jpeg'/.test(HTML), 'sem geracao de miniatura');
  certo(/<img class="mini"/.test(HTML), 'a lista nao usa a miniatura');
});

t('tela vazia ensina o caminho, em vez de so decorar', () => {
  certo(/Arraste as fotos equirretangulares/.test(HTML), 'sem passo a passo do tour');
  certo(/protocolo de captura/.test(HTML), 'sem passo a passo do splat');
});

t('Esc sai do modo de colocacao', () => {
  const k = fatia("if(e.key==='Escape')", "if(e.key==='v'");
  certo(/modoColocar\(null\)/.test(k), 'Esc nao cancela a colocacao');
});

t('a camera fica presa dentro do volume do ambiente', () => {
  certo(/function limiteSala/.test(HTML), 'sem limite de sala');
  certo(/clamp\(cam\.position\.x/.test(HTML), 'nao limita X');
  certo(/clamp\(cam\.position\.z/.test(HTML), 'nao limita Z');
});

t('mapa de profundidade: branco e perto', () => {
  certo(/branco = perto/.test(HTML), 'convencao nao documentada no codigo');
  certo(/dmin\+\(1-g8\)\*\(dmax-dmin\)/.test(HTML), 'inversao da profundidade errada');
});

t('pino de movel abre card com preco e carrinho', () => {
  certo(/function abrirCard/.test(HTML), 'sem card');
  certo(/cardAdd/.test(HTML), 'sem botao de carrinho');
  certo(/const CART=\[\]/.test(HTML), 'sem carrinho');
  certo(/currency:'BRL'/.test(HTML), 'preco sem formato brasileiro');
});

t('peca vinda do Atelier entra como pino pendente', () => {
  certo(/ws:atelier-pino/.test(HTML), 'sem ponte com o Atelier');
  certo(/movelPendente/.test(HTML), 'sem estado de peca pendente');
});

t('o percurso exportado leva pinos, precos e atencao', () => {
  const j = fatia('function exportarPercurso()', '\n}');
  for (const k of ['pinos', 'carrinho', 'total', 'atencao', 'passagens'])
    certo(j.includes(k), 'faltou "' + k + '" no JSON exportado');
  certo(!/tex|url|depth/.test(j), 'o JSON nao pode carregar imagem nem textura');
});

t('modo visitante esconde a edicao', () => {
  certo(/body\.visitante #lado/.test(HTML), 'sem regra de visitante');
  certo(/btVisita/.test(HTML), 'sem botao visitante');
});

t('telemetria de atencao por estacao', () => {
  certo(/PANO\.atencao\[ant\.nome\]/.test(HTML), 'nao mede tempo por ambiente');
});

t('atalhos de teclado documentados na propria tela', () => {
  certo(/id="ajuda"/.test(HTML), 'sem painel de ajuda');
  for (const k of ['ArrowRight', 'ArrowLeft', 'Escape'])
    certo(HTML.includes(k), 'atalho ausente: ' + k);
});

t('aviso de LGPD presente na interface', () => {
  certo(/Autorização escrita do proprietário|autorização escrita/i.test(HTML), 'sem aviso de autorizacao');
});

/* =================================================== resultado */
console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram');
  console.log('─'.repeat(58) + '\n');
}
