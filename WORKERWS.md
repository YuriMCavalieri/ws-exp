# WORKERWS — o que este repositório é, e o que ele muda no produto

> Este documento existe porque a pergunta "esse repo aqui não faz nada?" é
> razoável e demorou a ter resposta. Ele responde três coisas: **o que a camada
> é**, **o que ela faz**, e **por que ela precisa viver separada**.
>
> Leia antes de mexer em qualquer coisa. O contrato completo está em
> [`03-contrato/CONTRATO-DE-MENSAGENS.md`](03-contrato/CONTRATO-DE-MENSAGENS.md).

---

## 1. O que é

Cinco arquivos HTML autocontidos. Cada um abre no navegador e funciona — sem
build, sem `npm install`, sem servidor de aplicação.

| Camada | Arquivo | Peso | O que faz |
|---|---|---|---|
| **Walkthrough** | `WS_MINT.html` | 84 KB | caminhar dentro do imóvel em Gaussian splat |
| Mundo 3D | `WS_MUNDO.html` | 126 KB | voo sobre a cidade em fotogrametria do Google |
| Studio 3D | `WS_STUDIO.html` | 731 KB | editor de plantas 2D → 3D, autoral |
| Tour 360 | `WS_REAL.html` | 75 KB | panorâmicas com paralaxe |
| Atelier | `WS_ATELIER.html` | 52 KB | catálogo de móveis |

Há ainda `sala-reconstruida/`, rota de contingência quando a captura reprova.

**Elas não são uma aplicação.** Não têm login, banco, cobrança, e não sabem o
que é uma sessão de usuário. São **periféricos**: recebem um objeto de dados e
devolvem eventos.

A analogia mais próxima é um player de vídeo incorporado. O YouTube embutido na
sua página não sabe quem é o usuário do seu site nem acessa o seu banco — ele
recebe um id de vídeo e emite "tocou", "pausou", "assistiu 40%". A camada é
isso, para 3D.

---

## 2. O que o walkthrough faz

São 1.676 linhas cobertas por 46 testes. Ele renderiza um ambiente em **Gaussian
splat** — uma nuvem de milhões de manchas de cor derivadas de fotografia, que é
o que dá o fotorrealismo — e junto carrega uma **malha invisível de colisão**.

- **caminhar** em primeira pessoa, com física, colisão, correr e agachar
- **medir** distâncias reais clicando em dois pontos
- **passagens** entre cômodos: clicar numa porta leva ao ambiente seguinte
- **pinos de móvel** com preço, que vão para um carrinho
- **medir atenção**: quantos segundos a pessoa passou em cada cômodo

> **O olho vê o splat; o sistema mede o colisor.**
> Um splat é nuvem: não tem sólido, não tem face, não tem geometria. Dá para
> caminhar sobre um piso estimado, mas não dá para medir. Por isso, **ambiente
> sem colisor faz a camada DESLIGAR a fita métrica** em vez de estimar. A regra
> do produto é recusar medir em vez de mostrar número em que ninguém confia.

---

## 3. Como ela conversa com a plataforma

Vinte e um tipos de mensagem, por `window.postMessage`. O fluxo de uma visita:

```
whitestone.living                        ws-camadas.pages.dev
(React + Supabase)                       (HTML + Three.js + Spark)
      │
      │  usuário clica no card
      ├─► monta <iframe>
      │                       ◄── ws:pronto              "estou de pé"
      ├─► ws:carregar-imovel ──►                         "este imóvel, estes cômodos"
      │                       ◄── ws:walkthrough-sessao  "88s na sala, 41 na cozinha"
      │                       ◄── ws:carrinho            "pôs o sofá no carrinho"
      │                       ◄── ws:walkthrough-modelo  "ligou sala → cozinha"
      ├─ grava no Postgres
      │
      │  usuário fecha
      ├─► ws:pedir-sessao ────►                          "feche a conta antes de eu sair"
      │                       ◄── ws:walkthrough-sessao  (o último trecho)
      └─ desmonta o iframe
```

**A plataforma nunca importa Three.js. O 3D nunca sabe o que é Supabase.**
Persistência, autenticação, permissão e cobrança vivem inteiramente do lado de
fora. Quando a camada quer navegar, ela **pede** (`ws:voltar-mundo`) — e a
aplicação decide se atende, porque só ela conhece a rota, a sessão e o plano.

