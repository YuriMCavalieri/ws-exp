# Lado servidor

## O princípio

**Nenhuma chave de API pode viver no navegador.** Vale para Mint, Meshy,
Anthropic e qualquer coisa que tenha custo por chamada. Uma chave em JavaScript
de cliente é uma chave publicada — não existe ofuscação que resolva.

As duas Edge Functions aqui são o lado seguro. Elas recebem o pedido do
navegador, acrescentam a chave do ambiente do servidor e repassam.

| Função | Serve | Segredo |
|---|---|---|
| `ws-mundo-edge-function.ts` | geração de mundo em splat a partir de fotos + descrição | `MINT_API_KEY`, `MINT_PROJECT_ID` |
| `ws-atelier-edge-function.ts` | geração de móvel 3D a partir de foto | `MESHY_API_KEY` |

```bash
supabase functions deploy ws-mundo
supabase secrets set MINT_API_KEY=... MINT_PROJECT_ID=...
```

## A exceção que precisa ser tratada

A chave do **Google Maps** é diferente: a Map Tiles API é consumida direto pelo
navegador e não passa por função de servidor. Ela vai ficar exposta — isso é
inerente ao produto, não um descuido.

O que a torna aceitável são três travas, e **as três são obrigatórias antes de
publicar**:

1. **Restrição por referenciador HTTP** — só `whitestone.living/*` e os
   domínios de staging.
2. **Restrição por API** — a chave só habilita Map Tiles, Maps JavaScript e
   Weather. Nada mais.
3. **Teto de cota diária** no Google Cloud, com alerta de orçamento. Sem isso,
   uma chave copiada vira uma fatura.

Hoje o código lê a chave de `ws-config.json` e, se não achar, cai para
`localStorage` e depois pergunta ao usuário. Os três caminhos são de
desenvolvimento. **Em produção, só o primeiro deve existir** — e o arquivo
precisa ser gerado no build, nunca versionado.

## CORS

As duas funções hoje respondem `Access-Control-Allow-Origin: *`. Está correto
para prototipagem e **errado para produção** — deve ser a origem exata das
camadas.
