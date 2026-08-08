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
| Testes automatizados | **161** |
| Tipos de mensagem no contrato | **19** |
| Dependências de build | **0** |

## Rodar

As camadas usam `fetch` para configuração e assets. Navegador nenhum faz `fetch`
de arquivo local — então é preciso um servidor:

```bash
cd 01-portal
python3 -m http.server 8080
```

Abra `http://localhost:8080/index.html`.

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
  aoReceberLead={lead => salvarLead(lead)}
/>
```

O componente embute a camada, valida a origem das mensagens, enfileira comandos
até o `ws:pronto` e expõe os eventos como callbacks.

## Testes

```bash
cd 05-testes
node ws_real_test.cjs      # 62
node ws_atelier_test.cjs   # 37
node ws_mint_test.cjs      # 21
node ws_sala_test.cjs      # 20
```

**140 testes verdes** nesta estrutura (Node 22.22). As outras duas suítes estão
descritas em `05-testes/COMO-RODAR.md`.

## Configuração

Copie `04-servidor/ws-config.exemplo.json` para `ws-config.json` na pasta da
camada e preencha as chaves. **O arquivo real está no `.gitignore` e nunca deve
ser versionado.**

As chaves de serviços com custo por chamada vivem em Edge Functions do lado do
servidor, nunca no navegador — ver `04-servidor/LEIA-ME.md`.

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
