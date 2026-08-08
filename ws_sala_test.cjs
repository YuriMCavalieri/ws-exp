/* ---------------------------------------------------------------------------
   ws_sala_test.cjs — verifica a RECONSTRUÇÃO da sala (WS_SALA_RECONSTRUIDA.html).

   Não abre navegador. O que este arquivo testa é a coisa que mais denuncia uma
   cena montada no olho: móvel atravessando móvel, móvel dentro da parede, e
   ponto de partida do modo caminhar preso dentro de um sofá.

   As constantes são LIDAS DO HTML, não copiadas. Se alguém mover a lareira e
   esquecer de mover o quadro, o teste quebra — que é o objetivo.
   uso:  node pipeline/ws_sala_test.cjs
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const ARQ = path.join(path.resolve(__dirname,'..'),'02-camadas','sala-reconstruida','WS_SALA_RECONSTRUIDA.html');
const H = fs.readFileSync(ARQ, 'utf8');
const MOD = (H.match(/<script type="module">([\s\S]*?)<\/script>/) || [, ''])[1];
const JS = MOD.replace(/^\s*import[^;]+;/gm, '');

let ok = 0, falhas = [];
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✔ ' + nome); }
  catch (e) { falhas.push(nome + ' — ' + e.message); console.log('  ✘ ' + nome + '\n      ' + e.message); }
};
const certo = (c, m) => { if (!c) throw new Error(m || 'condicao falsa'); };

/* lê uma constante numérica declarada no módulo */
function num(nome) {
  const m = JS.match(new RegExp('const\\s+' + nome + '\\s*=\\s*(-?[\\d.]+)'));
  if (m) return parseFloat(m[1]);
  const m2 = JS.match(new RegExp('\\b' + nome + '\\s*=\\s*(-?[\\d.]+)'));
  if (m2) return parseFloat(m2[1]);
  throw new Error('constante ' + nome + ' nao encontrada no HTML');
}

console.log('\nWS SALA RECONSTRUIDA — verificacao de layout\n');

const L = num('L'), P = num('P'), Hh = num('H');
const X_LAREIRA = num('X_LAREIRA'), X_CONSOLE = num('X_CONSOLE');
const X_CRISTAL = num('X_CRISTAL'), X_APARADOR = num('X_APARADOR');
const X_SOFA = num('X_SOFA'), Z_SOFA = num('Z_SOFA');
const X_CENTRO = num('X_CENTRO'), Z_CENTRO = num('Z_CENTRO');
const JX = num('JX'), JZ = num('JZ');

console.log(`  sala ${L} x ${P} m, pe-direito ${Hh} m (${(L*P).toFixed(1)} m2)\n`);

/* ---------- pegadas no piso: [nome, cx, cz, largura, profundidade] ---------- */
const MOVEIS = [
  ['lareira',      X_LAREIRA,  -P/2+0.18,  2.12, 0.50],
  ['console',      X_CONSOLE,  -P/2+0.22,  1.50, 0.40],
  ['cristaleira',  X_CRISTAL,  -P/2+0.26,  1.35, 0.46],
  ['aparador',     X_APARADOR, -P/2+0.28,  4.08, 0.56],
  ['sofa longo',   X_SOFA,      Z_SOFA+0.25, 3.90, 1.50],
  ['sofa retorno', X_SOFA+1.42, Z_SOFA-1.15, 1.50, 3.10],
  ['mesas centro', X_CENTRO+0.05, Z_CENTRO,  2.50, 2.10],
  ['mesa jantar',  JX,          JZ,         3.90, 2.50],
  ['guarda-corpo', -L/2+0.40,   P/2-1.25,   0.30, 1.70],
];
const cx = m => [m[1]-m[3]/2, m[1]+m[3]/2];
const cz = m => [m[2]-m[4]/2, m[2]+m[4]/2];
const sobrepoe = (a,b) => {
  const [ax0,ax1]=cx(a), [bx0,bx1]=cx(b), [az0,az1]=cz(a), [bz0,bz1]=cz(b);
  const ix = Math.min(ax1,bx1) - Math.max(ax0,bx0);
  const iz = Math.min(az1,bz1) - Math.max(az0,bz0);
  return (ix > 0.02 && iz > 0.02) ? {ix,iz} : null;
};

console.log('geometria');

/* As duas caixas do sofa em L descrevem UMA peca so: elas compartilham a
   quina por construcao e devem mesmo se sobrepor. Qualquer outro par que se
   sobreponha e defeito. */
const MESMA_PECA = [['sofa longo','sofa retorno']];
const mesmaPeca = (a,b) => MESMA_PECA.some(p => p.includes(a) && p.includes(b));

