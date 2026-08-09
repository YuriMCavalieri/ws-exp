# WS PLATAFORMA — pacote de integração

**Para:** Yuri — desenvolvimento White Stone
**De:** Leonardo · direção de produto
**Versão:** 1.0 · 8 de agosto de 2026

---

## Em trinta segundos

Este pacote contém **cinco camadas de experiência 3D** funcionando, prontas para
serem embutidas na plataforma White Stone. Elas foram construídas como
protótipos de alta fidelidade — não como rascunho.

Elas **não** são um app. São peças que precisam de uma casa.

- **12.855 linhas** de JavaScript, **1.263** de CSS
- **161 testes automatizados**, todos passando
- **19 tipos de mensagem** já implementados para conversar com uma aplicação hospedeira
- **Zero dependência de build** — abre no navegador e funciona

O documento `WS_PLATAFORMA_DIRETRIZES_YURI.pdf`, que acompanha este pacote,
explica a arquitetura, a auditoria completa e as rotas de integração com custo e
risco de cada uma. **Leia-o antes de escrever código.**

---

## Como rodar agora, em dois minutos

As camadas usam `fetch` para carregar configuração e assets. Navegador nenhum
faz `fetch` de arquivo local — é regra de segurança. Então:

```bash
npm install      # só na primeira vez (jsdom, para a suíte do Studio)
npm run servir   # http://localhost:8080
npm test         # as seis suítes
```

O portal carrega as jornadas por iframe. Se alguma tela ficar preta, **não é
bug silencioso**: as camadas têm vigia próprio e explicam o que aconteceu na
tela.

> **Não use `python3 -m http.server` a partir de `01-portal/`.** O portal
> referencia as camadas por nome ao lado dele (`WS_MINT.html`), e na
> árvore-fonte elas moram em `02-camadas/<camada>/`. Servir a pasta do portal
> dá 404 em todas as jornadas. O `npm run servir` faz a mesma tradução de
> caminhos que o `npm run publicar` — o que você vê em dev é o que vai ao ar.

---

## O que tem em cada pasta

| Pasta | Conteúdo | Você vai precisar? |
|---|---|---|
| `00-LEIA-PRIMEIRO/` | este arquivo | agora |
| `01-portal/` | o portal que orquestra as camadas — é a referência de como embutir | referência |
| `02-camadas/` | as cinco camadas 3D, uma por pasta | **sim — é o produto** |
| `03-contrato/` | **o contrato de mensagens, o bridge validado e o componente React** | **sim — comece por aqui** |
| `04-servidor/` | Edge Functions Supabase + exemplo de config | **sim — as chaves vivem aqui** |
| `05-testes/` | as seis suítes de teste | sim, para o CI |
| `06-assets/` | móveis GLB otimizados + manifesto dos mundos pesados | sim |
| `07-referencia/` | script de publicação, pipeline vídeo→splat, configs de deploy | quando for publicar |

---

## As cinco camadas

| Camada | Arquivo | O que faz | Peso |
|---|---|---|---|
| **Mundo 3D** | `mundo-3d/WS_MUNDO.html` | voo sobre a cidade em fotogrametria do Google, pinos de imóvel, rotas, modo rua | 123 KB |
| **Studio 3D** | `studio-3d/WS_STUDIO.html` | editor de plantas 2D → 3D, acabamentos, mobília, walkthrough autoral, WS IA | **723 KB** |
| **Atelier** | `atelier/WS_ATELIER.html` | catálogo de móveis com busca por intenção, criação por foto, ficha técnica | 51 KB |
| **Tour 360** | `tour-360/WS_REAL.html` | o imóvel real em panorâmicas com paralaxe e pinos de móvel | 73 KB |
| **Walkthrough** | `walkthrough/WS_MINT.html` | mundos em Gaussian splat com colisão, medição e passagens | 60 KB |

Há ainda `sala-reconstruida/` — uma sala real reconstruída como geometria a
partir de vídeo. É a rota de contingência quando a captura fotográfica reprova.

---

## Estado das pendências bloqueantes

O PDF de auditoria lista doze achados. O que mudou desde ele:

### Resolvido nesta revisão

**Origem das mensagens — no Walkthrough.** `WS_MINT.html` agora valida
`event.origin` contra uma lista constante no código, confere `event.source`, e
emite sempre para origem exata. **As demais camadas continuam pendentes** — ver
abaixo.

**O Walkthrough não falava o contrato.** Era a única camada sem
`addEventListener('message')` e sem `ws:pronto`: o `ws-bridge` esperava o
handshake para sempre e `ws:carregar-imovel` nunca era entregue. Implementado.

**A autoria do tour se perdia no F5.** Passagens entre cômodos e pinos de móvel
só existiam na memória do iframe. Agora saem em `ws:walkthrough-modelo` e há
tabela para recebê-los (`04-servidor/SCHEMA-COBRANCA.sql`).

**As fotos do imóvel vazavam.** O pedido de geração ia para o `parent` com
destino `'*'` carregando as imagens inteiras em base64. Agora só o metadado
sai; as fotos ficam no navegador.

**Edge Functions sem autenticação.** As duas tinham a chave no servidor — e
nada mais: sem identidade, sem limite, sem cobrança. Qualquer um que
descobrisse a URL gerava mundos na conta White Stone a US$ 1,20 cada. Agora
exigem JWT, debitam antes de chamar o fornecedor e estornam se ele falhar.

**Integridade dos scripts de CDN — no Walkthrough.** Import map com `integrity`
por módulo e versões exatas. Módulo ES não aceita o atributo `integrity=`; o
hash vai no mapa. Para auto-hospedar: `node 07-referencia/vendorizar.mjs`.

**Cinco contextos WebGL vivos ao mesmo tempo.** O portal trocava de jornada por
visibilidade CSS e nunca desmontava nada. Agora só uma camada fica montada.

### Ainda em aberto

**1 · Origem das mensagens nas outras quatro camadas.** Mundo, Studio, Tour e
Atelier ainda fazem `postMessage(carga, '*')` e não verificam `event.origin`.
O padrão a seguir está em `WS_MINT.html`, seção "CONTRATO DE MENSAGENS".

**2 · A chave do Google Maps vive no navegador.** Lida de `ws-config.json` com
fallback para `localStorage` e prompt. Precisa de restrição por referenciador
HTTP, restrição por API e teto de cota **antes** de publicar, e os dois
fallbacks de desenvolvimento precisam sair.

**3 · SRI nas outras camadas.** Só o Walkthrough tem hashes hoje.

**4 · Duas versões de Three.js convivem.** Mundo, Studio, Tour e Atelier usam
`three@0.170.0`; o Walkthrough usa `three@0.184.0` porque o Spark exige.
Funciona porque cada iframe tem seu próprio contexto — mas é uma armadilha para
quem for consolidar num bundle só.

---

## Os mundos pesados não estão neste pacote

Os três ambientes em Gaussian splat somam **35 MB** e ficariam maiores que todo
o resto do sistema junto. Estão listados em `06-assets/MANIFESTO-MUNDOS.md`,
com a URL de CDN de cada um. **Eles precisam viver em object storage, não no
repositório.**

---

## Contato

Dúvida sobre o contrato de mensagens ou sobre por que alguma decisão foi tomada
do jeito que foi: fale comigo antes de reescrever. Boa parte do que parece
estranho no código é resposta a um bug real que os testes hoje protegem.
