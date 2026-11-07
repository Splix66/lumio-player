# Erzeugt alle App-Symbole, das TV-Banner und den Startbildschirm.
# Aufruf: python3 scripts/make-icons.py   (benötigt: pip install pillow)
# Farben unten anpassen, um das Logo zu ändern.
import os
from PIL import Image, ImageDraw, ImageFont

A = (255, 120, 73)    # Hauptfarbe
B = (255, 179, 71)    # Zweitfarbe
BG = (10, 12, 17)     # Hintergrund
INK = (26, 13, 6)     # Farbe des Play-Symbols
NAME = 'Lumio'

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def p(*parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def grad(w, h):
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = x / w * 0.6 + y / h * 0.4
            px[x, y] = tuple(int(A[i] + (B[i] - A[i]) * t) for i in range(3))
    return im


def icon(size):
    s4 = size * 4
    base = Image.new('RGBA', (s4, s4), (0, 0, 0, 0))
    mask = Image.new('L', (s4, s4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s4, s4], radius=int(s4 * 0.22), fill=255)
    base.paste(grad(s4, s4).convert('RGBA'), (0, 0), mask)
    cx, cy, r = s4 * 0.53, s4 * 0.5, s4 * 0.2
    ImageDraw.Draw(base).polygon([(cx - r * 0.85, cy - r), (cx - r * 0.85, cy + r), (cx + r * 0.95, cy)], fill=INK + (255,))
    return base.resize((size, size), Image.LANCZOS)


def font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'arialbd.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


icon(1024).save(p('assets', 'icon-only.png'))
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
small = icon(640)
fg.paste(small, (192, 192), small)
fg.save(p('assets', 'icon-foreground.png'))
grad(512, 512).resize((1024, 1024)).save(p('assets', 'icon-background.png'))

sp = Image.new('RGB', (2732, 2732), BG)
mid = icon(490)
sp.paste(mid, (1121, 1121), mid)
sp.save(p('assets', 'splash.png'))
sp.save(p('assets', 'splash-dark.png'))

# Android-TV-Banner 320x180
S = 4
W, H = 320, 180
ban = Image.new('RGB', (W * S, H * S), BG)
ic = icon(int(H * 0.42) * S)
ban.paste(ic, (int(W * 0.1) * S, (H * S - ic.height) // 2), ic)
ImageDraw.Draw(ban).text((int(W * 0.1) * S + ic.width + int(H * 0.08) * S, H * S // 2), NAME,
                         font=font(40 * S), fill=(243, 245, 249), anchor='lm')
ban.resize((W, H), Image.LANCZOS).save(p('assets', 'banner.png'))

# Samsung (512x423) und LG (80x80, 130x130)
tz = Image.new('RGBA', (512, 423), BG + (255,))
t_ic = icon(300)
tz.paste(t_ic, (106, 61), t_ic)
tz.save(p('platforms', 'tizen', 'icon.png'))
icon(80).save(p('platforms', 'webos', 'icon.png'))
icon(130).save(p('platforms', 'webos', 'largeIcon.png'))
icon(192).save(p('www', 'img', 'icon.png'))

print('✓ Symbole erzeugt')
