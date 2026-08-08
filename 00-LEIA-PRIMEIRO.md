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
cd 01-portal
python3 -m http.server 8080
```

Abra `http://localhost:8080/index.html`.

O portal carrega as cinco jornadas por iframe. Se alguma tela ficar preta,
**não é bug silencioso**: as camadas têm vigia próprio e explicam o que
aconteceu na tela.

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

## As três coisas que precisam ser resolvidas antes de ir ao ar

Estão detalhadas no PDF, mas resumidas aqui porque são bloqueantes:

**1 · Nenhuma camada valida a origem das mensagens.** Todas fazem
`postMessage(carga, '*')` e nenhuma verifica `event.origin`. Hoje isso é
inofensivo porque tudo roda na mesma origem. No momento em que a plataforma
embutir a camada, vira uma porta aberta. **O `03-contrato/ws-bridge.js` já
resolve o lado da aplicação;** falta o lado das camadas.

**2 · A chave do Google Maps vive no navegador.** Ela é lida de
`ws-config.json` com fallback para `localStorage`. Chave em navegador é chave
pública. Precisa ser restrita por referenciador HTTP e com teto de cota diária
antes de qualquer publicação — ou movida para um proxy.

**3 · Duas versões de Three.js convivem.** As camadas Mundo, Studio, Tour e
Atelier usam `three@0.170.0`; o Walkthrough usa `three@0.184.0` porque o Spark
exige. Funciona porque cada iframe tem seu próprio contexto — mas é uma
armadilha para quem for consolidar.

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
