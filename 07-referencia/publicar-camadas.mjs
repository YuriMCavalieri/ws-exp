/* ---------------------------------------------------------------------------
   publicar-camadas.mjs — monta `publicar-camadas/`, o deploy EMBUTÍVEL.

   uso:  npm run publicar:camadas

   ── A DIFERENÇA PARA O publicar.mjs ─────────────────────────────────────────
   Os dois montam pastas publicáveis, e a distinção não é cosmética:

   `publicar.mjs`          → a DEMONSTRAÇÃO. Portal + camadas, para abrir num
                             link e mostrar a sócio e a investidor. É uma página
                             de topo: `X-Frame-Options: SAMEORIGIN` está certo.

   `publicar-camadas.mjs`  → o PRODUTO EMBUTÍVEL. Só as camadas, para viver numa
                             origem própria e ser embutido pela plataforma. Aqui
                             `X-Frame-Options` está ERRADO — SAMEORIGIN
                             bloquearia justamente a aplicação, que é outro host.
                             Quem autoriza é `frame-ancestors`.

   ── POR QUE ESTE SCRIPT VIVE AQUI, E NÃO NO REPOSITÓRIO DA PLATAFORMA ───────
   Porque o Cloudflare Pages clona UM repositório. Um script na plataforma que
   lesse as camadas daqui funciona na máquina de quem tem os dois lado a lado e
   falha no build, onde só existe um checkout. As camadas são deste repositório;
   quem as publica é este repositório.

   ── CLOUDFLARE PAGES ────────────────────────────────────────────────────────
     Projeto:           ws-camadas  (separado do projeto da aplicação)
     Repositório:       este
     Build command:     npm run publicar:camadas
     Output directory:  publicar-camadas

   Depois, na aplicação:  VITE_ORIGEM_CAMADAS = https://ws-camadas.pages.dev
--------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const SAIDA = path.join(RAIZ, 'publicar-camadas');

/**
 * Origens das APLICAÇÕES autorizadas a embutir as camadas.
 *
 * Vira `frame-ancestors`: é a metade do contrato que o servidor garante. A
 * outra metade é a lista `ORIGENS_APP` dentro do `WS_MINT.html`, que decide de
 * quem a camada aceita comandos. As duas precisam concordar — este script
 * confere isso no final e reprova se divergirem.
 *
 * Nada de curinga. Liberar `*.pages.dev` deixaria qualquer pessoa com conta
 * Cloudflare embutir e comandar a camada.
 */
const ORIGENS_APP = [
  'https://whitestone.living',
  'https://www.whitestone.living',
  'https://mafuz.com.br',
  'https://www.mafuz.com.br',
  /* Onde a aplicação está publicada hoje, enquanto os domínios de marca não
     respondem em HTTPS. É outro projeto Pages — e como `pages.dev` está na
     Public Suffix List, os dois não compartilham nem "site" para efeito de
     cookies: o isolamento que a separação de origem existe para dar continua
     valendo. Pode sair quando os domínios entrarem no ar. */
  'https://white-stone.pages.dev',
];

/* nome publicado → caminho na árvore-fonte. O pacote publicado é plano. */
const CAMADAS = {
  'WS_MINT.html':    '02-camadas/walkthrough/WS_MINT.html',
  'WS_REAL.html':    '02-camadas/tour-360/WS_REAL.html',
  'WS_ATELIER.html': '02-camadas/atelier/WS_ATELIER.html',
  'WS_STUDIO.html':  '02-camadas/studio-3d/WS_STUDIO.html',
  'WS_MUNDO.html':   '02-camadas/mundo-3d/WS_MUNDO.html',
};

const log = (s) => console.log('  ' + s);

console.log('\nWS PLATAFORMA — montando o deploy embutível das camadas\n');
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });

/* ------------------------------------------------------------------ camadas */
let bytes = 0;
for (const [nome, rel] of Object.entries(CAMADAS)) {
  const origem = path.join(RAIZ, rel);
  if (!fs.existsSync(origem)) throw new Error('faltando na árvore-fonte: ' + rel);
  const conteudo = fs.readFileSync(origem);
  fs.writeFileSync(path.join(SAIDA, nome), conteudo);
  bytes += conteudo.length;
  log('✔ ' + nome.padEnd(18) + (conteudo.length / 1024).toFixed(0) + ' KB   ← ' + rel);
}

/* ------------------------------------------------------------------- assets */
/* Os GLB de mobília que o Studio e o Atelier carregam por caminho relativo. Os
   mundos em Gaussian splat NÃO vêm aqui — object storage com CDN, ver
   06-assets/MANIFESTO-MUNDOS.md. */
{
  const orig = path.join(RAIZ, '06-assets');
  const dest = path.join(SAIDA, 'assets');
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(orig)) {
    if (!/\.(glb|gltf|ktx2|bin)$/i.test(f)) continue;
    fs.copyFileSync(path.join(orig, f), path.join(dest, f));
    n++;
  }
  log('✔ assets/            ' + n + ' modelo' + (n > 1 ? 's' : '') + ' 3D');
}