---

## 4. O que ela muda no processo

### Na jornada
O card na home abre a experiência. O mesmo par card + experiência serve a página
do imóvel, a busca e o dashboard do corretor — é o mesmo componente; muda só o
que a plataforma manda no `ws:carregar-imovel`.

### Nos dados — é aqui que ela paga por si
O evento `ws:walkthrough-sessao` carrega **segundos de atenção por cômodo**.

"Passou 88 segundos na sala e 41 na cozinha" é sinal de intenção
qualitativamente diferente de "clicou no anúncio", e alimenta três coisas ao
mesmo tempo: **qualificação do lead**, **motor de recomendação** e **WSI**.

> Os segundos são de atenção **ativa**. O relógio para quando a aba fica oculta
> e quando ninguém interage por mais de 45 s. Sem as duas travas, uma aba
> esquecida aberta a noite inteira gravaria oito horas na sala e tornaria o
> número incomparável entre imóveis — que é justamente para o que ele serve.

### Na página do imóvel
Substituiu o `PlayCanvas3DTour`, que abria um apartamento genérico de licença
CC-BY com o nome do imóvel do cliente por cima. Agora, ou é o imóvel de verdade,
ou o botão não aparece. Uma consulta a mais, uma promessa a menos.

### No roadmap
No vocabulário do
[`tour-imersivo-estrategia.md`](../white-stone/docs/tour-imersivo-estrategia.md)
da plataforma, isto é o **Tier 3** — o item estimado em 3 a 4 meses. Ele existe
e está testado.

---

## 5. Por que precisa ser um app separado, com host próprio

Quatro razões que se somam. A primeira sozinha já decide.

### 5.1 · Segurança — a decisiva

O WebGL exige `sandbox="allow-same-origin"` no iframe. Se a camada fosse servida
de `whitestone.living`, qualquer script rodando dentro dela leria o
`localStorage` de `whitestone.living` — que é onde o Supabase guarda o **JWT de
sessão do usuário logado**.

E a camada carrega módulos de CDN de terceiros. A cadeia completa:

> módulo comprometido no CDN → executa dentro do iframe → lê o `localStorage` →
> exfiltra a sessão de **todo usuário logado que abrir o tour**

Com origem separada, a política de mesma origem do navegador barra isso na raiz.
É a diferença entre "um incidente de CDN degrada uma vista 3D" e "um incidente
de CDN entrega contas de usuário".

### 5.2 · Duas versões de Three.js convivendo

| Onde | Versão | Por quê |
|---|---|---|
| Walkthrough e sala reconstruída | `three@0.184` | o Spark exige ≥ 0.180 |
| Mundo, Studio, Tour, Atelier | `three@0.170` | é onde foram construídos |
| Plataforma React | `three@0.182` | o Mundo 3D portado |

Elas nunca se encontram na memória porque **cada iframe tem seu próprio contexto
de JavaScript**. Num bundle único isso seria um conflito — e é a razão pela qual
consolidar tudo quebraria o walkthrough.

### 5.3 · Falha isolada

Um erro de JavaScript dentro do 3D não derruba a plataforma. Com tudo no mesmo
contexto, derrubaria.

### 5.4 · Os testes continuam valendo

São **243** neste repositório. Boa parte deles descreve regras de produto que
não estão escritas em nenhum outro lugar: a física de caminhada, a ordem de
carregamento das páginas de LOD, o vigia de tela preta, o corte de ociosidade
do cronômetro de atenção.

Reescrever a camada dentro do React exigiria **portar todos eles antes**, não
depois. Eles são a especificação executável do comportamento que hoje funciona.

---

## 6. Onde cada coisa é construída

