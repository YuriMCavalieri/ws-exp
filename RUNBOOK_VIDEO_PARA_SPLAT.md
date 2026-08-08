# RUNBOOK — de um vídeo do celular a um mundo em splats

> **A correção que vem antes de tudo:** o LingBot-Map **não gera Gaussian Splats.**
> Ele gera pose de câmera e nuvem densa. Quem gera splat é o treinador que vem
> depois. Este runbook liga os dois.

```
vídeo  →  quadros em resolução cheia
       →  LingBot-Map            (pose + nuvem, 518 px)
       →  lingbot_to_colmap.py   (traduz + reescala a intrínseca)
       →  Brush / Postshot       (treina o splat)
       →  .ply  →  WS_MINT.html
```

---

## Rota A — a mais fácil, sem LingBot-Map (comece por aqui)

Se o objetivo é **ver um splat bom hoje**, não passe pelo LingBot-Map. Ele é
um modelo de pesquisa que exige CUDA 12.8, PyTorch 2.8, FlashInfer, Kaolin e
compilação de extensão CUDA. Nada disso melhora o splat final.

1. Grave o vídeo seguindo o protocolo de captura abaixo.
2. Abra o **Postshot** (Windows, GPU NVIDIA) e arraste o vídeo.
3. Perfil **Splat MCMC**, 1 a 2 milhões de splats, 30 mil steps.
4. Exporte `.ply`.
5. Suba o `.ply` para o CDN e aponte um ambiente do `WS_MINT.html` para ele.

Tempo: 30 a 60 minutos por cômodo, quase tudo de espera.
Isso já entrega qualidade acima do que temos hoje na plataforma.

---

## Rota B — com LingBot-Map, quando a Rota A falha

A Rota A falha quando o rastreamento perde a pose: corredor comprido, parede
lisa sem textura, banheiro branco, giro rápido. É aí que o LingBot-Map ganha —
ele é um transformer treinado para justamente isso e não depende de textura
para casar quadros.

### Ambiente (uma vez)

```bash
conda create -n lingbot-map python=3.10 -y && conda activate lingbot-map
pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
pip install -e .
pip install --index-url https://pypi.org/simple flashinfer-python
pip install -e ".[vis,render]"
pip install onnxruntime-gpu
pip install --index-url https://pypi.org/simple kaolin \
    -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.8.0_cu128.html
cd demo_render/render_cuda_ext && python setup.py build_ext --inplace && cd ../..
```

Modelo: baixe `lingbot-map.pt` de `robbyant/lingbot-map` no Hugging Face.
GPU com 8 GB funciona — há um fork para RTX 4060 8 GB citado no README.

### Passo 1 — quadros em resolução CHEIA

Este passo é o que decide a nitidez final. Extraia você mesmo, em resolução
original, e guarde. O LingBot-Map vai ler estes mesmos arquivos e reduzi-los
internamente para 518 px, mas o treinador de splat vai ler os originais.

```bash
ffmpeg -i imovel.mp4 -vf fps=4 -q:v 1 quadros/frame_%06d.png
```

`fps=4` num vídeo de 3 minutos dá ~720 quadros — número saudável para um
cômodo. Mais que isso só aumenta o tempo de treino.

### Passo 2 — pose e nuvem

```bash
python demo_render/batch_demo.py \
  --image_folder ./quadros \
  --output_folder ./saida \
  --model_path ./lingbot-map.pt \
  --config demo_render/config/indoor.yaml \
  --mode windowed --window_size 128 \
  --keyframe_interval 4 --overlap_keyframes 8 \
  --camera_num_iterations 4 \
  --save_predictions
```

- `--config indoor.yaml` — `max_depth: 10 m`, correto para interior. O preset
  outdoor usa 250 m e desperdiça precisão.
- `--keyframe_interval 4` — para até ~1500 quadros. Suba para 10 se for maior.
- `--camera_num_iterations 4` — é o padrão e é o que dá a pose boa. Não baixe
  para 1 aqui; velocidade não é o gargalo neste passo.
- Sem `--mask_sky`: interior não tem céu, e a máscara só comeria janela.
- **Não** use `--keyframes_only_points`: ela existe para deixar o vídeo de
  demonstração leve; nós queremos a nuvem densa.

