"""Build the game's copy of the GoofusHand font.

Source: fonts-src/GoofusHand.ttf (made with draw-your-font). Output:
app/fonts/goofus-hand.woff2, loaded by app/layout.tsx.

The source font has letters, digits and basic punctuation only. This script:
  * draws the symbols the game shows (· … • ∞ ✓ × ✕ → ← ↑ ↓ − – — and a
    no-break space) out of the font's own strokes, so they match the hand style;
  * adds fixed-width digits behind the `tnum` feature, so timers and counters
    can use `font-variant-numeric: tabular-nums` and stop jittering;
  * sets one set of vertical metrics for every platform (ascent 860, descent
    220, no line gap), which keeps capitals centered in buttons on Windows,
    macOS and Linux alike.

Run with: pip install fonttools brotli && python3 scripts/build-font.py
"""
import math
import pathlib

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "fonts-src" / "GoofusHand.ttf"
OUTPUT = ROOT / "app" / "fonts" / "goofus-hand.woff2"

ASCENT, DESCENT = 860, 220
SIDE = 50  # the source font uses 50-unit side bearings on every glyph
TNUM_WIDTH = 480

font = TTFont(SOURCE)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
glyf, hmtx = font["glyf"], font["hmtx"]


def name(char):
    return cmap[ord(char)]


