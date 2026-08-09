# O portal

`index.html` é o orquestrador dos protótipos: ele monta cinco iframes, mantém um
por vez visível e roteia as mensagens entre eles.

**Ele não é o produto.** É a referência de como embutir as camadas — e o lugar
onde dá para ver o contrato de mensagens funcionando de verdade, em 209 linhas
de JavaScript legível.

Na plataforma real, o papel dele é assumido pelo roteador do React. O
`03-contrato/WsCamada.tsx` é a tradução direta do que este arquivo faz.

## O que vale copiar dele

- o **padrão de fila**: comandos enviados antes de a camada carregar são
  guardados e despachados no `ws:*-pronto`
- a **tabela de roteamento** entre camadas — quem abre quem, e com qual payload
- o **fallback de erro**: nenhuma falha vira tela preta silenciosa

## O que não vale copiar

- `postMessage(..., '*')` — a origem tem que ser explícita
- ausência de checagem de `event.origin`
- `setTimeout` como sincronização
