# Suítes de teste

```bash
npm install        # uma vez — jsdom, exigido pela suíte do Studio
npm test           # as seis suítes
npm run test:rapido # as cinco rápidas, sem o Studio — é o que vai no commit
```

**218 testes verdes**, todos executados de verdade.

| Suíte | Testes | O que cobre |
|---|---|---|
| `ws_mint_test` | **35** | Walkthrough: LOD, vigia de tela preta, contrato, autoria do tour, SRI |
| `ws_real_test` | **62** | Tour 360: parser de `.splat`, paralaxe, telemetria de atenção |
| `ws_atelier_test` | **37** | catálogo, busca por intenção, ficha e licença |
| `ws_sala_test` | **20** | sala reconstruída, colisão de móveis |
| `ws_contrato_test` | **19** | portal, `ws-bridge`, `WsCamada`, coerência contrato ↔ schema |
| `ws_deploy_test` | **21** | pacote de publicação |
| `ws_audit` (Studio) | **24** | regressões do editor — jsdom, lenta |

Suítes individuais: `npm run test:walkthrough`, `test:tour`, `test:atelier`,
`test:sala`, `test:contrato`, `test:deploy`, `test:studio`.

---

## Por que o número mudou de 161 para 218

O 161 que se citava antes não correspondia ao que rodava. Três coisas estavam
por trás disso, e todas foram corrigidas:

- **Os caminhos estavam quebrados.** As suítes resolviam `../02-camadas/…`, mas
  o repositório era plano — os arquivos estavam todos na raiz. Nenhuma das
  cinco suítes de camada abria; todas morriam em `ENOENT`. Na prática, **zero
  testes rodavam** neste repositório.
- **Os 21 do deploy nunca tinham como rodar.** Dependem da pasta `publicar/`, e
  `publicar.mjs` abortava procurando um `WS_PLATAFORMA.html` que não existe em
  lugar nenhum — o portal se chama `index.html` na fonte. Os dois nomes agora
  estão reconciliados num mapa só, dentro do `publicar.mjs`.
- **Os 24 do Studio nunca tinham rodado.** Exigiam `jsdom` sem que houvesse
  `package.json`, e o caminho do HTML vinha por argumento obrigatório — sem ele
  a suíte morria antes do primeiro teste.

Somando: 140 que passavam quando a estrutura estava certa, + 21 de deploy
destravados, + 24 do Studio destravados, + 33 novos (contrato e autoria do
walkthrough) = **218**.

O `rodar-tudo.mjs` soma só o que **executou**. O que foi pulado aparece
listado como não executado, nunca embutido no total. É a razão de ele existir.

---

## O que estes testes protegem — e por que não devem ser jogados fora

Eles não são testes de fachada. Cada um nasceu de um defeito real:

| Suíte | Defeito que ela impede de voltar |
|---|---|
| `ws_mint_test` | tela preta por `enableLod:false` — o LOD é o mecanismo de entrega das gaussianas, não um filtro de qualidade. Desligá-lo esvazia a cena |
| `ws_mint_test` | o walkthrough abrir a sala de demonstração sob o nome do imóvel que o visitante clicou |
| `ws_mint_test` | as fotos do imóvel saírem por `postMessage` com destino `'*'` |
| `ws_mint_test` | passagens entre cômodos se perderem no F5 |
| `ws_contrato_test` | cinco contextos WebGL vivos ao mesmo tempo, que o navegador descarta em silêncio |
| `ws_contrato_test` | contrato, schema e bridge divergirem sem ninguém perceber |
| `ws_sala_test` | móvel dentro de móvel. O teste lê as constantes **do próprio HTML**, então mover a lareira e esquecer o quadro quebra o teste |
| `ws_real_test` | parser de `.splat` com header errado, paralaxe invertida |
| `ws_deploy_test` | pacote publicado sem `_headers`, ou com `ws-config.json` preenchido dentro |

**Se uma camada for reescrita em React, estes testes precisam ser portados
antes**, não depois. Eles são a especificação executável do comportamento que
hoje funciona.

---

## Notas por suíte

**`ws_deploy_test.cjs`** verifica um pacote **já construído**. O `npm test`
roda `publicar.mjs` antes dele automaticamente. Rodado à mão sem a pasta
`publicar/`, ele avisa e sai. É o guarda de portão da publicação: entre outras
coisas, reprova o pacote se um `ws-config.json` com chave preenchida entrar
junto.

**`ws_audit.cjs`** monta um DOM falso e executa o JavaScript do Studio inteiro
fora do navegador. É poderosa e é **lenta** — um arquivo de 723 KB. Fica fora
do `--rapido`; no CI, vai em job noturno.

**`ws_mint_test.cjs`** tem uma asserção que conta um número exato: quantos
pontos do código chamam `modeloMudou()`. Se você acrescentar um caminho novo de
autoria no walkthrough, o teste vai reprovar de propósito — atualize o número e
a lista de pontos no comentário junto. Um ponto a menos é uma edição que o
corretor faz e perde ao recarregar.
