#!/usr/bin/env python3
"""GIFs das telas para o README (docs/gifs/), gravados da janela real do app.

Uso:
  python scripts/gif.py gravar <pasta_quadros> <segundos> [fps]   # grava a janela "Grifo Quest"
  python scripts/gif.py montar <pasta_quadros> <saida.gif> [largura] [fps da gravação]

Gravar: rode em segundo plano e navegue no app enquanto isso. Montar: junta os quadros,
reduz para a largura pedida (padrão 900 px), funde quadros repetidos (o GIF fica leve) e usa
uma paleta por quadro. Só Windows (acha a janela pelo título). Licença do projeto.
"""
import ctypes
import sys
import time
from ctypes import wintypes
from pathlib import Path

from PIL import Image, ImageChops, ImageGrab


def window_rect(title: str = "Grifo Quest"):
    user32 = ctypes.windll.user32
    hwnd = user32.FindWindowW(None, title)
    if not hwnd:
        return None
    r = wintypes.RECT()
    # moldura visível (sem a sombra invisível do Windows 10/11)
    if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) != 0:
        user32.GetWindowRect(hwnd, ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def gravar(out: Path, seconds: float, fps: float = 8):
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # coordenadas em pixels reais
    out.mkdir(parents=True, exist_ok=True)
    end = time.time() + seconds
    i = 0
    while time.time() < end:
        t0 = time.time()
        rect = window_rect()
        if rect:
            ImageGrab.grab(bbox=rect, all_screens=True).save(out / f"{i:05d}.png")
            i += 1
        time.sleep(max(0, 1 / fps - (time.time() - t0)))
    print(f"{i} quadros em {out}")


def montar(src: Path, out: Path, width: int = 900, fps: float = 8):
    files = sorted(src.glob("*.png"))
    if not files:
        sys.exit("sem quadros")
    frames, durations = [], []
    fps_ms = round(1000 / fps)
    prev = None
    for f in files:
        im = Image.open(f).convert("RGB")
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if prev is not None and ImageChops.difference(im, prev).getbbox() is None:
            durations[-1] += fps_ms  # quadro igual ao anterior: só estica o tempo
            continue
        frames.append(im)
        durations.append(fps_ms)
        prev = im
    durations[-1] += 1500  # respiro antes de recomeçar
    # 256 cores por quadro, octree: preserva manchas pequenas de cor (miniaturas dos temas, badges)
    pal = [f.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE) for f in frames]
    out.parent.mkdir(parents=True, exist_ok=True)
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(f"{out}: {len(frames)} quadros, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "gravar":
        gravar(Path(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]) if len(sys.argv) > 4 else 8)
    elif cmd == "montar":
        montar(Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 900, float(sys.argv[5]) if len(sys.argv) > 5 else 8)
    else:
        sys.exit(__doc__)