t('nenhum movel atravessa outro movel', () => {
  const ruins = [];
  for (let i=0;i<MOVEIS.length;i++) for (let j=i+1;j<MOVEIS.length;j++) {
    if (mesmaPeca(MOVEIS[i][0], MOVEIS[j][0])) continue;
    const s = sobrepoe(MOVEIS[i], MOVEIS[j]);
    if (s) ruins.push(`${MOVEIS[i][0]} x ${MOVEIS[j][0]} (${s.ix.toFixed(2)}x${s.iz.toFixed(2)} m)`);
  }
  certo(ruins.length === 0, ruins.join(' · '));
});

t('o sofa em L e mesmo um L, nao duas pecas soltas', () => {
  const a = MOVEIS.find(m=>m[0]==='sofa longo'), b = MOVEIS.find(m=>m[0]==='sofa retorno');
  const s = sobrepoe(a,b);
  certo(s, 'as duas metades do sofa se separaram — a quina do L abriu');
  certo(s.ix > 0.3 && s.iz > 0.3, 'a quina do L ficou fina demais para ler como uma peca');
});

t('nenhum movel invade a parede', () => {
  const ruins = [];
  for (const m of MOVEIS) {
    const [x0,x1]=cx(m), [z0,z1]=cz(m);
    // 12 cm de tolerancia: encostado na parede e correto, enfiado nela nao
    if (x0 < -L/2-0.12 || x1 > L/2+0.12) ruins.push(m[0]+' sai em X');
    if (z0 < -P/2-0.12 || z1 > P/2+0.12) ruins.push(m[0]+' sai em Z');
  }
  certo(ruins.length === 0, ruins.join(' · '));
});

t('os quatro moveis do fundo cabem na parede em ordem', () => {
  const fundo = MOVEIS.filter(m => ['lareira','console','cristaleira','aparador'].includes(m[0]));
  fundo.sort((a,b)=>a[1]-b[1]);
  certo(fundo.map(m=>m[0]).join(',') === 'lareira,console,cristaleira,aparador',
    'a ordem na parede do fundo mudou: ' + fundo.map(m=>m[0]).join(','));
  for (let i=0;i<fundo.length-1;i++) {
    const folga = cx(fundo[i+1])[0] - cx(fundo[i])[1];
    certo(folga > 0.15, `folga de apenas ${folga.toFixed(2)} m entre ${fundo[i][0]} e ${fundo[i+1][0]}`);
  }
});

t('a sala nao esta entulhada nem vazia demais', () => {
  const area = MOVEIS.reduce((s,m)=>s+m[3]*m[4], 0);
  const taxa = area / (L*P);
  certo(taxa > 0.18 && taxa < 0.55,
    `ocupacao de ${(taxa*100).toFixed(0)}% do piso — fora da faixa plausivel de 18 a 55%`);
  console.log(`        (ocupacao ${(taxa*100).toFixed(0)}% do piso)`);
});

/* ---------- ponto de partida do modo caminhar ---------- */
console.log('\nmodo caminhar');

const partida = (() => {
  const m = JS.match(/cam\.position\.set\(([-\d.]+),\s*([\d.]+),\s*([-\d.]+)\)/);
  certo(m, 'nao achei a posicao inicial do modo caminhar');
  return {x:parseFloat(m[1]), y:parseFloat(m[2]), z:parseFloat(m[3])};
})();

t('a pessoa nao nasce dentro de um movel', () => {
  const dentro = MOVEIS.filter(m => {
    const [x0,x1]=cx(m), [z0,z1]=cz(m);
    return partida.x > x0-0.28 && partida.x < x1+0.28 &&
           partida.z > z0-0.28 && partida.z < z1+0.28;
  });
  certo(dentro.length === 0,
    'partida em (' + partida.x + ',' + partida.z + ') colide com: ' + dentro.map(m=>m[0]).join(', '));
});

t('a pessoa nasce dentro da sala e na altura dos olhos', () => {
  certo(partida.x > -L/2+0.42 && partida.x < L/2-0.42, 'partida fora da sala em X');
  certo(partida.z > -P/2+0.42 && partida.z < P/2-0.42, 'partida fora da sala em Z');
  certo(partida.y > 1.5 && partida.y < 1.8, `olho a ${partida.y} m — fora do humano`);
});

