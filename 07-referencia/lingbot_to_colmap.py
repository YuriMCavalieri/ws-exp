#!/usr/bin/env python3
"""
lingbot_to_colmap.py — a ponte que falta no LingBot-Map.

PARA QUE SERVE
--------------
O LingBot-Map NÃO produz Gaussian Splats. Ele produz o que é caro e difícil de
obter: a POSE de cada quadro e uma nuvem densa alinhada. Depois disso, treinar
o splat é a parte fácil — mas nenhum treinador de splat lê o formato de saída
do LingBot-Map. Este script traduz.

    vídeo → LingBot-Map (--save_predictions) → [ESTE SCRIPT] → COLMAP →
    Brush / Postshot / gsplat / LichtFeld → arquivo .ply de splats

O DETALHE QUE DEFINE A QUALIDADE
--------------------------------
O LingBot-Map trabalha a 518 px de largura. Se você treinar o splat nessas
imagens, o teto de nitidez é 518 px e nada depois disso recupera. Este script
reescala a intrínseca para a resolução ORIGINAL do vídeo e aponta o COLMAP
para os quadros em resolução cheia. A pose vem do modelo pequeno; o pixel vem
do vídeo grande. É isso que separa um splat de demonstração de um splat de
produto.

A matemática do reescalonamento reproduz exatamente o pré-processamento de
`lingbot_map/utils/load_fn.py` no modo "crop":

    nova_largura = 518
    nova_altura  = round(H * (518/W) / patch) * patch      # patch = 14
    se nova_altura > 518: corta no centro, start_y = (nova_altura - 518)//2

    sx = nova_largura / W        fx_full = fx_model / sx
    sy = nova_altura  / H        fy_full = fy_model / sy
                                 cx_full = cx_model / sx
                                 cy_full = (cy_model + start_y) / sy

USO
---
    python lingbot_to_colmap.py \
        --predictions /saida/imovel_predictions \
        --frames      /saida/imovel_frames \
        --out         /saida/imovel_colmap \
        --conf 2.0 --max-points 500000

Depois:
    Brush     → abra a pasta /saida/imovel_colmap
    gsplat    → python simple_trainer.py default --data_dir /saida/imovel_colmap
    Postshot  → importe a pasta como projeto COLMAP

REQUISITOS: numpy, Pillow (opcional, só para ler dimensão dos quadros).
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

import numpy as np

PATCH = 14          # patch_size usado pelo carregador de vídeo do LingBot-Map
MODEL_SIZE = 518    # image_size do modelo


# ─────────────────────────────────────────────────────────── geometria

def matriz_para_quaternion(R: np.ndarray) -> np.ndarray:
    """Rotação 3x3 → quaternion (qw, qx, qy, qz), convenção do COLMAP.

    Usa o algoritmo de Shepperd: escolhe o maior elemento da diagonal para
    evitar divisão por número pequeno. Ingênuo demais e o quaternion explode
    quando o traço é próximo de -1 — que é justamente o caso de câmera olhando
    para trás, comum em walkthrough de imóvel quando a pessoa se vira.
    """
    m = np.asarray(R, dtype=np.float64)
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0.0:
        s = np.sqrt(tr + 1.0) * 2.0
        qw = 0.25 * s
        qx = (m[2, 1] - m[1, 2]) / s
        qy = (m[0, 2] - m[2, 0]) / s
        qz = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2.0
        qw = (m[2, 1] - m[1, 2]) / s
        qx = 0.25 * s
        qy = (m[0, 1] + m[1, 0]) / s
        qz = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2.0
        qw = (m[0, 2] - m[2, 0]) / s
        qx = (m[0, 1] + m[1, 0]) / s
        qy = 0.25 * s
        qz = (m[1, 2] + m[2, 1]) / s
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2.0
        qw = (m[1, 0] - m[0, 1]) / s
        qx = (m[0, 2] + m[2, 0]) / s
        qy = (m[1, 2] + m[2, 1]) / s
        qz = 0.25 * s
    q = np.array([qw, qx, qy, qz], dtype=np.float64)
    n = np.linalg.norm(q)
    if n < 1e-12:
        return np.array([1.0, 0.0, 0.0, 0.0])
    return q / n


def geometria_do_preprocessamento(W: int, H: int):
    """Devolve (sx, sy, start_y) do pré-processamento modo 'crop'."""
    nova_largura = MODEL_SIZE
    nova_altura = int(round(H * (nova_largura / W) / PATCH) * PATCH)
    start_y = (nova_altura - MODEL_SIZE) // 2 if nova_altura > MODEL_SIZE else 0
    sx = nova_largura / W
    sy = nova_altura / H
    return sx, sy, start_y


def intrinseca_para_resolucao_cheia(K: np.ndarray, W: int, H: int) -> np.ndarray:
    sx, sy, start_y = geometria_do_preprocessamento(W, H)
    K2 = np.array(K, dtype=np.float64).copy()
    K2[0, 0] /= sx                      # fx
    K2[1, 1] /= sy                      # fy
    K2[0, 2] /= sx                      # cx
    K2[1, 2] = (K2[1, 2] + start_y) / sy  # cy: desfaz o corte antes de escalar
    return K2


# ─────────────────────────────────────────────────────────── leitura

def ler_predicoes(pasta: str):
    """Lê frame_*.npz do LingBot-Map. Devolve lista de dicionários por quadro."""
    arquivos = sorted(glob.glob(os.path.join(pasta, "frame_*.npz")))
    if not arquivos:
        raise SystemExit(
            f"Nenhum frame_*.npz em {pasta}.\n"
            "Rode o LingBot-Map com --save_predictions antes deste script."
        )
    quadros = []
    for a in arquivos:
        with np.load(a, allow_pickle=False) as z:
            quadros.append({k: z[k] for k in z.files})
    return quadros, arquivos


def achatar(a: np.ndarray) -> np.ndarray:
    """Remove dimensões de tamanho 1 na frente (o batch de 1 do modelo)."""
    while a.ndim > 2 and a.shape[0] == 1:
        a = a[0]
    return a


def extrinseca_3x4(q: dict) -> np.ndarray:
    e = achatar(np.asarray(q["extrinsic"], dtype=np.float64))
    if e.shape == (4, 4):
        e = e[:3, :4]
    if e.shape != (3, 4):
        raise ValueError(f"extrinsic com forma inesperada: {e.shape}")
    return e


def dimensoes_do_quadro(caminho: str):
    try:
        from PIL import Image
        with Image.open(caminho) as im:
            return im.size          # (W, H)
    except Exception as exc:
        raise SystemExit(
            f"Não consegui ler {caminho} para descobrir a resolução: {exc}\n"
            "Instale Pillow (pip install Pillow) ou passe --width/--height."
        )


# ─────────────────────────────────────────────────────────── escrita

def escrever_cameras(caminho, Ks, W, H, camera_unica):
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("# Camera list with one line of data per camera:\n")
        f.write("#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]\n")
        if camera_unica:
            K = np.median(np.stack(Ks), axis=0)
            f.write(f"1 PINHOLE {W} {H} "
                    f"{K[0,0]:.10f} {K[1,1]:.10f} {K[0,2]:.10f} {K[1,2]:.10f}\n")
        else:
            for i, K in enumerate(Ks, start=1):
                f.write(f"{i} PINHOLE {W} {H} "
                        f"{K[0,0]:.10f} {K[1,1]:.10f} {K[0,2]:.10f} {K[1,2]:.10f}\n")


def escrever_images(caminho, extrinsecas, nomes, camera_unica):
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("# Image list with two lines of data per image:\n")
        f.write("#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME\n")
        f.write("#   POINTS2D[] as (X, Y, POINT3D_ID)\n")
        for i, (E, nome) in enumerate(zip(extrinsecas, nomes), start=1):
            qw, qx, qy, qz = matriz_para_quaternion(E[:3, :3])
            tx, ty, tz = E[:3, 3]
            cam = 1 if camera_unica else i
            f.write(f"{i} {qw:.10f} {qx:.10f} {qy:.10f} {qz:.10f} "
                    f"{tx:.10f} {ty:.10f} {tz:.10f} {cam} {nome}\n")
            f.write("\n")          # linha de POINTS2D vazia — exigida pelo formato


def escrever_points3d(caminho, xyz, rgb):
    with open(caminho, "w", encoding="utf-8") as f:
        f.write("# 3D point list with one line of data per point:\n")
        f.write("#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[]\n")
        for i, (p, c) in enumerate(zip(xyz, rgb), start=1):
            f.write(f"{i} {p[0]:.6f} {p[1]:.6f} {p[2]:.6f} "
                    f"{int(c[0])} {int(c[1])} {int(c[2])} 0.0\n")


# ─────────────────────────────────────────────────────────── nuvem inicial

def coletar_nuvem(quadros, conf_min, max_pontos, semente=7):
    """Junta world_points de todos os quadros, filtra por confiança e amostra.

    A amostragem é uniforme sobre o conjunto já filtrado, e não os N primeiros
    pontos: pegar os primeiros concentraria a nuvem inicial nos quadros do
    começo do vídeo e o treino nasceria enviesado para um canto do cômodo.
    """
    if "world_points" not in quadros[0]:
        return None, None

    rng = np.random.default_rng(semente)
    pedacos_xyz, pedacos_rgb = [], []
    por_quadro = max(1, max_pontos // max(1, len(quadros)) * 3)

    for q in quadros:
        P = achatar(np.asarray(q["world_points"], dtype=np.float32))
        if P.ndim != 3 or P.shape[-1] != 3:
            continue
        P = P.reshape(-1, 3)

        ok = np.isfinite(P).all(axis=1)
        chave = "world_points_conf" if "world_points_conf" in q else "depth_conf"
        if chave in q:
            C = achatar(np.asarray(q[chave], dtype=np.float32)).reshape(-1)
            if C.shape[0] == P.shape[0]:
                ok &= C >= conf_min

        idx = np.flatnonzero(ok)
        if idx.size == 0:
            continue
        if idx.size > por_quadro:
            idx = rng.choice(idx, size=por_quadro, replace=False)

        pedacos_xyz.append(P[idx])

        if "images" in q:
            I = achatar(np.asarray(q["images"], dtype=np.float32))
            if I.ndim == 3 and I.shape[0] == 3:      # (3,H,W) → (H,W,3)
                I = np.transpose(I, (1, 2, 0))
            if I.ndim == 3 and I.shape[-1] == 3:
                cor = I.reshape(-1, 3)
                if cor.shape[0] == P.shape[0]:
                    c = cor[idx]
                    if c.max() <= 1.001:
                        c = c * 255.0
                    pedacos_rgb.append(np.clip(c, 0, 255).astype(np.uint8))
                    continue
        pedacos_rgb.append(np.full((idx.size, 3), 200, dtype=np.uint8))

    if not pedacos_xyz:
        return None, None

    xyz = np.concatenate(pedacos_xyz, axis=0)
    rgb = np.concatenate(pedacos_rgb, axis=0)
    if xyz.shape[0] > max_pontos:
        sel = rng.choice(xyz.shape[0], size=max_pontos, replace=False)
        xyz, rgb = xyz[sel], rgb[sel]
    return xyz, rgb


# ─────────────────────────────────────────────────────────── principal

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Converte predições do LingBot-Map em um dataset COLMAP "
                    "pronto para treinar Gaussian Splats.")
    ap.add_argument("--predictions", required=True,
                    help="pasta com frame_000000.npz ... (--save_predictions)")
    ap.add_argument("--frames", required=True,
                    help="pasta com os quadros em RESOLUÇÃO CHEIA (frame_%%06d.png)")
    ap.add_argument("--out", required=True, help="pasta do dataset COLMAP de saída")
    ap.add_argument("--conf", type=float, default=2.0,
                    help="confiança mínima do ponto (padrão 2.0; suba para nuvem mais limpa)")
    ap.add_argument("--max-points", type=int, default=500_000,
                    help="teto de pontos na nuvem inicial (padrão 500 mil)")
    ap.add_argument("--width", type=int, default=0, help="força a largura original")
    ap.add_argument("--height", type=int, default=0, help="força a altura original")
    ap.add_argument("--per-frame-camera", action="store_true",
                    help="uma câmera COLMAP por quadro em vez de uma só (intrínseca variável)")
    ap.add_argument("--no-rescale", action="store_true",
                    help="mantém a intrínseca em 518 px — só use se for treinar nas imagens do modelo")
    args = ap.parse_args()

    quadros, _ = ler_predicoes(args.predictions)
    imagens = sorted(glob.glob(os.path.join(args.frames, "*.png")) +
                     glob.glob(os.path.join(args.frames, "*.jpg")) +
                     glob.glob(os.path.join(args.frames, "*.jpeg")))
    if not imagens:
        raise SystemExit(f"Nenhum quadro em {args.frames}")

    n = min(len(quadros), len(imagens))
    if len(quadros) != len(imagens):
        print(f"  aviso: {len(quadros)} predições e {len(imagens)} quadros. "
              f"Usando os {n} primeiros de cada.\n"
              f"  Isso acontece quando --image_stride ou --fps descartaram quadros. "
              f"Se o pareamento estiver errado, o splat sai borrado — confira.")
    quadros, imagens = quadros[:n], imagens[:n]

    if args.width and args.height:
        W, H = args.width, args.height
    else:
        W, H = dimensoes_do_quadro(imagens[0])

    if args.no_rescale:
        Wc, Hc = MODEL_SIZE, MODEL_SIZE
        conv = lambda K: np.asarray(K, dtype=np.float64)
        print(f"  intrínseca mantida em {MODEL_SIZE} px (--no-rescale)")
    else:
        Wc, Hc = W, H
        conv = lambda K: intrinseca_para_resolucao_cheia(K, W, H)
        sx, sy, sy0 = geometria_do_preprocessamento(W, H)
        print(f"  quadro original {W}x{H} · escala {sx:.4f}/{sy:.4f} · corte y {sy0} px")

    Ks, Es, nomes = [], [], []
    for q, img in zip(quadros, imagens):
        K = achatar(np.asarray(q["intrinsic"], dtype=np.float64))
        if K.shape == (3, 4):
            K = K[:3, :3]
        Ks.append(conv(K))
        Es.append(extrinseca_3x4(q))
        nomes.append(os.path.basename(img))

    sparse = os.path.join(args.out, "sparse", "0")
    os.makedirs(sparse, exist_ok=True)

    camera_unica = not args.per_frame_camera
    escrever_cameras(os.path.join(sparse, "cameras.txt"), Ks, Wc, Hc, camera_unica)
    escrever_images(os.path.join(sparse, "images.txt"), Es, nomes, camera_unica)

    xyz, rgb = coletar_nuvem(quadros, args.conf, args.max_points)
    if xyz is None:
        escrever_points3d(os.path.join(sparse, "points3D.txt"),
                          np.zeros((0, 3)), np.zeros((0, 3)))
        print("  aviso: sem world_points nas predições — points3D.txt saiu vazio.\n"
              "  Brush e gsplat conseguem inicializar aleatoriamente, mas o resultado\n"
              "  é pior. Rode o LingBot-Map sem podar o point_head.")
    else:
        escrever_points3d(os.path.join(sparse, "points3D.txt"), xyz, rgb)
        print(f"  nuvem inicial: {xyz.shape[0]:,} pontos (conf >= {args.conf})")

    destino = os.path.join(args.out, "images")
    if not os.path.exists(destino):
        try:
            os.symlink(os.path.abspath(args.frames), destino)
            print(f"  images/ → link para {args.frames}")
        except (OSError, NotImplementedError):
            print(f"  não consegui criar o link images/. Copie ou mova a mão:\n"
                  f"      {args.frames}  →  {destino}")

    print(f"\n  dataset COLMAP escrito em {args.out}")
    print(f"  {len(nomes)} câmeras · {Wc}x{Hc} · "
          f"{'uma câmera compartilhada' if camera_unica else 'câmera por quadro'}")
    print("\n  próximo passo — treine o splat:")
    print(f"      brush {args.out}")
    print(f"      # ou: python simple_trainer.py default --data_dir {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
