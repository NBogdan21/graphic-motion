"""Rebuild the EXA letterforms as vector geometry and bake a signed-distance atlas.

Usage: python3 tools/build_glyphs.py [--overlay logo.png]

The outlines below were measured from the supplied logo (1254 px master,
cap height 350 px, baseline y=778). They are re-drawn here as polygons so
every scene can extrude, split, light and animate the letters.

Output: public/glyphs.png  RGBA, one signed distance field per channel
    R = E    G = X stroke "/"    B = X stroke "\\"    A = A
Encoding is square-root companded so precision is highest at the outline:
    e = 2*texel - 1 ;  d = sign(e) * e^2 * RANGE   (units of cap height, <0 inside)
Atlas covers u in [-U, U], v in [-V, V]; the lockup spans u ±1.514, v ±0.5.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

CAP = 350.0
CX, CY = 630.0, 603.0      # lockup centre in logo pixels
PPU = 900                   # atlas pixels per cap-height unit
U, V = 1.92, 0.8533
RANGE = 0.12
W, H = int(2 * U * PPU), int(round(2 * V * PPU))


def lerp_line(x0, y0, slope):
    """x as a function of y for a straight edge through (x0, y0)."""
    return lambda y: x0 + slope * (y - y0)


# ---------------------------------------------------------------- E
E = [
    (100, 428), (340, 428), (357, 427.6), (348, 431.8), (214, 431.8),
    (214, 598.2), (358, 598.2), (374, 600.0), (358, 601.8), (214, 601.8),
    (214, 774.2), (348, 774.2), (357, 778.4), (100, 778),
    (113, 774), (126, 768), (132, 762), (137, 756), (140, 750), (142, 744), (143, 737),
    (143, 475), (142, 468), (141, 462), (140, 456), (137, 450), (132, 444),
    (125, 438), (110, 432),
]

# ---------------------------------------------------------------- X  "/"
cxa = lerp_line(754, 438, -0.97)
La, Ra = (lambda y: cxa(y) - 43.5), (lambda y: cxa(y) + 43.5)
XA = [
    (La(440), 440), (714, 433), (726, 429), (824, 427.4), (Ra(436), 436),
    (Ra(766), 766), (Ra(766) - 6, 773), (Ra(766) - 18, 777.6), (La(778) - 17, 778.6),
    (La(770), 770),
]

# ---------------------------------------------------------------- X  "\"
cxb = lerp_line(731.5, 750, 0.925)
Lb, Rb = (lambda y: cxb(y) - 44), (lambda y: cxb(y) + 44)
XB = [
    (Lb(428) - 29, 427.6), (Rb(428) + 1, 428), (Rb(436), 436),
    (Rb(756), 756), (Rb(756) + 7, 766), (Rb(756) + 19, 773.5), (Rb(778) + 29, 778.4),
    (Lb(778) - 1.5, 778), (Lb(770), 770),
    (Lb(450), 450), (Lb(450) - 7.3, 440), (Lb(450) - 19.3, 432.5),
]

# ---------------------------------------------------------------- A
hl = lerp_line(917, 432, -0.578)        # hairline leg, left edge
inner = lerp_line(879, 510, 0.553)     # thick leg, inner edge
outer = lerp_line(922, 432, 0.5625)    # thick leg, outer edge
A_THICK = [
    (920, 426.2), (outer(756), 756), (outer(756) + 8, 764), (outer(756) + 19, 770.5),
    (outer(756) + 33, 775.5), (1160, 778.6), (1027, 778), (inner(503.7), 503.7),
]
A_HAIR = [(hl(440), 440), (hl(440) + 5.2, 440), (hl(718) + 5.2, 718), (hl(718), 718)]
A_BAR = [(hl(664.6) + 2, 664.6), (inner(668) + 4, 664.6), (inner(668) + 4, 668.0), (hl(668) + 2, 668.0)]

GLYPHS = {"E": [E], "XA": [XA], "XB": [XB], "A": [A_THICK, A_HAIR, A_BAR]}


def to_units(poly):
    return [((x - CX) / CAP, (CY - y) / CAP) for x, y in poly]


def sdf(polys, ss=2):
    w, h = W * ss, H * ss
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for poly in polys:
        pts = [((u + U) * PPU * ss, (V - v) * PPU * ss) for u, v in to_units(poly)]
        d.polygon(pts, fill=255)
    m = np.asarray(img) > 127
    dist = (distance_transform_edt(~m) - distance_transform_edt(m)) / (PPU * ss)
    dist = dist.reshape(H, ss, W, ss).mean(axis=(1, 3))
    x = np.clip(dist / RANGE, -1, 1)
    return 0.5 + 0.5 * np.sign(x) * np.sqrt(np.abs(x))


if __name__ == "__main__":
    chans = [sdf(GLYPHS[k]) for k in ("E", "XA", "XB", "A")]
    rgba = (np.stack(chans, -1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save("public/glyphs.png", optimize=True)
    meta = {"U": U, "V": V, "RANGE": RANGE, "W": W, "H": H,
            "polygons": {k: [to_units(p) for p in v] for k, v in GLYPHS.items()}}
    with open("src/data/glyphs.json", "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    print("atlas", W, H)
    if "--overlay" in sys.argv:
        logo = Image.open(sys.argv[sys.argv.index("--overlay") + 1]).convert("RGB")
        ov = logo.copy()
        dr = ImageDraw.Draw(ov)
        for polys in GLYPHS.values():
            for p in polys:
                dr.polygon(p, outline=(0, 160, 255))
        ov.crop((80, 400, 1180, 800)).save(sys.argv[-1])