t('velocidades sao humanas, nao de videogame', () => {
  certo(/1\.45/.test(JS), 'caminhada deveria ser 1,45 m/s');
  certo(/3\.1/.test(JS),  'corrida deveria ser 3,1 m/s');
  certo(/0\.7/.test(JS),  'agachado deveria ser 0,7 m/s');
  certo(/exp\(-9\.0\*dt\)/.test(JS) && /exp\(-13\.0\*dt\)/.test(JS),
    'aceleracao e frenagem tem que ser assimetricas — corpo freia mais rapido do que arranca');
});

t('bater na parede desliza, nao gruda', () => {
  certo(/if\(livre\(sx\)\)[\s\S]{0,120}else if\(livre\(sz\)\)/.test(JS),
    'sem decomposicao do passo em X e Z, o usuario gruda em cada quina');
});

t('o balanco de passo respeita quem pede menos movimento', () => {
  certo(/prefers-reduced-motion/.test(JS), 'sem leitura de prefers-reduced-motion');
  certo(/EST\.conforto\)\{ AND\.bob=0/.test(JS), 'modo conforto nao zera o balanco');
});

/* ---------- iluminacao e materiais ---------- */
console.log('\nluz e materiais');

t('as embutidas ficam no forro, nao dentro dele', () => {
  const alt = JS.match(/s\.position\.set\(x,\s*H-H_REB-([\d.]+),\s*z\)/);
  certo(alt, 'nao achei a altura das embutidas');
  certo(parseFloat(alt[1]) > 0 && parseFloat(alt[1]) < 0.1, 'embutida fora do plano do forro');
});

t('as embutidas caem dentro da sala', () => {
  const bloco = (JS.match(/for\(const \[x,z\] of \[([\s\S]*?)\]\) embutida/) || [,''])[1];
  const pares = [...bloco.matchAll(/\[([^\],]+),\s*([^\]]+)\]/g)];
  certo(pares.length >= 8, 'menos de 8 embutidas — a sala ficaria escura');
  const val = e => {
    e = e.trim();
    return e.replace(/X_SOFA/g, X_SOFA).replace(/JX/g, JX);
  };
  for (const p of pares) {
    const x = eval(val(p[1])), z = eval(val(p[2]));
    certo(Math.abs(x) < L/2-0.3 && Math.abs(z) < P/2-0.3,
      `embutida em (${x.toFixed(2)}, ${z.toFixed(2)}) fora da sala`);
  }
});

t('nenhuma textura vem de arquivo externo', () => {
  const refs = [...H.matchAll(/(?:src|url\()\s*['"]?(https?:\/\/[^'")\s]+)/g)].map(m => m[1]);
  const naoPermitidas = refs.filter(u => !/unpkg\.com\/three@/.test(u));
  certo(naoPermitidas.length === 0,
    'a cena depende de arquivo externo: ' + naoPermitidas.join(' · '));
});

t('as texturas de cor estao em sRGB', () => {
  const n = (JS.match(/colorSpace\s*=\s*THREE\.SRGBColorSpace/g) || []).length;
  certo(n >= 4, `so ${n} texturas marcadas como sRGB — as demais sairiam lavadas`);
});

/* ---------- honestidade ---------- */
console.log('\nhonestidade');

t('a pagina se declara representacao ilustrativa', () => {
  certo(/representa[çc][ãa]o ilustrativa 3D/i.test(H), 'sem o selo');
  certo(/pode conter erros/i.test(H), 'o selo tem que admitir erro');
});

t('as medidas sao apresentadas como estimadas, nunca como medidas', () => {
  certo(/estimadas do v[ií]deo, n[ãa]o medidas/i.test(H),
    'exibir medida sem dizer que e estimativa e o erro que destroi confianca');
});

t('a pagina explica que nao e fotogrametria', () => {
  certo(/n[ãa]o [ée] uma captura fotogram[ée]trica/i.test(H),
    'o usuario precisa saber que a textura e aproximada, nao fotografica');
});

t('nenhuma chave de API embutida', () => {
  certo(!/AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9]{20,}|msy_[A-Za-z0-9]{20,}|mint_live_/.test(H));
});

t('existe vigia de tela preta', () => {
  certo(/readPixels/.test(JS), 'sem leitura do quadro renderizado');
  certo(/recarregue a p[áa]gina/i.test(JS), 'o vigia tem que dizer o que fazer');
});

t('o modulo tem sintaxe valida', () => { new Function(JS); });

console.log('\n' + '─'.repeat(58));
if (falhas.length) {
  console.log('  ' + ok + ' passaram, ' + falhas.length + ' FALHARAM\n');
  falhas.forEach(f => console.log('  ✘ ' + f));
  process.exit(1);
} else {
  console.log('  ' + ok + '/' + ok + ' testes passaram');
  console.log('─'.repeat(58) + '\n');
}