def mul(m1, m2):
    """Affine matrix product m1 * m2 for (a, b, c, d, e, f) tuples."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1)


def scale(sx, sy=None):
    return (sx, 0, 0, sx if sy is None else sy, 0, 0)


def move(dx, dy):
    return (1, 0, 0, 1, dx, dy)


def rotate(degrees):
    r = math.radians(degrees)
    return (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)


def about(matrix, cx, cy):
    """Apply matrix around the point (cx, cy)."""
    return mul(move(cx, cy), mul(matrix, move(-cx, -cy)))


def bounds(parts):
    pen = BoundsPen(glyphs)
    for source, matrix in parts:
        glyphs[source].draw(TransformPen(pen, matrix))
    return pen.bounds


def add_glyph(glyph_name, parts, codepoints=(), advance=None, keep_x=False):
    """Draw the parts into one outline glyph with 50-unit side bearings."""
    x_min, _, x_max, _ = bounds(parts)
    shift = 0 if keep_x else SIDE - x_min
    pen = TTGlyphPen(glyphs)
    for source, matrix in parts:
        glyphs[source].draw(TransformPen(pen, mul(move(shift, 0), matrix)))
    glyph = pen.glyph()
    glyph.recalcBounds(glyf)
    glyf[glyph_name] = glyph
    width = advance if advance is not None else round(x_max - x_min + 2 * SIDE)
    hmtx[glyph_name] = (width, getattr(glyph, "xMin", 0))
    for codepoint in codepoints:
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[codepoint] = glyph_name


def add_space(glyph_name, codepoint, width):
    glyph = TTGlyphPen(glyphs).glyph()
    glyf[glyph_name] = glyph
    hmtx[glyph_name] = (width, 0)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[codepoint] = glyph_name


period, hyphen, plus, greater, letter_o = (name(c) for c in ".-+>o")
I = scale(1)

# Middle dot and ellipsis from the period.
add_glyph("uni00B7", [(period, move(0, 245))], [0x00B7], advance=hmtx[period][0], keep_x=True)
add_glyph("uni2026", [(period, move(dx, 0)) for dx in (0, 150, 300)], [0x2026])
# Bullet: a bigger dot centered on the lowercase height.
add_glyph("uni2022", [(period, mul(move(0, 245), about(scale(1.5), 106, 55)))], [0x2022])
# Infinity: two flattened o loops side by side.
loop = about(scale(0.72, 0.6), 207, 240)
add_glyph("uni221E", [(letter_o, mul(move(0, 60), loop)), (letter_o, mul(move(214, 60), loop))], [0x221E])
# Check mark: a short backslash for the left arm meeting a long slash.
slash, backslash = name("/"), name("\\")
add_glyph("uni2713", [(backslash, mul(move(72 - 0.55 * 364, 0.34 * 99), scale(0.55, 0.34))), (slash, mul(move(0, 0.82 * 99), scale(1.0, 0.82)))], [0x2713])
# Multiplication signs: the plus turned 45 degrees.
add_glyph("uni00D7", [(plus, mul(move(0, -20), about(mul(rotate(45), scale(0.78)), 254, 331)))], [0x00D7])
add_glyph("uni2715", [(plus, about(mul(rotate(45), scale(0.95)), 254, 331))], [0x2715])
# Arrows: a stretched hyphen shaft with a smaller > for the head.
right_parts = [(hyphen, mul(move(-2, 0), scale(1.22, 1))), (greater, mul(move(620 - 0.7 * 504, 300 - 0.7 * 331), scale(0.7)))]
add_glyph("uni2192", right_parts, [0x2192])
x0, y0, x1, y1 = bounds(right_parts)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
add_glyph("uni2190", [(src, mul(about(scale(-1, 1), cx, cy), m)) for src, m in right_parts], [0x2190])
for glyph_name, codepoint, angle in (("uni2191", 0x2191, 90), ("uni2193", 0x2193, -90)):
    turned = [(src, mul(about(rotate(angle), cx, cy), m)) for src, m in right_parts]
    _, ty0, _, ty1 = bounds(turned)
    lift = (700 - (ty1 - ty0)) / 2 - ty0  # stand the arrow on the baseline, cap height tall
    add_glyph(glyph_name, [(src, mul(move(0, lift), m)) for src, m in turned], [codepoint])
# Minus and dashes from the hyphen.
add_glyph("uni2212", [(hyphen, I)], [0x2212], advance=hmtx[hyphen][0], keep_x=True)
add_glyph("uni2013", [(hyphen, scale(1.1, 1))], [0x2013])
add_glyph("uni2014", [(hyphen, scale(1.8, 1))], [0x2014])
add_space("uni00A0", 0x00A0, hmtx["space"][0])

# Fixed-width digits for timers, reachable through the tnum feature.
digits = [name(str(d)) for d in range(10)]
for digit in digits:
    x_min, _, x_max, _ = bounds([(digit, I)])
    offset = (TNUM_WIDTH - (x_max - x_min)) / 2 - x_min
    add_glyph(f"{digit}.tnum", [(digit, move(offset, 0))], advance=TNUM_WIDTH, keep_x=True)
# glyf appends new names to its own glyph order; make the font agree with it.
font.setGlyphOrder(list(dict.fromkeys(glyf.glyphOrder)))
glyf.glyphOrder = font.getGlyphOrder()
if "GSUB" in font:
    del font["GSUB"]  # the source only had an empty liga lookup
addOpenTypeFeaturesFromString(font, f"""
languagesystem DFLT dflt;
languagesystem latn dflt;
feature tnum {{ sub [{' '.join(digits)}] by [{' '.join(d + '.tnum' for d in digits)}]; }} tnum;
""")

# One set of vertical metrics everywhere.
y_min = min(getattr(glyf[g], "yMin", 0) for g in font.getGlyphOrder())
y_max = max(getattr(glyf[g], "yMax", 0) for g in font.getGlyphOrder())
font["hhea"].ascent, font["hhea"].descent, font["hhea"].lineGap = ASCENT, -DESCENT, 0
os2 = font["OS/2"]
os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ASCENT, -DESCENT, 0
os2.usWinAscent, os2.usWinDescent = max(ASCENT, y_max), max(DESCENT, -y_min)
os2.fsSelection |= 1 << 7  # USE_TYPO_METRICS

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
font.flavor = "woff2"
font.save(OUTPUT)
print(f"wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size} bytes, {len(font.getGlyphOrder())} glyphs)")