Confira `saida/*_pointcloud.mp4` antes de seguir. Se a trajetória der um salto
ou a nuvem duplicar o cômodo, a pose colapsou — reduza `--keyframe_interval`
ou `--window_size` e rode de novo. Seguir com pose ruim é jogar fora o tempo
de treino do splat.

### Passo 3 — traduzir para COLMAP

```bash
python pipeline/lingbot_to_colmap.py \
  --predictions ./saida/quadros_predictions \
  --frames      ./quadros \
  --out         ./saida/colmap \
  --conf 2.0 --max-points 500000
```

O script reescala a intrínseca de 518 px para a resolução do vídeo e aponta o
dataset para os quadros originais. Sem isso, o splat nasce com teto de nitidez
de 518 px e nenhuma configuração de treino recupera.

`--conf` controla a limpeza da nuvem inicial. Comece em 2.0; se o splat nascer
com névoa flutuando, suba para 3.0.

### Passo 4 — treinar o splat

**Brush** (grátis, aberto, sem CUDA, roda em Windows/macOS/Android/web):

```bash
brush ./saida/colmap
```

**gsplat** (mais controle, precisa CUDA):

```bash
python simple_trainer.py default --data_dir ./saida/colmap --result_dir ./splat
```

**Postshot**: importe `./saida/colmap` como projeto COLMAP.

### Passo 5 — publicar

O `.ply` de splats vai para o CDN e entra no `WS_MINT.html` como um ambiente
novo. Formato `ply`, não `rad` — o `rad` paginado é da Mint.

**A medição continua desligada.** Este caminho produz a nuvem, não o colisor.
Sem colisor não há geometria em que se possa confiar, e a regra da plataforma
é recusar medir em vez de mostrar número errado.

---

## Protocolo de captura — vale mais que qualquer parâmetro

Nenhum ajuste de treino conserta um vídeo mal gravado.

| Regra | Por quê |
|---|---|
| Ande **devagar**, passo de museu | motion blur não é recuperável; borrão entra na nuvem e fica |
| **Trave o foco e a exposição** antes de começar | foco variável faz o modelo achar que a geometria mudou |
| Uma volta completa **rente à parede**, depois uma segunda **pelo meio** | paralaxe de duas alturas é o que resolve profundidade |
| **Nunca gire no próprio eixo** | rotação pura não gera paralaxe — é o erro nº 1 |
| Acenda **todas** as luzes, feche as cortinas | janela estourada vira buraco branco na nuvem |
| 4K a 30 fps, o mais estável que der | é o teto de nitidez de tudo o que vem depois |
| Passe **duas vezes** por cada canto | canto visto uma vez só é onde o splat desmancha |
| 2 a 4 minutos por cômodo | mais que isso não melhora e custa treino |

---

## Comparação honesta das rotas

| | Mint (hoje) | Postshot direto | LingBot-Map + Brush |
|---|---|---|---|
| Entrada | texto + foto | vídeo | vídeo |
| Colisor | **sim** | não | não |
| Medição confiável | **sim** | não | não |
| Custo por ambiente | US$ 1,20 | 0 (hardware próprio) | 0 (hardware próprio) |
| Tempo | ~10 min | 30–60 min | 1–3 h |
| Fidelidade ao imóvel real | representação ilustrativa | **o imóvel real** | **o imóvel real** |
| Dependência externa | total | nenhuma | nenhuma |
| Instalação | nenhuma | ~15 min | ~2 h |

**A leitura:** a Mint entrega o colisor, que é o que sustenta a medição — e
por isso continua sendo a rota de produto. O caminho por vídeo entrega o
imóvel **real**, que é o que o anunciante quer vender, e não depende de
fornecedor. Os dois não competem; eles cobrem coisas diferentes.

Relacionado: [[TELA PRETA DO WALKTHROUGH — CAUSA RAIZ E VIGIA - 331]] ·
[[ECONOMIA DO WALKTHROUGH E CAPTURA GUIADA - 329]] ·
[[PROTOCOLO DE CAPTURA DO IMÓVEL REAL - 322]]
