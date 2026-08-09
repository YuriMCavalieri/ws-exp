# WS PLATAFORMA — sistema unificado

Um só endereço, duas jornadas, um modelo de dados.

```
WS_PLATAFORMA.html      ← abra este (portal com escolha de jornada)
├── WS_MUNDO.html       ← mundo 3D fotorrealista (Vila da Serra)
├── WS_STUDIO.html      ← editor de plantas + walkthrough + WS Atelier
├── WS_REAL.html        ← Camada Real: tour 360 + paralaxe + Gaussian Splatting
├── WS_ATELIER.html     ← estúdio dos móveis (catálogo, criação, ficha)
├── WS_MINT.html        ← WS Walkthrough: mundos em splat + colisor + medição
├── assets/mundos/      ← mundos em .splat (pesados: vão para CDN, não para o pacote)
├── assets/             ← móveis 3D (GLB otimizado)
├── ws-config.json      ← chaves (criar a partir do .exemplo)
├── pipeline/           ← Edge Functions + suítes de teste
└── originais/          ← cópias intactas das versões anteriores
```

## Rodar
O portal precisa de um servidor local (os iframes e o `ws-config.json` usam `fetch`):

```
python -m http.server 8080
```
Acesse `http://localhost:8080/WS_PLATAFORMA.html`

O **WS Studio isolado** continua abrindo por duplo clique (`../WS STUDIO 3D/`).

## As cinco jornadas
1. **WS Global 3D** — voo sobre a Vila da Serra, pinos, rotas, modo rua. Abre no Vale do Sereno.
2. **WS Studio 3D** — planta 2D, WS IA, acabamentos, mobília, walkthrough autoral.
3. **WS Atelier** — o estúdio dos móveis, com casa própria.
4. **WS Tour 360** — o imóvel capturado em panorâmicas, com paralaxe.
5. **WS Walkthrough** — mundos em Gaussian splat, caminhada com colisão, medição e passagens.

**Entrar no imóvel** pelo WS Global 3D abre o **Walkthrough**, não o Studio.

## ⚠ Os mundos em splat exigem servidor local
Os três mundos em `assets/mundos/` são **arquivos locais**. Um navegador nunca
busca arquivo local por `fetch` — é regra de segurança. Abrir por duplo clique
faz eles falharem com *Failed to fetch*; só o ambiente do Mint funciona, porque
vem de `https://`.

**Duas saídas, as duas funcionam:**
1. `python -m http.server 8080` na pasta e abrir por `http://localhost:8080/`
2. Ou clicar em **Escolher arquivo no computador** na própria tela de erro — o
   mundo carrega do disco e passa a funcionar até em `file://`.

Publicado na internet, os três funcionam sozinhos: o pacote leva os arquivos.

## WS Walkthrough — mundos disponíveis
Quatro ambientes na aba *Ambientes*. Os três primeiros são capturas soltas
(sem colisor): caminham, mas **a medição fica bloqueada** — piso estimado não é
geometria medida. O quarto tem colisor e libera a fita métrica.
Passagens ligam um ambiente ao outro.

## WS Atelier (arquivo próprio)
`WS_ATELIER.html` abre por duplo clique e não depende do Studio.

**Catálogo** — busca por intenção ("sofá cinza para sala pequena", "mesa barata de madeira"),
filtro por categoria, teto de preço e **raio geográfico real** a partir de Belo Horizonte.

**Criar** — até 10 fotos com sugestão do próximo ângulo, escolha de motor, textura,
malha e PBR, com custo em créditos ao vivo. Falha de geração **não consome crédito**.

**Ficha** — dimensões que alteram o 3D na hora, etiquetas de busca e três destinos:
WS Studio, pino na Camada Real ou JSON.

Sem endpoint configurado, roda em demonstração. Para ativar: publique
`pipeline/ws-atelier-edge-function.ts`, defina `MESHY_API_KEY` e acrescente antes do módulo:

```html
<script>window.WS_MESHY_ENDPOINT='https://<projeto>.functions.supabase.co/ws-atelier';</script>
```

## WS Camada Real (o imóvel que existe)

`WS_REAL.html` abre por duplo clique. Dois motores:

**Tour 360 — funciona hoje.** Arraste fotos equirretangulares (2:1) de qualquer
câmera 360. Cada foto vira uma estação; clique em *Marcar pontos de passagem* e
clique no chão para criar a navegação entre ambientes.

**Caminhar dentro da panorâmica.** Na aba *Tour 360*, escolha **Caminhar** e ajuste
largura, profundidade e pé-direito até o rodapé ficar reto — a partir daí existe
paralaxe real com **W A S D**. Com um mapa de profundidade (PNG cinza, branco = perto,
gerado no Depth Anything ou 360MonoDepth), o modo **Profundidade** transforma a foto
em geometria de verdade.

**Pinos de móvel.** Em *Pontos na cena → Móvel*, clique para fixar. O pino abre um card
com preço e carrinho. Peças criadas no Atelier chegam prontas.

**Gaussian Splat — precisa de arquivo processado.** Arraste um `.splat` ou `.ply`
binário vindo de Polycam, Luma AI, SuperSplat, Postshot ou nerfstudio.
Sem nenhum arquivo, o botão **Gerar cena de exemplo** monta uma sala por código
só para provar que o renderizador funciona — não é captura real.

Controles: arrastar gira · roda aproxima · **W A S D** caminha · **Q E** sobe e desce.

Como gravar para que o resultado preste: [[PROTOCOLO DE CAPTURA DO IMÓVEL REAL - 322]].

## Publicar na internet
```
node pipeline/publicar.mjs        # monta a pasta publicar/
node pipeline/ws_deploy_test.cjs  # 21 verificações antes de subir
```
Depois arraste a pasta `publicar/` em **app.netlify.com/drop** — o link sai com HTTPS
em segundos e funciona para qualquer pessoa. Cloudflare Pages e Vercel leem os mesmos
arquivos gerados (`_headers`, `_redirects`, `netlify.toml`, `vercel.json`).

**Antes de divulgar o link**, restrinja a chave do Google por referenciador HTTP e
defina teto de cota — a chave fica visível no navegador e sem isso qualquer pessoa
gasta seu crédito. Passo a passo: [[COMO PUBLICAR A PLATAFORMA NA INTERNET - 324]].

Links diretos: `/studio`, `/atelier`, `/real`, `/mundo` — ou `?j=studio`.
O botão **Copiar link** na barra superior copia o endereço da jornada aberta.

## Testes
```
npm i jsdom
node pipeline/ws_audit.cjs WS_STUDIO.html   # 24 testes do Studio
node pipeline/ws_real_test.cjs              # 58 testes da Camada Real
node pipeline/ws_atelier_test.cjs           # 37 testes do Atelier
node pipeline/ws_deploy_test.cjs            # 21 testes do pacote de publicação
```
Rodar os quatro antes de qualquer entrega.

## Segurança
Nenhuma chave vive no navegador. `ws-config.json` e segredos ficam fora do pacote compartilhável.
Imóvel capturado mostra a vida de alguém: autorização escrita do proprietário antes de gravar,
e nada de rosto, documento ou tela de computador no quadro.
