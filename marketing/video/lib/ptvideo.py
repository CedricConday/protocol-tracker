"""Frame renderer for Protocol Tracker promo cuts.

Pillow draws every frame, ffmpeg encodes. No external assets beyond the app
screenshots in ../assets and the DejaVu family installed on the box.
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
FONTDIR = "/usr/share/fonts/truetype/dejavu"

# Sampled from the running app, not invented.
BG = (247, 247, 242)
INK = (20, 33, 61)
BLUE = (27, 88, 184)
TEAL = (42, 166, 184)
GREEN = (47, 143, 91)
AMBER = (224, 154, 60)
RED = (192, 57, 43)
MUTED = (110, 122, 140)
LINE = (223, 223, 214)
DARK = (14, 22, 38)

FPS = 30

_fonts: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}
_images: dict[str, Image.Image] = {}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    key = (weight, size)
    if key not in _fonts:
        name = {
            "bold": "DejaVuSans-Bold.ttf",
            "regular": "DejaVuSans.ttf",
            "light": "DejaVuSans-ExtraLight.ttf",
            "mono": "DejaVuSansMono.ttf",
            "mono-bold": "DejaVuSansMono-Bold.ttf",
        }[weight]
        _fonts[key] = ImageFont.truetype(os.path.join(FONTDIR, name), size)
    return _fonts[key]


def asset(name: str) -> Image.Image:
    if name not in _images:
        _images[name] = Image.open(os.path.join(ASSETS, name)).convert("RGB")
    return _images[name]


# ---------------------------------------------------------------- easing


def ease_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 3


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 3 * t * t - 2 * t * t * t


def window(t: float, start: float, dur: float) -> float:
    """Progress 0..1 of a sub-animation starting at `start` lasting `dur`."""
    if dur <= 0:
        return 1.0
    return max(0.0, min(1.0, (t - start) / dur))


# ---------------------------------------------------------------- drawing


def rounded_shadow(canvas: Image.Image, box, radius: int, blur: int = 26, alpha: int = 46, dy: int = 14):
    x0, y0, x1, y1 = box
    pad = blur * 3
    layer = Image.new("L", (canvas.width, canvas.height), 0)
    ImageDraw.Draw(layer).rounded_rectangle(
        (x0 - 2, y0 + dy, x1 + 2, y1 + dy + 6), radius=radius, fill=alpha
    )
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(Image.new("RGB", canvas.size, (30, 40, 60)), (0, 0), layer)
    del pad


def phone(screen: Image.Image, height: int) -> Image.Image:
    """Screenshot inside a dark device body. Returns an RGB image."""
    bezel = 11
    inner_h = height - bezel * 2
    inner_w = round(screen.width * inner_h / screen.height)
    shot = screen.resize((inner_w, inner_h), Image.LANCZOS)

    body = Image.new("RGB", (inner_w + bezel * 2, height), INK)
    mask = Image.new("L", body.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius=42, fill=255)

    inner_mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(inner_mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), radius=32, fill=255)
    body.paste(shot, (bezel, bezel), inner_mask)
    body.putalpha(mask)
    return body


def paste_device(canvas: Image.Image, dev: Image.Image, cx: int, cy: int, opacity: float = 1.0):
    x = cx - dev.width // 2
    y = cy - dev.height // 2
    rounded_shadow(canvas, (x, y, x + dev.width, y + dev.height), 42)
    a = dev.getchannel("A")
    if opacity < 1.0:
        a = a.point(lambda v: int(v * opacity))
    canvas.paste(dev.convert("RGB"), (x, y), a)


def card(crop: Image.Image, width: int, radius: int = 26) -> Image.Image:
    h = round(crop.height * width / crop.width)
    img = crop.resize((width, h), Image.LANCZOS).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, h - 1), radius=radius, fill=255)
    img.putalpha(mask)
    return img


def wrap(text: str, f: ImageFont.FreeTypeFont, maxw: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for w in words:
        trial = f"{cur} {w}".strip()
        if probe.textlength(trial, font=f) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_block(
    canvas: Image.Image,
    x: int,
    y: int,
    items: list[tuple[str, str, tuple, int]],
    maxw: int,
    reveal: float = 1.0,
    stagger: float = 0.12,
):
    """items: (text, weight/size-key, colour, size). Fades+rises each item in turn."""
    d = ImageDraw.Draw(canvas, "RGBA")
    cy = y
    for i, (txt, weight, colour, size) in enumerate(items):
        f = font(weight, size)
        p = ease_out(window(reveal, i * stagger, 0.42))
        if p <= 0:
            cy += int(size * 1.34) + 16
            continue
        dy = int((1 - p) * 26)
        alpha = int(255 * p)
        for line in wrap(txt, f, maxw) if txt else [""]:
            d.text((x, cy + dy), line, font=f, fill=colour + (alpha,))
            cy += int(size * 1.34)
        cy += 16
    return cy


def eyebrow(canvas: Image.Image, x: int, y: int, txt: str, colour=BLUE, alpha: float = 1.0, size: int = 23):
    d = ImageDraw.Draw(canvas, "RGBA")
    f = font("mono-bold", size)
    cx = x
    for ch in txt.upper():
        d.text((cx, y), ch, font=f, fill=colour + (int(255 * alpha),))
        cx += d.textlength(ch, font=f) + 3.4
    d.line((x, y + size + 16, x + 62, y + size + 16), fill=colour + (int(255 * alpha),), width=3)


def ring(canvas: Image.Image, cx: int, cy: int, r: int, frac: float, colour, width: int = 18, track=LINE):
    d = ImageDraw.Draw(canvas)
    box = (cx - r, cy - r, cx + r, cy + r)
    d.arc(box, 0, 360, fill=track, width=width)
    if frac > 0:
        d.arc(box, -90, -90 + 360 * min(1.0, frac), fill=colour, width=width)


def terminal(canvas: Image.Image, box, lines: list[tuple[str, tuple]], chars: int, title: str = "bash"):
    x0, y0, x1, y1 = box
    rounded_shadow(canvas, box, 18)
    panel = Image.new("RGB", (x1 - x0, y1 - y0), DARK)
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, panel.width - 1, panel.height - 1), radius=18, fill=255)
    canvas.paste(panel, (x0, y0), mask)

    d = ImageDraw.Draw(canvas)
    d.line((x0 + 1, y0 + 46, x1 - 1, y0 + 46), fill=(38, 50, 70), width=2)
    for i, c in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        d.ellipse((x0 + 22 + i * 26, y0 + 17, x0 + 34 + i * 26, y0 + 29), fill=c)
    tf = font("mono", 19)
    d.text((x0 + 118, y0 + 14), title, font=tf, fill=(120, 134, 156))

    f = font("mono", 27)
    budget = chars
    cy = y0 + 74
    for txt, colour in lines:
        if budget <= 0:
            break
        shown = txt[:budget]
        budget -= max(1, len(txt))
        d.text((x0 + 34, cy), shown, font=f, fill=colour)
        cy += 40


def logo_lockup(canvas: Image.Image, cx: int, cy: int, scale: float = 1.0, alpha: float = 1.0, sub: str | None = None):
    m = asset("mascot.png")
    size = int(150 * scale)
    m = m.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", m.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=int(255 * alpha))
    canvas.paste(m, (cx - size // 2, cy - size), mask)

    d = ImageDraw.Draw(canvas, "RGBA")
    f = font("bold", int(62 * scale))
    t = "Protocol Tracker"
    w = d.textlength(t, font=f)
    d.text((cx - w / 2, cy + int(26 * scale)), t, font=f, fill=INK + (int(255 * alpha),))
    if sub:
        fs = font("regular", int(30 * scale))
        ws = d.textlength(sub, font=fs)
        d.text((cx - ws / 2, cy + int(112 * scale)), sub, font=fs, fill=MUTED + (int(255 * alpha),))


def fade_edges(canvas: Image.Image, t: float, dur: float, fade_in: float = 0.45, fade_out: float = 0.35):
    """Dip the whole frame toward BG at scene edges."""
    a = 1.0
    if t < fade_in:
        a = ease_out(t / fade_in)
    if t > dur - fade_out:
        a = min(a, ease_out(max(0.0, (dur - t) / fade_out)))
    if a >= 0.999:
        return canvas
    return Image.blend(Image.new("RGB", canvas.size, BG), canvas, a)


# ---------------------------------------------------------------- scenes


@dataclass
class Scene:
    dur: float
    draw: callable
    meta: dict = field(default_factory=dict)


def render(scenes: list[Scene], size: tuple[int, int], out_path: str, quiet: bool = False,
           audio: str | None = None) -> float:
    W, H = size
    tmp = tempfile.mkdtemp(prefix="ptvid-")
    n = 0
    try:
        for si, sc in enumerate(scenes):
            frames = int(round(sc.dur * FPS))
            for i in range(frames):
                t = i / FPS
                canvas = Image.new("RGB", (W, H), BG)
                sc.draw(canvas, t, sc.dur, (W, H))
                canvas = fade_edges(canvas, t, sc.dur)
                canvas.save(os.path.join(tmp, f"{n:05d}.png"))
                n += 1
            if not quiet:
                print(f"  scene {si + 1}/{len(scenes)} · {sc.dur:.1f}s · {n} frames")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-framerate", str(FPS), "-i", os.path.join(tmp, "%05d.png")]
        if audio:
            cmd += ["-i", audio]
        cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "19",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        if audio:
            cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += [out_path]
        subprocess.run(cmd, check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return n / FPS
