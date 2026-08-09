# Contrato de mensagens — WS Plataforma v1

Este é o documento mais importante do pacote. Ele descreve **como as camadas 3D
conversam com a aplicação**, e é o que permite integrá-las sem tocar em uma
linha de Three.js.

O contrato **já existe no código** — as sete camadas trocam 19 tipos de mensagem
por `window.postMessage`. O que este arquivo faz é *documentá-lo*, *validá-lo* e
*versioná-lo*. Nada aqui exige reescrever as camadas.

---

## 1 · O modelo mental

```
┌─────────────────────────────────────────────────┐
│  APLICAÇÃO WHITE STONE  (React + Supabase)      │
│                                                 │
│   ┌───────────────────────────────────────┐     │
│   │  <iframe>  camada 3D                  │     │
│   │                                       │     │
│   │   Three.js · Spark · 3d-tiles         │     │
│   └───────────────────────────────────────┘     │
│         ▲                        │              │
│         │  comandos              │  eventos     │
│         └────────  ws-bridge ────┘              │
└─────────────────────────────────────────────────┘
```

**A camada 3D não sabe o que é Supabase.** Ela recebe um objeto de dados e
devolve eventos. Toda persistência, autenticação e cobrança vivem do lado de
fora. Essa separação é o que permite trocar o motor 3D no futuro sem tocar no
produto — e trocar o produto sem tocar no 3D.

---

## 2 · Regras invioláveis

| # | Regra | Por quê |
|---|---|---|
| 1 | Toda mensagem tem `tipo` começando por `ws:` | namespace — evita colisão com mensagens de terceiros |
| 2 | Toda mensagem carrega `v` (versão do contrato) | permite evoluir sem quebrar quem está no ar |
| 3 | **O receptor valida `event.origin`** | sem isso, qualquer site que embuta a camada injeta comandos |
| 4 | A camada 3D **nunca** faz `fetch` autenticado | chave em navegador é chave vazada |
| 5 | Payload é JSON serializável puro | `postMessage` usa clonagem estruturada; função não atravessa |
| 6 | Comando desconhecido é **ignorado em silêncio**, não quebra | permite front novo com camada velha |

> **A regra 3 é uma correção, não uma sugestão.** Hoje as sete camadas fazem
> `postMessage(carga, '*')` e **nenhuma** verifica `event.origin`. Está
> detalhado no documento de auditoria como o achado de severidade mais alta.

---

## 3 · Eventos — da camada 3D para a aplicação

A camada avisa que algo aconteceu. A aplicação decide o que fazer.

### `ws:pronto`
Emitido assim que a camada terminou de carregar e está apta a receber comandos.
**A aplicação deve enfileirar comandos até receber este evento.**

```json
{ "tipo": "ws:pronto", "v": 1, "camada": "mundo|studio|atelier|tour|walkthrough" }
```
> Hoje o código emite `ws:mundo-pronto` e `ws:studio-pronto`. O bridge normaliza
> os dois para `ws:pronto` com o campo `camada`.

### `ws:lead` — **o evento que gera receita**
Emitido quando um visitante deixa contato dentro da experiência 3D.

```json
{
  "tipo": "ws:lead", "v": 1,
  "lead": {
    "nome": "string", "telefone": "string", "email": "string|null",
    "intencao": "string",
    "projeto": "string", "wsi": 62,
    "area": 86, "comodos": 5,
    "tempo_no_tour_s": 214,
    "atencao": { "sala": 88, "cozinha": 41 },
    "carrinho": [ { "item": "Sofá retrátil", "preco": 4890 } ],
    "valor_carrinho": 4890,
    "quando": "2026-08-08T14:02:11.000Z"
  }
}
```

**Este é o evento mais valioso do sistema** e merece tratamento especial. Ele não
traz só um contato: traz **quanto tempo a pessoa passou em cada cômodo**
(`atencao`) e **o que ela colocou no carrinho**. Isso é sinal de intenção que
nenhum portal tem — e é matéria-prima direta para o WS Score do corretor
(responsividade) e para a qualificação do lead.

