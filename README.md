# WS Plataforma

Camadas de experiência 3D da **White Stone** — plataforma imobiliária
AI-first sediada em Belo Horizonte.

> **Aviso.** Software proprietário. Todos os direitos reservados.
> A visibilidade deste repositório não concede licença de uso. Ver [LICENSE](LICENSE).

---

## O que é

Cinco camadas de experiência 3D que rodam no navegador, construídas para serem
embutidas numa aplicação hospedeira. Elas não são um app: não têm autenticação,
banco nem cobrança. São peças encaixáveis.

| Camada | O que faz | Motor |
|---|---|---|
| **Mundo 3D** | voo sobre a cidade em fotogrametria real, pinos de imóvel, rotas, modo rua | three 0.170 + 3d-tiles-renderer |
| **Studio 3D** | editor de plantas 2D → 3D, acabamentos, mobília, walkthrough autoral | three 0.170 |
| **Atelier** | catálogo de móveis com busca por intenção e criação por foto | three 0.170 |
| **Tour 360** | o imóvel real em panorâmicas com paralaxe e pinos | three 0.170 |
| **Walkthrough** | ambientes em Gaussian splat com colisão e medição | three 0.184 + Spark |

Há ainda `sala-reconstruida/` — contingência: uma sala real remontada como
geometria a partir de vídeo de baixa qualidade.

## Números

| | |
|---|---|
| Linhas de JavaScript | **12.855** |
| Linhas de CSS | 1.263 |
| Testes automatizados | **241** |
| Tipos de mensagem no contrato | **21** |
| Dependências de build | **0** |

## Rodar

As camadas usam `fetch` para configuração e assets. Navegador nenhum faz `fetch`
de arquivo local — então é preciso um servidor:

```bash
npm install      # uma vez
npm run servir   # http://localhost:8080
```

> Não sirva `01-portal/` direto: o portal referencia as camadas por nome ao lado
> dele, e na árvore-fonte elas moram em `02-camadas/<camada>/`. O `npm run servir`
> faz a mesma tradução de caminhos que o `npm run publicar`.

## Estrutura

```
00-LEIA-PRIMEIRO/   como começar
01-portal/          orquestrador de referência
02-camadas/         as seis camadas, uma pasta cada
03-contrato/        ← o contrato de mensagens, o bridge e o componente React
04-servidor/        Edge Functions + exemplo de configuração
05-testes/          as seis suítes
06-assets/          móveis GLB + manifesto dos mundos pesados
07-referencia/      publicação, pipeline vídeo→splat, deploy
```

**Comece por `03-contrato/`.** É o que permite integrar as camadas sem tocar em
uma linha de Three.js.

## Integração em três linhas

```tsx
import { WsCamada } from './contrato/WsCamada';

<WsCamada
  camada="walkthrough"
  imovel={imovel}
  midia={{ ambientes: imovel.ambientes }}      // os cômodos navegáveis
  walkthrough={modeloSalvo}                    // passagens e pinos gravados antes
  aoSalvarWalkthrough={(m, id) => salvarModelo(id, m)}
  aoReceberLead={lead => salvarLead(lead)}
/>
```

O componente embute a camada, valida a origem das mensagens, enfileira comandos
até o `ws:pronto` e expõe os eventos como callbacks.

**Uma camada montada por vez.** Cada iframe carrega um contexto WebGL, e o
navegador descarta o mais antigo sem avisar quando passam de alguns — a camada
volta em tela preta. Desmonte de verdade ao trocar de rota; não esconda com
`display:none`.

## Testes

```bash
npm test            # todas as suítes — 241 testes
npm run test:rapido # as rápidas, sem o Studio
```

**241 testes verdes** (Node 22+). Detalhe por suíte, e por que o número saiu de
161 para 218, em `05-testes/05-COMO-RODAR-OS-TESTES.md`.

## Publicar

Este repositório tem **dois** destinos, e a diferença entre eles não é cosmética:

```bash
npm run publicar          # publicar/          → a DEMONSTRAÇÃO
npm run publicar:camadas  # publicar-camadas/  → o PRODUTO EMBUTÍVEL
```

**`publicar/`** é o portal + as camadas, para abrir num link e mostrar. É uma
página de topo, e `X-Frame-Options: SAMEORIGIN` está certo ali.

**`publicar-camadas/`** é só as camadas, para viver numa origem própria e ser
embutido pela plataforma White Stone. Ali `X-Frame-Options` está **errado** —
SAMEORIGIN bloquearia justamente a aplicação, que é outro host. Quem autoriza é
`Content-Security-Policy: frame-ancestors`.

### Cloudflare Pages — o projeto das camadas

```
Repositório:       este
Build command:     npm run publicar:camadas
Output directory:  publicar-camadas
```

O `<projeto>.pages.dev` que sai daí já é uma origem diferente da aplicação — que
é a propriedade de que se precisa. Um subdomínio da marca é mais bonito, não
mais seguro. Na aplicação, aponte `VITE_ORIGEM_CAMADAS` para esse host.

> A lista de quem pode embutir vive em dois lugares que **precisam concordar**:
> `ORIGENS_APP` em `07-referencia/publicar-camadas.mjs` (vira `frame-ancestors`)
> e `ORIGENS_APP` dentro do `WS_MINT.html` (de quem a camada aceita comando).
> Se divergirem, o iframe carrega e ignora tudo — a camada fica "carregando"
> para sempre. `npm run test:camadas` reprova quando isso acontece.

## Configuração

Copie `04-servidor/ws-config.exemplo.json` para `ws-config.json` na pasta da
camada e preencha as chaves. **O arquivo real está no `.gitignore` e nunca deve
ser versionado.**

As chaves de serviços com custo por chamada vivem em Edge Functions do lado do
servidor, nunca no navegador — ver `04-servidor/04-SOBRE-O-SERVIDOR.md`.

As Edge Functions exigem usuário autenticado, debitam créditos antes de chamar
o fornecedor e estornam se ele falhar. As tabelas e funções SQL que isso supõe
estão em `04-servidor/SCHEMA-COBRANCA.sql`.

## Assets

Os três mundos em Gaussian splat somam 35 MB e **não estão neste repositório**.
Estão listados em `06-assets/MANIFESTO-MUNDOS.md`. Eles vivem em object storage
com CDN — nunca no Git.

## Uma regra de produto

Todo ambiente 3D gerado precisa aparecer na tela declarado como **representação
ilustrativa**. Um walkthrough gerado não é o imóvel, e prometer que é cria um
problema real na primeira visita.

---

White Stone Tecnologia Ltda. · 2026
