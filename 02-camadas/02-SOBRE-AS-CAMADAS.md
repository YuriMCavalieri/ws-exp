# As camadas de experiência

Cada pasta é uma camada autônoma. Ela abre sozinha, roda sozinha e não conhece
as outras. A comunicação entre elas passa **sempre** pela aplicação hospedeira,
nunca direto.

Isso é deliberado. Significa que dá para publicar uma camada sem publicar as
outras, testar uma sem subir as outras, e substituir uma sem tocar nas demais.

```
02-camadas/
├── mundo-3d/            123 KB   Google Photorealistic 3D Tiles · three 0.170
├── studio-3d/           723 KB   editor autoral · three 0.170 · o maior
├── atelier/              51 KB   catálogo de móveis · three 0.170
├── tour-360/             73 KB   panorâmicas com paralaxe · three 0.170
├── walkthrough/          60 KB   Gaussian splat · three 0.184 + Spark
└── sala-reconstruida/    44 KB   geometria a partir de vídeo · three 0.170
```

## O que cada uma consome de fora

| Camada | Depende de | Se cair |
|---|---|---|
| Mundo 3D | Google Map Tiles, Places, Solar, Weather · TomTom · Overpass | tela com erro explicado; a camada não trava |
| Studio 3D | nenhum serviço externo obrigatório | funciona offline depois de carregado |
| Atelier | Meshy (via Edge Function) para criar móvel por foto | catálogo continua; só a criação para |
| Tour 360 | imagens do próprio imóvel | — |
| Walkthrough | CDN do Mint (runtime + mundos) | tela com erro explicado |

**Todas** dependem de `three` por CDN. Não há SRI em nenhum script — está
apontado na auditoria como item a corrigir.

## Por que o Studio tem 723 KB num arquivo só

Porque ele nasceu como protótipo e cresceu. São 6.441 linhas de JavaScript num
único `<script>`. **É o maior risco de manutenção do sistema** e o primeiro
candidato a modularização.

A recomendação da auditoria é não reescrevê-lo agora: ele está coberto por 24
testes e funciona. Quebrá-lo em módulos é trabalho de uma sprint dedicada, com
os testes rodando a cada passo — não algo para fazer de passagem durante a
integração.

## A regra que vale para todas

Todo ambiente 3D gerado precisa aparecer na tela declarado como
**representação ilustrativa**. Não é firula jurídica: um walkthrough gerado não
é o imóvel, e prometer que é cria um problema real na primeira visita. As
camadas já trazem o selo; se alguma tela nova for construída, ele precisa vir
junto.