**Do lado da aplicação:** persistir em `leads`, disparar a qualificação, rotear
para o corretor, e **iniciar o cronômetro de SLA** que alimenta o pilar de
responsividade do WS Score.

⚠️ **LGPD:** este payload contém dado pessoal. Ele nunca deve trafegar em URL,
nunca deve ir para logs de cliente e exige consentimento registrado antes do
envio.

### `ws:space-model` — o projeto autoral
Emitido quando o usuário salva ou exporta um projeto no WS Studio.

```json
{ "tipo": "ws:space-model", "v": 1,
  "imovelId": "ws-one", "abrirImovel": "ws-one",
  "space": { "…": "modelo completo: paredes, vãos, andares, mobília, acabamentos" } }
```
O objeto `space` é o **formato canônico do imóvel autoral**. Ele é grande
(dezenas a centenas de KB) e deve ir para `jsonb` no Postgres ou para object
storage com ponteiro — nunca para `localStorage` em produção.

### `ws:entrar-imovel` · `ws:entrar-walkthrough`
Emitidos quando o usuário escolhe entrar num imóvel a partir do mundo 3D.

```json
{ "tipo": "ws:entrar-walkthrough", "v": 1,
  "imovel": { "id":"", "nome":"", "endereco":"", "area":0,
              "quartos":0, "suites":0, "vagas":0, "andar":0,
              "preco":0, "status":"" },
  "space": null }
```
**`ws:entrar-imovel` abre o Studio; `ws:entrar-walkthrough` abre o Walkthrough.**
A regra de produto vigente é que "entrar no imóvel" pelo mundo 3D leva ao
Walkthrough, não ao Studio.

### `ws:carrinho`
Emitido a cada mudança de carrinho dentro do Tour 360 ou do Walkthrough.

```json
{ "tipo": "ws:carrinho", "v": 1,
  "itens": [ { "sku":"", "nome":"", "preco":0 } ] }
```
É a base do motor de marketplace de mobília. Deve ser **debounced** do lado da
aplicação — a camada emite a cada clique.

### `ws:walkthrough-modelo` — a autoria do tour
Emitido quando o usuário muda a **autoria do walkthrough**: cria uma passagem
entre cômodos, posiciona um pino de móvel, renomeia, precifica, apaga, ou
acerta a calibração de um ambiente. A camada agrupa a rajada e emite 1,5 s
depois da última mudança.

```json
{ "tipo": "ws:walkthrough-modelo", "v": 1,
  "camada": "walkthrough",
  "imovelId": "WS-V-0142",
  "modelo": {
    "v": 1,
    "ambientes": [ { "id": "sala", "nome": "Sala", "cal": {}, "crop": 0 } ],
    "passagens": [ { "de": "sala", "para": "cozinha", "x": 1.2, "y": 0.9, "z": -3.4 } ],
    "pinos": [ { "ambiente": "sala", "x": 0.4, "y": 0.35, "z": -1.1,
                 "movel": { "sku": "…", "nome": "Sofá retrátil", "preco": 4890 } } ]
  } }
```

**O formato é achatado de propósito**: cada passagem carrega o ambiente de
origem em `de`, em vez de ficar aninhada dentro dele. É assim que vira linha de
tabela sem desmontar o JSON — e é assim que o grafo de cômodos fica consultável.

**Do lado da aplicação:** gravar em `walkthrough_modelos` (`jsonb` versionado —
ver `04-servidor/SCHEMA-COBRANCA.sql`), e devolver o modelo no
`ws:carregar-imovel` seguinte, no campo `walkthrough`.

> **Por que este tipo existe.** Passagens e pinos viviam só na memória do
> iframe. O corretor ligava sala → cozinha → suíte, nomeava e precificava os
> móveis, e perdia tudo ao recarregar a página — não havia caminho nenhum até o
> banco, nem tipo de mensagem que o representasse. Sem isto, "a experiência
> completa" é uma sessão de demonstração, não um produto.

