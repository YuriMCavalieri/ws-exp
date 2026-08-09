O que é
Cinco arquivos HTML autocontidos. Cada um abre no navegador e funciona — sem build, sem npm install, sem servidor de aplicação. O walkthrough (WS_MINT.html) tem 83 KB e carrega Three.js e o Spark de CDN.

Eles não são uma aplicação. Não têm login, banco, cobrança, e não sabem o que é uma sessão de usuário. São periféricos: recebem um objeto de dados e devolvem eventos.

A analogia mais próxima é um player de vídeo incorporado. O YouTube embutido numa página não sabe quem é o usuário do seu site, não acessa seu banco — ele recebe um id de vídeo e emite "tocou", "pausou", "assistiu 40%". A camada é isso, para 3D.

O que o walkthrough faz
Renderiza um ambiente em Gaussian splat — uma nuvem de milhões de manchas de cor capturadas de fotografia, que é o que dá o fotorrealismo. Junto vem uma malha invisível de colisão, e é ela que dá a geometria:

caminhar em primeira pessoa, com física, colisão e agachar
medir distâncias reais clicando em dois pontos
passagens entre cômodos — clicar numa porta leva ao próximo ambiente
pinos de móvel com preço, que vão para um carrinho
medir atenção: quantos segundos em cada cômodo
O olho vê o splat; o sistema mede o colisor. Sem colisor a camada desliga a fita métrica em vez de estimar — medida estimada não vale para imóvel.

O que ela impacta no processo
Na jornada. Hoje o card na home leva a uma demonstração. Amanhã, o mesmo par card + experiência serve a página do imóvel, a busca e o dashboard — é o mesmo componente, muda só o que a plataforma manda no ws:carregar-imovel.

Nos dados. É aqui que ela paga por si. A conversa é assim:


whitestone.living                      ws-camadas.pages.dev
(React + Supabase)                     (HTML + Three.js + Spark)
      │
      │  usuário clica no card
      ├─► monta <iframe>
      │                     ◄── ws:pronto              "estou de pé"
      ├─► ws:carregar-imovel ──►                       "este imóvel, estes cômodos"
      │                     ◄── ws:walkthrough-sessao  "88s na sala, 41 na cozinha"
      │                     ◄── ws:carrinho            "pôs o sofá no carrinho"
      │                     ◄── ws:walkthrough-modelo  "ligou sala → cozinha"
      ├─ grava no Postgres
A plataforma nunca importa Three.js. O 3D nunca sabe o que é Supabase. Toda persistência, autenticação e cobrança vivem do lado de fora.

Aquele atencao é o que não existe em nenhum portal do mercado. "Passou 88 segundos na sala e 41 na cozinha" é sinal de intenção qualitativamente diferente de "clicou no anúncio", e alimenta três coisas de uma vez: qualificação do lead, motor de recomendação, e o WSI.

Na página do imóvel. Ela substituiu o PlayCanvas3DTour, que mostrava um apartamento genérico de licença CC-BY com o nome do imóvel do cliente em cima. Agora, ou é o imóvel de verdade, ou o botão não aparece.

No roadmap. No vocabulário do tour-imersivo-estrategia.md de vocês, isto é o Tier 3 — o item estimado em 3 a 4 meses. Ele existe e está testado.

Por que ela precisa ser um app separado, com host próprio
Essa é a parte que provavelmente ficou obscura, e são quatro razões que se somam:

1. Segurança — a decisiva. O WebGL exige sandbox="allow-same-origin" no iframe. Se a camada fosse servida de whitestone.living, qualquer script rodando dentro dela leria o localStorage de whitestone.living — que é onde o Supabase guarda o JWT de sessão. E a camada carrega módulos de CDN de terceiros. Um módulo comprometido no unpkg levaria a sessão de todo usuário logado que abrisse o tour. Com origem separada, o navegador barra isso na raiz.

2. Duas versões de Three.js. O walkthrough usa three@0.184 porque o Spark exige; as outras camadas usam 0.170; a plataforma usa 0.182. Elas nunca se encontram na memória porque cada iframe tem seu próprio contexto de JavaScript. Num bundle único isso seria um conflito.

3. Falha isolada. Um erro de JavaScript dentro do 3D não derruba a plataforma. Com tudo no mesmo contexto, derrubaria.

4. Os testes continuam valendo. São 243, e boa parte descreve regras de produto que não estão escritas em lugar nenhum — a física de caminhada, a ordem de carregamento das páginas de LOD, o vigia de tela preta. Reescrever a camada dentro do React exigiria portar todos eles antes.

O que ela não faz
Não autentica, não persiste, não cobra, não decide rota. Quando ela quer navegar, ela pede — ws:voltar-mundo — e a plataforma decide se atende, porque só ela conhece a sessão e as permissões.

É isso que permite trocar o motor 3D daqui a dois anos sem a plataforma ficar sabendo, e trocar a plataforma sem tocar no 3D.

Faz sentido? Se ficou alguma parte específica nebulosa — o contrato de mensagens, o splat, ou o arranjo dos dois projetos no Pages — me diz qual e eu abro só ela.