/* ------------------------------------------------------------------ headers */
fs.writeFileSync(path.join(SAIDA, '_headers'), `# Camadas 3D da White Stone — deploy embutível.
#
# Este host serve APENAS as camadas. Ele existe separado da aplicação para que
# um script rodando dentro do iframe não alcance o localStorage onde vive o JWT
# de sessão do Supabase — o WebGL exige sandbox="allow-same-origin", e com a
# mesma origem isso entrega a sessão de todo usuário logado que abrir o tour.

/*
  # Quem pode embutir. NÃO acrescente X-Frame-Options aqui: ele não sabe dizer
  # "só estas origens", e SAMEORIGIN bloquearia a aplicação, que é outro host.
  Content-Security-Policy: frame-ancestors ${ORIGENS_APP.join(' ')};
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), payment=(), geolocation=()
  # Por definição, estes arquivos são consumidos por outra origem.
  Cross-Origin-Resource-Policy: cross-origin

# HTML sempre revalida. Servir camada velha é servir contrato de mensagens
# velho: a aplicação nova conversa com a camada antiga e o handshake falha sem
# nenhuma explicação na tela.
/*.html
  Cache-Control: public, max-age=0, must-revalidate

# Modelos 3D não mudam de conteúdo.
/assets/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
`);
log('✔ _headers            frame-ancestors + cache');

/* ------------------------------------------------------------------- robots */
/* Camada indexada vira um iframe órfão no resultado de busca, sem a moldura da
   aplicação que explica o que aquilo é. */
fs.writeFileSync(path.join(SAIDA, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
log('✔ robots.txt          não indexar');

/* =========================================================== verificações == */
console.log('\nverificando…');
let alertas = 0;

/* 1 · As duas metades do contrato de origem precisam concordar. */
{
  const html = fs.readFileSync(path.join(SAIDA, 'WS_MINT.html'), 'utf8');
  const bloco = (html.match(/const ORIGENS_APP=\[([\s\S]*?)\];/) || [, ''])[1];
  const naCamada = [...bloco.matchAll(/'(https:\/\/[^']+)'/g)].map((m) => m[1]);

  const faltando = ORIGENS_APP.filter((o) => !naCamada.includes(o));
  if (faltando.length) {
    console.log('  ✘ o frame-ancestors libera origens que a camada RECUSA: ' + faltando.join(' · '));
    console.log('    O iframe carregaria e ignoraria todo comando — a camada ficaria');
    console.log('    "carregando" para sempre. Alinhe ORIGENS_APP no WS_MINT.html.');
    alertas++;
  } else {
    log('✔ origens do cabeçalho conferem com as da camada');
  }

  /* O outro sentido. A camada aceitar uma origem que o `frame-ancestors` não
     libera não trava nada — o navegador barra o iframe ANTES, e a lista da
     camada nunca chega a ser consultada. Por isso não reprova: staging ou uma
     origem antiga podem estar ali de propósito.

     Mas é o sentido que passa despercebido. Acrescentar a origem só na camada
     produz um deploy que parece completo, publica sem uma linha de aviso, e
     falha com um erro de CSP que aponta para o arquivo errado — foi
     exatamente o que aconteceu em 2026-08-09 com `white-stone.pages.dev`. */
  const inalcancaveis = naCamada.filter((o) => !ORIGENS_APP.includes(o));
  if (inalcancaveis.length) {
    console.log('  ⚠ a camada aceita origens que o frame-ancestors NÃO libera: ' + inalcancaveis.join(' · '));
    console.log('    Ali o iframe nem carrega — o navegador barra antes de qualquer mensagem.');
    console.log('    Se alguma dessas precisa funcionar, acrescente-a a ORIGENS_APP neste script.');
  }
}

/* 2 · Nenhuma chave pode ir para um arquivo servido cru. */
{
  const PADROES = [
    [/AIza[0-9A-Za-z_-]{30,}/, 'chave Google'],
    [/sk-[A-Za-z0-9]{20,}/, 'chave de API'],
    [/mint_live_[A-Za-z0-9_-]{10,}/, 'chave Mint'],
    [/msy_[A-Za-z0-9]{20,}/, 'chave Meshy'],
  ];
  let sujo = false;
  for (const nome of fs.readdirSync(SAIDA)) {
    if (!/\.(html|js|json)$/i.test(nome)) continue;
    const texto = fs.readFileSync(path.join(SAIDA, nome), 'utf8');
    for (const [re, rotulo] of PADROES) {
      if (re.test(texto)) { console.log('  ✘ ' + rotulo.toUpperCase() + ' EMBUTIDA em ' + nome); sujo = true; alertas++; }
    }
  }
  if (!sujo) log('✔ nenhum segredo nos arquivos publicados');
}

/* 3 · O portal não pode vazar para cá: ele é a demonstração, não o produto. */
if (fs.existsSync(path.join(SAIDA, 'WS_PLATAFORMA.html')) ||
    fs.existsSync(path.join(SAIDA, 'index.html'))) {
  console.log('  ✘ o portal entrou no deploy embutível — ele pertence ao publicar.mjs');
  alertas++;
} else {
  log('✔ só camadas, sem o portal');
}

/* 4 · ws-config.json nunca. */
if (fs.existsSync(path.join(SAIDA, 'ws-config.json'))) {
  console.log('  ✘ ws-config.json no pacote — remova antes de publicar');
  alertas++;
}

console.log(`\n  ${(bytes / 1024).toFixed(0)} KB em publicar-camadas/`);
if (alertas) {
  console.log(`\n  ${alertas} problema(s) — NÃO PUBLIQUE.\n`);
  process.exit(1);
}

console.log(`
  Cloudflare Pages — projeto SEPARADO do da aplicação:
    Build command:     npm run publicar:camadas
    Output directory:  publicar-camadas

  Na aplicação:
    VITE_ORIGEM_CAMADAS = https://<projeto>.pages.dev

  Embutir só funciona a partir de:
${ORIGENS_APP.map((o) => '    ' + o).join('\n')}
`);
