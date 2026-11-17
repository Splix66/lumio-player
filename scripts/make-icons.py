# Erzeugt alle App-Symbole, das TV-Banner und den Startbildschirm im Telvo-Design
# (Logo „T mit Bogen und Play-Zeichen“. Stand 11/2026, neues Aussehen 1.15.10: lila Kachel mit Verlauf,
#  „T“ und Play-Zeichen weiß – Erays Wahl „Logo 1 Verlauf“ für App-Symbol, Startbild, TV-Banner und Leiste).
# Dasselbe Logo als SVG: www/js/app.js (LOGO_SVG), www/index.html (#boot), docs/favicon.svg, docs/index.html, docs/admin.html, docs/app/index.html.
# Aufruf: python3 scripts/make-icons.py   (benötigt: pip install pillow)
# Farben unten anpassen, um das Logo zu ändern.
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

TILE_A = (167, 139, 250)    # Kachel Verlauf Start, oben links   (#a78bfa)
TILE_B = (109, 61, 240)     # Kachel Verlauf Ende, unten rechts  (#6d3df0)
APP_BG = (21, 20, 31)       # Hintergrund der App (#15141f) – für das Startbild
T_TOP = (255, 255, 255)     # „T“ oben
T_BOTTOM = (255, 255, 255)  # „T“ unten
PLAY_A = (255, 255, 255)    # Play-Zeichen (weiß)
PLAY_B = (255, 255, 255)
NAME = 'Telvo'

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def p(*parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def gradient(w, h, a, b, mid=None, vertical=False):
    """Verlauf: diagonal von oben links nach unten rechts – oder senkrecht (mit optionaler Mittelfarbe)."""
    small = Image.new('RGB', (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = y / 63.0 if vertical else (x + y) / 126.0
            if mid is not None:
                c0, c1, tt = (a, mid, t / .55) if t < .55 else (mid, b, (t - .55) / .45)
            else:
                c0, c1, tt = a, b, t
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * tt) for i in range(3))
    return small.resize((w, h), Image.BILINEAR)


def background(w, h):
    """Lila Kachel: Verlauf von oben links nach unten rechts."""
    return gradient(w, h, TILE_A, TILE_B)


def mark(size):
    """Zeichnet das Logo (100x100-Raster wie im SVG) in der gewünschten Größe auf transparentem Grund.
    SVG: Pfad „M17 25H70a12 12 0 0 1 12 12M42 25v50“ (Strich 12, runde Enden) und das Play-Dreieck
    (translate(16.5 11.5) scale(.78))."""
    S = 4
    n = size * S
    k = n / 100.0
    w = 12 * k
    r = w / 2
    # „T“ mit Bogen als Maske, dann senkrechter Verlauf (weiß → hellgrau)
    tm = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(tm)
    d.line([(17 * k, 25 * k), (70 * k, 25 * k)], fill=255, width=int(w))
    d.line([(42 * k, 25 * k), (42 * k, 75 * k)], fill=255, width=int(w))
    R = 12 * k   # Bogen: Mittelpunkt (70, 37), Radius 12, von oben nach rechts
    d.arc([70 * k - R - r, 37 * k - R - r, 70 * k + R + r, 37 * k + R + r], 270, 360, fill=255, width=int(w))
    for cx, cy in ((17, 25), (70, 25), (82, 37), (42, 75), (42, 25)):
        d.ellipse([cx * k - r, cy * k - r, cx * k + r, cy * k + r], fill=255)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    img.paste(gradient(n, n, T_TOP, T_BOTTOM, vertical=True).convert('RGBA'), (0, 0), tm)
    # Play-Dreieck mit abgerundeten Ecken und Farbverlauf
    def t(x, y):
        return ((x * .78 + 16.5) * k, (y * .78 + 11.5) * k)
    mask = Image.new('L', (n, n), 0)
    md = ImageDraw.Draw(mask)
    tri = [t(53, 37.5), t(79, 54), t(53, 70.5)]
    rr = 3.5 * .78 * k
    md.polygon(tri, fill=255)
    for i in range(3):
        md.line([tri[i], tri[(i + 1) % 3]], fill=255, width=int(2 * rr))
    for x, y in tri:
        md.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
    (x0, y0), (x1, y1) = t(49, 33.5), t(83, 74.5)
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    fill = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    fill.paste(gradient(x1 - x0, y1 - y0, PLAY_A, PLAY_B).convert('RGBA'), (x0, y0))
    img.paste(fill, (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


def icon(size, rounded=False, scale=0.8):
    """App-Symbol: lila Kachel mit weißem Logo in der Mitte; abgerundet mit feinem hellem Rand."""
    bg = background(size, size).convert('RGBA')
    m = mark(int(size * scale))
    off = (size - m.width) // 2
    bg.alpha_composite(m, (off, off))
    if rounded:
        S = 4
        rad = int(size * S * 0.22)
        mask = Image.new('L', (size * S, size * S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * S - 1, size * S - 1], radius=rad, fill=255)
        rim = Image.new('RGBA', (size * S, size * S), (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle([S // 2, S // 2, size * S - 1 - S // 2, size * S - 1 - S // 2], radius=rad,
                                              outline=(255, 255, 255, 40), width=max(S, size * S // 120))
        bg = bg.resize((size * S, size * S), Image.LANCZOS)
        bg.alpha_composite(rim)
        out = Image.new('RGBA', (size * S, size * S), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        return out.resize((size, size), Image.LANCZOS)
    return bg


def brand_font(size, bold=True):
    """Schrift des Schriftzugs „Telvo Player“: Outfit (wie in der App, www/css/style.css .wordmark) aus
    node_modules/@fontsource/outfit (nach „npm install“ vorhanden). Pillow liest WOFF meist direkt, sonst
    wird sie mit fontTools (pip install fonttools) umgewandelt. Fehlt beides: Standardschrift."""
    name = os.path.join(ROOT, 'node_modules', '@fontsource', 'outfit', 'files',
                        'outfit-latin-%d-normal.woff' % (700 if bold else 400))
    if os.path.exists(name):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            try:
                import io
                from fontTools.ttLib import TTFont
                tt = TTFont(name)
                tt.flavor = None
                buf = io.BytesIO()
                tt.save(buf)
                buf.seek(0)
                return ImageFont.truetype(buf, size)
            except Exception as e:  # noqa: BLE001
                print('Outfit nicht lesbar (%s) – Standardschrift' % e)
    else:
        print('Outfit fehlt (%s) – Standardschrift' % name)
    return font(size, bold)


def font(size, bold=True):
    names = (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'arialbd.ttf',
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf'] if bold else
             ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVuSans.ttf', 'arial.ttf',
              '/System/Library/Fonts/Supplemental/Arial.ttf'])
    for f in names:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


# App-Symbole (Android, iPhone/iPad, PC): quadratisch, das System rundet selbst ab
icon(1024).convert('RGB').save(p('assets', 'icon-only.png'))
# Android „adaptive icon“: Vordergrund (Logo im sicheren Bereich) und Hintergrund getrennt
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
m = mark(620)
fg.alpha_composite(m, (202, 202))
fg.save(p('assets', 'icon-foreground.png'))
background(1024, 1024).save(p('assets', 'icon-background.png'))

# Startbildschirm: lila Kachel mit Logo und darunter „Telvo Player“ (Outfit) auf dem Hintergrund der App.
# Dieselben Maße nutzt www/index.html (#boot) als SVG – bei Änderungen dort mitändern, sonst springt das Bild beim Übergang zur App.
sp = Image.new('RGBA', (2732, 2732), APP_BG + (255,))
halo = Image.new('L', (2732, 2732), 0)
ImageDraw.Draw(halo).ellipse([1366 - 620, 1216 - 620, 1366 + 620, 1216 + 620], fill=70)
halo = halo.filter(ImageFilter.GaussianBlur(220))
sp.paste(Image.new('RGBA', (2732, 2732), (139, 92, 246, 255)), (0, 0), halo)
sm = icon(440, rounded=True)
sp.alpha_composite(sm, ((2732 - 440) // 2, (2732 - 440) // 2 - 150))
sd = ImageDraw.Draw(sp)
f_b, f_r = brand_font(150), brand_font(150, bold=False)
w_b = sd.textlength(NAME + ' ', font=f_b)
w_r = sd.textlength('Player', font=f_r)
sx = (2732 - (w_b + w_r)) / 2
sd.text((sx, 1366 + 260), NAME + ' ', font=f_b, fill=(244, 244, 246), anchor='ls')
sd.text((sx + w_b, 1366 + 260), 'Player', font=f_r, fill=(214, 200, 255), anchor='ls')
sp.convert('RGB').save(p('assets', 'splash.png'))
sp.convert('RGB').save(p('assets', 'splash-dark.png'))

# Android-TV-/Fire-TV-Banner: gefüllte 16:9-Kachel mit Namen (wie Netflix oder YouTube im Startmenü).
# 640x360 Pixel, kommt nach res/drawable-xhdpi (= 320x180 dp, Vorgabe von Android TV; scripts/patch-android.js).
# Fläche bis an alle vier Ränder gefüllt: lila Verlauf ohne fast schwarze Ecken – der Fire-TV-Startbildschirm
# ist selbst dunkel, dunkle Ränder sahen dort aus, als reiche das Bild links und rechts nicht bis zum Kachelrand.
# Logo und Schriftzug als Gruppe waagerecht mittig, damit beim Zuschneiden (abgerundete Ecken, Zoom) nichts fehlt.
S = 4
W, H = 640, 360
# Seit 1.15.10: derselbe lila Verlauf wie die Kachel, eine Spur kräftiger, damit die weiße Schrift gut lesbar bleibt.
ban = gradient(W * S, H * S, (150, 116, 248), (96, 50, 224), vertical=False).convert('RGBA')
bm = mark(int(H * 0.46) * S)
f_name, f_sub = brand_font(92 * S), brand_font(56 * S, bold=False)
dr = ImageDraw.Draw(ban)
gap = int(W * 0.03) * S
text_w = max(dr.textlength(NAME, font=f_name), dr.textlength('Player', font=f_sub) + 4 * S)
x0 = int((W * S - (bm.width + gap + text_w)) / 2)
ban.alpha_composite(bm, (x0, (H * S - bm.height) // 2))
tx = x0 + bm.width + gap
dr.text((tx, int(H * 0.54) * S), NAME, font=f_name, fill=(255, 255, 255), anchor='ls')
dr.text((tx + 4 * S, int(H * 0.59) * S), 'Player', font=f_sub, fill=(240, 233, 255), anchor='lt')
ban.resize((W, H), Image.LANCZOS).convert('RGB').save(p('assets', 'banner.png'))

# Samsung (512x423), LG (80x80, 130x130), Webseite/App (192x192)
tz = background(512, 423).convert('RGBA')
tm = mark(320)
tz.alpha_composite(tm, (96, 52))
tz.save(p('platforms', 'tizen', 'icon.png'))
icon(80, rounded=True).save(p('platforms', 'webos', 'icon.png'))
icon(130, rounded=True).save(p('platforms', 'webos', 'largeIcon.png'))
icon(192, rounded=True).save(p('www', 'img', 'icon.png'))

print('Symbole erzeugt')
