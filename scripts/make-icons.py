# Erzeugt alle App-Symbole, das TV-Banner und den Startbildschirm im Lumio-Design
# (Logo "L-Ecke", Farbvariante "Mitternacht & Glut").
# Aufruf: python3 scripts/make-icons.py   (benötigt: pip install pillow)
# Farben unten anpassen, um das Logo zu ändern (z. B. für saisonale Designs).
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BG_TOP = (20, 26, 63)       # Hintergrund oben links  (#141a3f)
BG_BOTTOM = (9, 12, 31)     # Hintergrund unten rechts (#090c1f)
L_COLOR = (255, 255, 255)   # Farbe des "L"
PLAY_A = (255, 120, 73)     # Play-Zeichen Verlauf Start (#ff7849)
PLAY_B = (255, 61, 139)     # Play-Zeichen Verlauf Ende  (#ff3d8b)
DOT = (255, 197, 61)        # Lichtpunkt (#ffc53d)
NAME = 'Lumio'

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def p(*parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def gradient(w, h, a, b):
    """Diagonaler Verlauf von oben links (a) nach unten rechts (b)."""
    small = Image.new('RGB', (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126.0
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return small.resize((w, h), Image.BILINEAR)


def mark(size, l_color=L_COLOR, play=(PLAY_A, PLAY_B), dot=DOT, glow=True):
    """Zeichnet das Logo (100x100-Raster) in der gewünschten Größe auf transparentem Grund."""
    S = 4
    n = size * S
    k = n / 100.0
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = int(10 * k)
    r = w / 2
    # "L": senkrechte Linie, Viertelkreis, waagerechte Linie (mit runden Enden)
    d.line([(14 * k, 20 * k), (14 * k, 64 * k)], fill=l_color, width=w)
    d.arc([(34 - 25) * k, (64 - 25) * k, (34 + 25) * k, (64 + 25) * k], 90, 180, fill=l_color, width=w)
    d.line([(34 * k, 84 * k), (78 * k, 84 * k)], fill=l_color, width=w)
    for cx, cy in ((14, 20), (78, 84), (14, 64), (34, 84)):
        d.ellipse([cx * k - r, cy * k - r, cx * k + r, cy * k + r], fill=l_color)
    # Play-Dreieck mit abgerundeten Ecken und Farbverlauf
    mask = Image.new('L', (n, n), 0)
    md = ImageDraw.Draw(mask)
    tri = [(42 * k, 25.5 * k), (78.5 * k, 46 * k), (42 * k, 66.5 * k)]
    rr = 4 * k
    md.polygon(tri, fill=255)
    for i in range(3):
        md.line([tri[i], tri[(i + 1) % 3]], fill=255, width=int(2 * rr))
    for x, y in tri:
        md.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    x0, y0, x1, y1 = int(38 * k), int(21.5 * k), int(82.5 * k), int(70.5 * k)
    fill = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    fill.paste(gradient(x1 - x0, y1 - y0, play[0], play[1]).convert('RGBA'), (x0, y0))
    img.paste(fill, (0, 0), mask)
    # Lichtpunkt mit leichtem Leuchten
    if glow:
        g = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse([(84 - 9) * k, (22 - 9) * k, (84 + 9) * k, (22 + 9) * k], fill=dot + (150,))
        g = g.filter(ImageFilter.GaussianBlur(2.6 * k))
        img = Image.alpha_composite(img, g)
        d = ImageDraw.Draw(img)
    d.ellipse([(84 - 6) * k, (22 - 6) * k, (84 + 6) * k, (22 + 6) * k], fill=dot + (255,))
    return img.resize((size, size), Image.LANCZOS)


def icon(size, rounded=False, scale=0.68):
    """App-Symbol: Verlaufs-Hintergrund mit Logo in der Mitte."""
    bg = gradient(size, size, BG_TOP, BG_BOTTOM).convert('RGBA')
    m = mark(int(size * scale))
    off = (size - m.width) // 2
    bg.alpha_composite(m, (off, off + int(size * 0.01)))
    if rounded:
        S = 4
        mask = Image.new('L', (size * S, size * S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * S, size * S], radius=int(size * S * 0.23), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        return out
    return bg


def font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'arialbd.ttf',
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


# App-Symbole (Android, iPhone/iPad, PC): quadratisch, das System rundet selbst ab
icon(1024).convert('RGB').save(p('assets', 'icon-only.png'))
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
m = mark(600)
fg.alpha_composite(m, (212, 218))
fg.save(p('assets', 'icon-foreground.png'))
gradient(1024, 1024, BG_TOP, BG_BOTTOM).save(p('assets', 'icon-background.png'))

# Startbildschirm
sp = Image.new('RGBA', (2732, 2732), (10, 12, 17, 255))
sm = mark(520)
sp.alpha_composite(sm, ((2732 - 520) // 2, (2732 - 520) // 2))
sp.convert('RGB').save(p('assets', 'splash.png'))
sp.convert('RGB').save(p('assets', 'splash-dark.png'))

# Android-TV-Banner 320x180
S = 4
W, H = 320, 180
ban = gradient(W * S, H * S, BG_TOP, BG_BOTTOM).convert('RGBA')
bm = mark(int(H * 0.56) * S)
x0 = int(W * 0.12) * S
ban.alpha_composite(bm, (x0, (H * S - bm.height) // 2))
ImageDraw.Draw(ban).text((x0 + bm.width + int(H * 0.07) * S, H * S // 2), NAME,
                         font=font(46 * S), fill=(243, 245, 249), anchor='lm')
ban.resize((W, H), Image.LANCZOS).convert('RGB').save(p('assets', 'banner.png'))

# Samsung (512x423), LG (80x80, 130x130), Webseite/App (192x192)
tz = gradient(512, 423, BG_TOP, BG_BOTTOM).convert('RGBA')
tm = mark(300)
tz.alpha_composite(tm, (106, 62))
tz.save(p('platforms', 'tizen', 'icon.png'))
icon(80, rounded=True).save(p('platforms', 'webos', 'icon.png'))
icon(130, rounded=True).save(p('platforms', 'webos', 'largeIcon.png'))
icon(192, rounded=True).save(p('www', 'img', 'icon.png'))

print('Symbole erzeugt')
