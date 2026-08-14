"""
Render the X REP mark to the raster assets Expo needs.

    cd app && python3 assets/logo/render-icons.py     # needs Pillow

The PNGs in `assets/` are build output, not artwork: this script is the source
of truth for them, and the source of truth for THIS is section 35 of
`agent/design system/xrepdesignsystem.html`. If the mark changes there, change
the constants below and re-run — do not touch the PNGs by hand.

The same geometry is drawn a second time, in SVG, by `src/design/Logo.tsx`.
Two ports of one drawing is the cost of the mark living in an HTML design file
and shipping to both a React Native tree and a native launcher icon; if they
ever disagree, the design file wins.

Geometry is the 100-unit box from section 35.1, unit for unit. Everything is
drawn 4x and downsampled, because an 11-unit stroke at 48px is 5.3px and
aliasing shows.
"""

from PIL import Image, ImageDraw

ACCENT = (198, 242, 78, 255)   # #C6F24E
ACCENT_INK = (10, 11, 13, 255)  # #0A0B0D
INK = (242, 244, 246, 255)      # #F2F4F6
WHITE = (255, 255, 255, 255)

SS = 4  # supersample

BAR = (4, 16, 92, 8, 3)          # x, y, w, h, rx
COLLARS = [(4, 13, 7, 14), (89, 13, 7, 14)]
INNER = [(16, 7, 10, 26), (74, 7, 10, 26)]
HEAD = (50, 35, 9)               # cx, cy, r
TORSO = ((50, 43), (50, 64))
ARMS = ((33, 22), (34, 56), (66, 56), (67, 22))
LEGS = ((28, 93), (28, 60), (72, 60), (72, 93))
STROKE = 11


def stroke(d, pts, w, fill):
    """
    A stroked path as a filled outline: offset the curve by +/- w/2 along its
    normal and fill the ring. PIL's own thick lines comb badly on a curve —
    each segment is its own quad and the joint pieslices do not close the gaps.
    Butt caps fall out of this for free, which is what the mark specifies.
    """
    half = w / 2.0
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        ax, ay = pts[max(i - 1, 0)]
        bx, by = pts[min(i + 1, n - 1)]
        tx, ty = bx - ax, by - ay
        m = (tx * tx + ty * ty) ** 0.5 or 1.0
        nx, ny = -ty / m, tx / m
        left.append((x + nx * half, y + ny * half))
        right.append((x - nx * half, y - ny * half))
    d.polygon(left + right[::-1], fill=fill)


def bezier(p0, p1, p2, p3, steps=240):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        m = 1 - t
        x = m**3 * p0[0] + 3 * m*m*t * p1[0] + 3 * m*t*t * p2[0] + t**3 * p3[0]
        y = m**3 * p0[1] + 3 * m*m*t * p1[1] + 3 * m*t*t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def draw_mark(img, box, fig, acc, simple=False):
    """Draw the mark into `box` = (left, top, size) of an already-scaled image."""
    left, top, size = box
    u = size / 100.0

    def P(x, y):
        return (left + x * u, top + y * u)

    d = ImageDraw.Draw(img)
    w = STROKE * u

    # bar
    x, y, bw, bh, rx = BAR
    d.rounded_rectangle([P(x, y), P(x + bw, y + bh)], radius=rx * u, fill=acc)

    plates = INNER if simple else COLLARS + INNER
    for x, y, pw, ph in plates:
        d.rectangle([P(x, y), P(x + pw, y + ph)], fill=fig)

    # legs — dropped from the cut-down favicon mark
    if not simple:
        stroke(d, [P(*p) for p in bezier(*LEGS)], w, fig)

    # head
    cx, cy, r = HEAD
    d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=fig)

    # torso — vertical, so a rect is the stroke. Dropped from the favicon mark.
    if not simple:
        (tx, ty0), (_, ty1) = TORSO
        d.rectangle([P(tx - STROKE / 2, ty0), P(tx + STROKE / 2, ty1)], fill=fig)

    # arms
    stroke(d, [P(*p) for p in bezier(*ARMS)], w, fig)


def render(path, size, *, field=None, corner=0, mark=0.72, fig=ACCENT_INK,
           acc=ACCENT_INK, simple=False):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    if field is not None:
        d = ImageDraw.Draw(img)
        if corner:
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner * SS, fill=field)
        else:
            d.rectangle([0, 0, s, s], fill=field)
    if mark > 0:
        m = round(s * mark)
        draw_mark(img, ((s - m) / 2, (s - m) / 2, m), fig, acc, simple)
    img.resize((size, size), Image.LANCZOS).save(path)
    print(f"  {path}  {size}x{size}")


A = "assets/"

# The app icon (iOS + the generic one). Lime as a FIELD, mark knocked out.
# Full bleed and square: iOS applies its own mask.
render(A + "icon.png", 1024, field=ACCENT, mark=0.72)

# Android adaptive icon. The visible mask is 72/108 of the canvas, so the mark
# sits at 0.72 of that — 0.48 — which also keeps it inside the 66/108 safe zone.
render(A + "android-icon-background.png", 512, field=ACCENT, mark=0.0)
render(A + "android-icon-foreground.png", 512, mark=0.48)

# Themed icons read the alpha channel only; the colour is the system's.
render(A + "android-icon-monochrome.png", 432, mark=0.48, fig=WHITE, acc=WHITE)

# The favicon ships at 48, where the full mark still resolves — checked at 48,
# 32 and 16. Section 35.3's cut-down favicon is a 16px problem, and it is not
# solvable by dropping elements from THIS geometry: with the torso and legs
# gone, the head sits inside the bell of the arm arc and the two merge into one
# blob. A real 16px favicon needs its own drawing in the design file.
render(A + "favicon.png", 48, field=ACCENT, corner=round(48 * 30 / 128), mark=0.72)

# The native splash sits on the canvas, not on a lime field, so this one is the
# on-canvas colourway: ink figure, lime bar.
render(A + "splash-icon.png", 1024, mark=0.62, fig=INK, acc=ACCENT)
