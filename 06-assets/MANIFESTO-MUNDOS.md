# Manifesto dos mundos em Gaussian splat

Estes arquivos **não estão no pacote** por peso. Somam 35 MB — mais que todo o
código do sistema junto.

| Mundo | Arquivo | Peso | Colisor | Medição |
|---|---|---|---|---|
| Penthouse mármore | `ws_penthouse_marmore.splat` | 11 MB | não | bloqueada |
| Penthouse brasileiro | `ws_penthouse_brasileiro.splat` | 11 MB | não | bloqueada |
| Sala mediterrânea | `ws_sala_mediterranea.splat` | 13 MB | não | bloqueada |
| *(quarto mundo, via Mint)* | runtime `.rad` paginado | CDN | **sim** | **liberada** |

## Por que a medição fica bloqueada nos três primeiros

Um splat é uma nuvem de gaussianas — não tem sólido, não tem face, não tem
geometria. Dá para caminhar sobre um piso estimado, mas **não dá para medir**.
A regra do produto é recusar medir em vez de mostrar número em que ninguém pode
confiar. O quarto mundo vem do pipeline do Mint, que entrega colisor junto — e
por isso libera a fita métrica.

## Onde eles devem viver

Object storage com CDN na frente — Supabase Storage, S3 + CloudFront, ou
Cloudflare R2. **Nunca no repositório Git.** Um `.splat` de 13 MB versionado
transforma cada clone em um download de 40 MB.

Cabeçalhos recomendados:

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/octet-stream
Access-Control-Allow-Origin: <origem das camadas>
```

O nome do arquivo deve carregar o hash do conteúdo (`ws_sala_a7f3c1.splat`) para
que `immutable` seja verdade.

## O formato paginado

O Walkthrough consome preferencialmente o formato `.rad` paginado do Mint, não
o `.splat` monolítico. A diferença importa: o `.rad` é carregado por níveis de
detalhe conforme a câmera se move, o que permite orçamento de 4,2 milhões de
gaussianas em desktop sem esperar o download inteiro.

**Consequência de arquitetura:** o LOD não é um filtro de qualidade, é o
**mecanismo de entrega**. Desligá-lo não deixa a cena mais bonita — deixa a cena
vazia. Já houve um incidente de tela preta por causa disso; o teste
`ws_mint_test.cjs` hoje proíbe `enableLod:false` justamente para impedir a
reincidência.