### `ws:pedido-mundo` — geração sem servidor ligado
Emitido pelo Walkthrough quando o usuário pede um ambiente novo e não há
`window.WS_MUNDO_ENDPOINT` configurado.

```json
{ "tipo": "ws:pedido-mundo", "v": 1, "camada": "walkthrough",
  "pedido": { "nome": "…", "prompt": "…", "quantidadeImagens": 3,
              "custoEstimadoCreditos": 1500,
              "imagens": [ { "arquivo": "sala-01.jpg", "bytes": 2481234 } ] } }
```

⚠️ **Este evento nunca carrega as fotos.** Só nome de arquivo e tamanho. As
imagens em base64 ficam no navegador e sobem pela Edge Function, que é o lado
autenticado. O schema recusa explicitamente um campo `dado` dentro de `imagens`.

### `ws:atelier-movel` · `ws:atelier-pino`
Emitidos quando o usuário envia um móvel do Atelier para o Studio (`-movel`) ou
para o Tour 360 (`-pino`).

```json
{ "tipo": "ws:atelier-movel", "v": 1,
  "item": { "sku":"", "nome":"", "categoria":"", "preco":0,
            "dimensoes": { "largura":0, "altura":0, "profundidade":0 },
            "loja": "", "licenca": "", "glb": "url|null" } }
```

### Navegação
`ws:voltar-mundo` · `ws:ir-para-mundo` · `ws:ir-para-studio` · `ws:abrir-atelier`
· `ws:camada-real` — todos sem payload além de `tipo` e `v`. São pedidos de
navegação: **a aplicação decide se atende**, porque só ela conhece a rota, a
sessão e as permissões.

---

## 4 · Comandos — da aplicação para a camada 3D

### `ws:carregar-imovel`
Injeta um imóvel do banco dentro da camada.

```json
{ "tipo": "ws:carregar-imovel", "v": 1,
  "imovel": { "id":"WS-V-0142", "nome":"", "endereco":"",
              "lat":-19.97, "lon":-43.95,
              "area":0, "quartos":0, "suites":0, "vagas":0,
              "preco":0, "wsi":74, "status":"publicado" },
  "space": null,
  "midia": { "splat":"https://cdn…/x.rad", "colisor":"https://cdn…/x.glb",
             "panoramas":[], "fotos":[] },
  "walkthrough": null }
```

**Vários cômodos ligados por passagens.** Para o Walkthrough, `midia.ambientes`
substitui o atalho `splat`/`colisor` e é o que permite um tour com mais de um
espaço:

```json
"midia": { "ambientes": [
    { "id":"sala",    "nome":"Sala",    "splat":"https://cdn…/sala-lod.rad",
      "colisor":"https://cdn…/sala.glb", "bytes":42269712, "gerado":false },
    { "id":"cozinha", "nome":"Cozinha", "splat":"https://cdn…/cozinha-lod.rad",
      "colisor":"https://cdn…/cozinha.glb" }
] },
"walkthrough": { "v":1, "passagens":[ { "de":"sala","para":"cozinha","x":1.2,"y":0.9,"z":-3.4 } ] }
```

`walkthrough` é o modelo autoral gravado antes — devolvê-lo aqui é o que
restaura passagens, pinos e calibração.

> **Sem `midia`, a camada recusa.** O Walkthrough não abre o acervo de
> demonstração quando o imóvel chega sem mídia: ele diz na tela que não há
> ambiente capturado. Mostrar outro espaço sob o nome do imóvel é precisamente
> o mal-entendido que o selo de *representação ilustrativa* existe para impedir.

### `ws:pedir-space`
Pede à camada que devolva o modelo autoral atual. A camada responde com
`ws:space-model`. É o padrão pedido/resposta do contrato.

### `ws:pedir-walkthrough`
O mesmo padrão, para o tour: a camada responde com `ws:walkthrough-modelo`.
Útil antes de trocar de rota, para gravar a autoria sem esperar o debounce.