Nenhum dos dois repositórios escreve no outro. Cada um constrói dentro de si, e
a ligação em produção é por **HTTP**, não por sistema de arquivos.

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ ws-exp  (este repositório)     │   │ white-stone                    │
│                                │   │                                │
│  npm run publicar:camadas      │   │  npm run build                 │
│    → ws-exp/publicar-camadas/  │   │    → white-stone/dist/         │
│                                │   │                                │
│  Cloudflare Pages · projeto 2  │   │  Cloudflare Pages · projeto 1  │
│  ws-camadas.pages.dev ─────────┼───┼──► whitestone.living           │
│                        iframe  │   │                                │
└────────────────────────────────┘   └────────────────────────────────┘
```

Configuração no painel:

```
Projeto 1 — aplicação      repo: white-stone
  Build:  npm run build                  Output: dist

Projeto 2 — camadas        repo: ws-exp        ← este
  Build:  npm run publicar:camadas       Output: publicar-camadas
```

E na aplicação: `VITE_ORIGEM_CAMADAS = https://<projeto-2>.pages.dev`.

> **Não é preciso subdomínio próprio.** A propriedade de que se precisa é *outra
> origem*, não *um subdomínio da marca*. O `<projeto>.pages.dev` que o Pages dá
> de graça já é. Trocar depois por `camadas.whitestone.living` é adicionar o
> domínio no painel e mudar uma variável — nada no código muda.

### Os dois destinos deste repositório

```bash
npm run publicar          # publicar/          → a DEMONSTRAÇÃO
npm run publicar:camadas  # publicar-camadas/  → o PRODUTO EMBUTÍVEL
```

A diferença não é cosmética:

| | `publicar/` | `publicar-camadas/` |
|---|---|---|
| Contém | portal + camadas | só as camadas |
| Para | abrir num link e mostrar | ser embutido pela plataforma |
| Cabeçalho | `X-Frame-Options: SAMEORIGIN` | `CSP: frame-ancestors` |

`X-Frame-Options` no deploy embutível estaria **errado**: `SAMEORIGIN`
bloquearia justamente a aplicação, que é outro host. O cabeçalho antigo não sabe
dizer "só estas origens"; o `frame-ancestors` sabe.

### Desenvolvimento

Recomendado — duas origens, espelhando produção, para que erro de origem
apareça em dev e não depois:

```bash
# terminal 1 — as camadas
cd ws-exp && npm run servir 8081

# terminal 2 — a aplicação
cd white-stone && VITE_ORIGEM_CAMADAS=http://localhost:8081 npm run dev
```

Em `localhost`, a camada aceita comando de qualquer porta local. Essa folga está
presa ao `EM_DEV`, que lê o `location.hostname` da própria camada — em qualquer
host publicado ela não existe.

Alternativa (mesma origem): `npm run sync:camadas` no white-stone copia os HTMLs
para `public/camadas/`. É **contingência**: testa uma topologia que não é a de
produção e não exercita a validação de origem.

---

## 7. A regra de produto que atravessa tudo

**Todo ambiente 3D gerado precisa aparecer na tela declarado como representação
ilustrativa.**

Não é preciosismo jurídico: um walkthrough gerado não é o imóvel, e deixar o
comprador achar que é cria um problema real na primeira visita. As camadas já
trazem o selo; telas novas precisam trazê-lo também.

E o corolário, que é onde já erramos duas vezes: **nunca exibir um ambiente sob
o nome de um imóvel que ele não representa.** Quando o imóvel chega sem mídia, a
camada diz isso na tela em vez de abrir a demonstração. O selo existe para
impedir o mal-entendido, não para legitimá-lo.

---

## 8. O que NÃO fazer

- **Não** desligar `enableLod` no renderizador de splats. Num arquivo `.rad`
  paginado o LOD é o **mecanismo de entrega**, não um filtro de qualidade:
  desligá-lo esvazia a cena e deixa a tela preta enquanto o colisor continua
  desenhando. Há teste que proíbe.
- **Não** servir a camada da mesma origem da aplicação em produção. Seção 5.1.
- **Não** consolidar as camadas num bundle único. Seção 5.2.
- **Não** esconder a camada com `display:none` ao trocar de rota — o contexto
  WebGL continua vivo e o navegador descarta o mais antigo sem avisar. Desmonte
  de verdade.
- **Não** montar preview WebGL na home: é a página de LCP, e contexto WebGL é
  orçamento escasso.
- **Não** reescrever um trecho que parece mal resolvido antes de olhar os
  testes. Boa parte do que parece estranho aqui é resposta a um defeito real que
  eles hoje protegem.
