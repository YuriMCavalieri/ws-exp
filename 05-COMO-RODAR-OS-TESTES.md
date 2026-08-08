# Suítes de teste

```bash
cd 05-testes
node ws_real_test.cjs        # 62 testes — Tour 360, splat parser, paralaxe
node ws_atelier_test.cjs     # 37 testes — catálogo, busca por intenção, ficha
node ws_mint_test.cjs        # 21 testes — Walkthrough, LOD, vigia de tela preta
node ws_sala_test.cjs        # 20 testes — sala reconstruída, colisão de móveis
node ws_deploy_test.cjs      # 21 testes — pacote de publicação
```

**161 testes, todos verdes** na última execução (8 de agosto de 2026, Node 22.22).

A sexta suíte é diferente:

```bash
npm i jsdom
node ws_audit.cjs ../02-camadas/studio-3d/WS_STUDIO.html   # 24 testes
```

Ela monta um DOM falso e executa o JavaScript do Studio inteiro fora do
navegador. É poderosa e é **lenta** — leva minutos num arquivo de 723 KB. Não
coloque no caminho crítico do CI; rode em job noturno ou sob demanda.

## O que estes testes protegem — e por que não devem ser jogados fora

Eles não são testes de fachada. Cada um nasceu de um defeito real:

| Suíte | Defeito que ela impede de voltar |
|---|---|
| `ws_mint_test` | tela preta por `enableLod:false` — o LOD é o mecanismo de entrega das gaussianas, não um filtro de qualidade. Desligá-lo esvazia a cena |
| `ws_sala_test` | móvel dentro de móvel. O teste lê as constantes **do próprio HTML**, então mover a lareira e esquecer o quadro quebra o teste |
| `ws_real_test` | parser de `.splat` com header errado, paralaxe invertida |
| `ws_deploy_test` | pacote publicado sem `_headers`, ou com `ws-config.json` preenchido dentro |

**Se uma camada for reescrita em React, estes testes precisam ser portados
antes**, não depois. Eles são a especificação executável do comportamento que
hoje funciona.

---

## Nota sobre `ws_deploy_test.cjs`

Ele verifica um pacote **já construído** e por isso só roda depois de
`node 07-referencia/publicar.mjs`. Sem a pasta `publicar/`, ele avisa e sai —
não falha. É o guarda de portão da publicação: entre outras coisas, ele reprova
o pacote se um `ws-config.json` com chave preenchida tiver entrado junto.

## Estado na entrega deste pacote

| Suíte | Resultado |
|---|---|
| `ws_real_test` | **62 / 62** |
| `ws_atelier_test` | **37 / 37** |
| `ws_mint_test` | **21 / 21** |
| `ws_sala_test` | **20 / 20** |
| `ws_deploy_test` | 21 testes — aguardando build |
| `ws_audit` (Studio) | 24 testes — exige `jsdom`, execução lenta |

**140 testes verdes executados nesta estrutura de pastas.** Os caminhos internos
foram atualizados para a nova organização e reconferidos.