### `ws:ir-para`
Move a câmera para uma coordenada ou para um ambiente nomeado.

```json
{ "tipo": "ws:ir-para", "v": 1,
  "alvo": { "lat":-19.97, "lon":-43.95, "altitude":320 } }
```

### `ws:atelier-abrir`
Abre o Atelier já filtrado por uma categoria ou consulta.

---

## 5 · Tabela de referência rápida

| Mensagem | Direção | Payload | Persiste? |
|---|---|---|---|
| `ws:pronto` | camada → app | `camada` | não |
| `ws:lead` | camada → app | objeto lead | **sim — tabela `leads`** |
| `ws:space-model` | camada → app | `space`, `imovelId` | **sim — `jsonb`/storage** |
| `ws:entrar-imovel` | camada → app | `imovel`, `space` | não — é navegação |
| `ws:entrar-walkthrough` | camada → app | `imovel` | não — é navegação |
| `ws:carrinho` | camada → app | `itens[]` | sim, com debounce |
| `ws:walkthrough-modelo` | camada → app | `modelo`, `imovelId` | **sim — `walkthrough_modelos`** |
| `ws:pedido-mundo` | camada → app | `pedido` (sem as fotos) | não — é aviso |
| `ws:atelier-movel` | camada → app | `item` | sim |
| `ws:atelier-pino` | camada → app | `item` | sim |
| `ws:voltar-mundo` | camada → app | — | não |
| `ws:ir-para-mundo` | camada → app | — | não |
| `ws:ir-para-studio` | camada → app | — | não |
| `ws:abrir-atelier` | camada → app | — | não |
| `ws:camada-real` | camada → app | — | não |
| `ws:carregar-imovel` | app → camada | `imovel`, `space`, `midia` | — |
| `ws:pedir-space` | app → camada | — | — |
| `ws:ir-para` | app → camada | `alvo` | — |
| `ws:atelier-abrir` | app → camada | `filtro` | — |
| `ws:pedir-walkthrough` | app → camada | `imovelId` | — |

---

## 6 · O que fazer com cada evento — do lado da aplicação

| Evento | Ação mínima | Ação completa |
|---|---|---|
| `ws:lead` | gravar em `leads` | qualificar → rotear → agendar → **iniciar SLA do WS Score** |
| `ws:space-model` | gravar `jsonb` | versionar, calcular WSI do projeto, gerar thumbnail |
| `ws:walkthrough-modelo` | gravar `jsonb` | versionar; devolver no `ws:carregar-imovel` seguinte |
| `ws:carrinho` | ignorar | agregar em `carrinho_eventos` → sinal de intenção para o matching |
| `ws:entrar-*` | trocar de rota | registrar em `property_access_events` (já existe no schema) |
| `ws:atelier-*` | ignorar | alimentar catálogo de fornecedores e comissão de marketplace |

---

## 7 · Versionamento

`v: 1` é este contrato. Regras de evolução:

- **Adicionar campo opcional** → não muda `v`.
- **Adicionar mensagem nova** → não muda `v`.
- **Remover ou renomear campo, ou mudar semântica** → `v: 2`, e o bridge passa a
  traduzir `v1 ↔ v2` por um ciclo de release.
- A camada **sempre** declara sua versão em `ws:pronto`. Se a aplicação receber
  uma versão que não conhece, ela registra e degrada — não quebra.

---

## 8 · Arquivos deste diretório

| Arquivo | O que é |
|---|---|
| `CONTRATO-DE-MENSAGENS.md` | este documento |
| `ws-mensagens.schema.json` | JSON Schema de todas as mensagens — use para validar em runtime e em teste |
| `ws-bridge.js` | implementação de referência do barramento, com validação de origem, fila de comandos, normalização de versão e timeout |
| `WsCamada.tsx` | componente React pronto que embute uma camada e expõe os eventos como callbacks |
