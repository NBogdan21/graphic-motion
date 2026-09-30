#!/usr/bin/env python3
"""
KickMath brand asset pipeline.

Reads the untouched master logo (brand-source/kickmath-logo-original.webp) and
derives every raster the motion system needs. Nothing is redrawn for display:
display assets are exact pixel crops of the master (re-encoded losslessly) or
high-quality downscaled renditions of those crops.

The only pixel-level change is clearing isolated alpha = 1/255 specks around
the artwork. Composited on the site background that changes no pixel by more
than one 8-bit level (checked below), and it gives the logo a tight bounding box.

Letter "parts" for the construction animation are not separate images: each
part is a clip-path window onto the same lockup image, so the intro costs no
extra bytes and every part is, by construction, the original pixels.

Outputs
  public/brand/kickmath-lockup{,-1024,-640}.webp   full logo (wordmark + tagline)
  public/brand/kickmath-wordmark-720.webp          wordmark only, for small sizes (header)
  public/brand/kickmath-glow.webp                  soft bloom derived from the logo (effect layer)
  src/brand/logo-geometry.json                     rects, part clip polygons, contours, glyph bounds
  src/app/icon.png, src/app/apple-icon.png, src/app/opengraph-image.png

Usage
  pip install pillow numpy opencv-python-headless scikit-image
  python3 scripts/build_brand_assets.py      (or: npm run brand:assets)
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from skimage.measure import find_contours

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand-source" / "kickmath-logo-original.webp"
OUT_PUBLIC = ROOT / "public" / "brand"
OUT_GEOMETRY = ROOT / "src" / "brand" / "logo-geometry.json"
OUT_APP = ROOT / "src" / "app"

PAD = 4                 # transparent padding kept around the trimmed lockup (px)
SOLID_ALPHA = 128       # alpha threshold that defines a letter body
NOISE_ALPHA = 2         # alpha below this is cleared (invisible specks)
CONTOUR_EPSILON = 0.75  # simplification tolerance for letter contours (px)
CLIP_EPSILON = 0.35     # simplification tolerance for part clip windows (px)
RENDITIONS = (1024, 640)
BACKGROUND = (7, 8, 10)

# Wordmark parts in reading order. Components are matched by position, so a
# changed master fails loudly instead of silently producing wrong geometry.
PART_IDS = ["k-cut", "k", "i-dot", "i", "c", "k2", "m", "a", "t", "h"]


def save_lossless(img: Image.Image, path: Path) -> None:
    img.save(path, "WEBP", lossless=True, quality=100, method=6)


def bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def composite(rgba: np.ndarray, bg=BACKGROUND) -> np.ndarray:
    a = rgba[..., 3:4].astype(np.float64) / 255.0
    return rgba[..., :3].astype(np.float64) * a + np.array(bg, np.float64) * (1 - a)


def resize_premultiplied(rgba: np.ndarray, width: int) -> np.ndarray:
    """Area-averaged downscale on premultiplied colour (no dark fringes)."""
    h, w = rgba.shape[:2]
    height = round(h * width / w)
    f = rgba.astype(np.float32) / 255.0
    pm = np.concatenate([f[..., :3] * f[..., 3:4], f[..., 3:4]], axis=-1)
    small = cv2.resize(pm, (width, height), interpolation=cv2.INTER_AREA)
    a = small[..., 3:4]
    rgb = np.where(a > 1e-5, small[..., :3] / np.maximum(a, 1e-5), 0)
    return np.clip(np.concatenate([rgb, a], axis=-1) * 255 + 0.5, 0, 255).astype(np.uint8)


def premultiplied_blur(img: np.ndarray, radius: float) -> np.ndarray:
    f = img.astype(np.float32) / 255.0
    pm = np.concatenate([f[..., :3] * f[..., 3:4], f[..., 3:4]], axis=-1)
    k = int(radius * 3) | 1
    b = cv2.GaussianBlur(pm, (k, k), radius)
    a = b[..., 3:4]
    rgb = np.where(a > 1e-4, b[..., :3] / np.maximum(a, 1e-4), 0)
    return np.clip(np.concatenate([rgb, a], axis=-1) * 255 + 0.5, 0, 255).astype(np.uint8)


def fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def contour_path(mask: np.ndarray, ox: int, oy: int) -> tuple[str, float]:
    """SVG path (lockup coordinates) + perimeter for the outline of a binary mask."""
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    subpaths, length = [], 0.0
    for c in contours:
        if cv2.contourArea(c) < 4:
            continue
        poly = cv2.approxPolyDP(c, CONTOUR_EPSILON, True).reshape(-1, 2)
        if len(poly) < 3:
            continue
        length += float(cv2.arcLength(poly.reshape(-1, 1, 2), True))
        subpaths.append("M" + "L".join(f"{x + ox} {y + oy}" for x, y in poly) + "Z")
    return "".join(subpaths), round(length, 1)


def clip_polygon(region: np.ndarray, w: int, h: int) -> list[list[float]]:
    """Outline of a part's ownership region as % of its rect (for CSS clip-path).

    Marching squares on the zero-padded mask puts the outline exactly on pixel
    edges, so neighbouring windows share their borders instead of leaving gaps.
    """
    padded = np.pad(region.astype(np.float64), 1)
    outline = max(find_contours(padded, 0.5), key=len)
    xy = np.stack([outline[:, 1] - 0.5, outline[:, 0] - 0.5], axis=1).astype(np.float32)
    poly = cv2.approxPolyDP(xy.reshape(-1, 1, 2), CLIP_EPSILON, True).reshape(-1, 2)
    xs = np.clip(poly[:, 0], 0, w)
    ys = np.clip(poly[:, 1], 0, h)
    return [[round(float(x) / w * 100, 3), round(float(y) / h * 100, 3)] for x, y in zip(xs, ys)]


def slash_edge(mask: np.ndarray) -> list[list[float]]:
    """The K's diagonal cut: longest diagonal edge of the fragment's outline."""
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    poly = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 2.0, True).reshape(-1, 2)
    best, best_len = None, 0.0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = float(b[0] - a[0]), float(b[1] - a[1])
        angle = abs(np.degrees(np.arctan2(dy, dx))) % 180
        length = float(np.hypot(dx, dy))
        if 25 < angle < 155 and abs(angle - 90) > 25 and length > best_len:
            best, best_len = (a, b), length
    assert best is not None, "no diagonal cut found on the K fragment"
    a, b = sorted(best, key=lambda q: q[0])  # left to right
    return [[float(a[0]), float(a[1])], [float(b[0]), float(b[1])]]


def rasterize_clip(poly_pct: list[list[float]], w: int, h: int, ss: int = 8) -> np.ndarray:
    """Coverage (0..1 per source pixel) of a clip polygon, supersampled ss x ss."""
    # OpenCV samples pixel k at its centre k; edge coordinate e maps to e*ss - 0.5.
    # Vertices are fixed-point with 4 fractional bits for sub-sample precision.
    pts = np.array([[(x / 100 * w * ss - 0.5) * 16, (y / 100 * h * ss - 0.5) * 16]
                    for x, y in poly_pct]).round().astype(np.int32)
    m = np.zeros((h * ss, w * ss), np.uint8)
    cv2.fillPoly(m, [pts], 255, lineType=cv2.LINE_8, shift=4)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA).astype(np.float64) / 255.0


def main() -> None:
    OUT_PUBLIC.mkdir(parents=True, exist_ok=True)
    OUT_GEOMETRY.parent.mkdir(parents=True, exist_ok=True)
    for stale in OUT_PUBLIC.glob("*.webp"):
        stale.unlink()

    master = Image.open(SOURCE)
    original = np.array(master.convert("RGBA"))  # embedded ICC profile is plain sRGB
    src = original.copy()
    src[..., 3][src[..., 3] < NOISE_ALPHA] = 0
    drift = np.abs(composite(src) - composite(original)).max()
    assert drift <= 1.0, f"noise cleanup changed the logo by {drift:.2f} levels"
    H0, W0 = src.shape[:2]

    # ---- lockup: trimmed master ----------------------------------------------
    x0, y0, x1, y1 = bbox(src[..., 3] > 0)
    x0, y0, x1, y1 = max(0, x0 - PAD), max(0, y0 - PAD), min(W0, x1 + PAD), min(H0, y1 + PAD)
    lock = src[y0:y1, x0:x1].copy()
    la = lock[..., 3]
    LH, LW = la.shape
    save_lossless(Image.fromarray(lock), OUT_PUBLIC / "kickmath-lockup.webp")
    for width in RENDITIONS:
        save_lossless(Image.fromarray(resize_premultiplied(lock, width)),
                      OUT_PUBLIC / f"kickmath-lockup-{width}.webp")

    # ---- split wordmark / tagline at the emptiest row of the gap between them --
    rows = np.where((la >= SOLID_ALPHA).sum(axis=1) > 0)[0]
    gap = np.where(np.diff(rows) > 1)[0][-1]
    gap_top, gap_bottom = int(rows[gap]) + 1, int(rows[gap + 1])
    split = gap_top + int(np.argmin(la[gap_top:gap_bottom].astype(np.int64).sum(axis=1)))

    def band_rect(y_from: int, y_to: int) -> dict:
        bx0, by0, bx1, by1 = bbox(la[y_from:y_to] > 0)
        return {"x": bx0, "y": y_from + by0, "w": bx1 - bx0, "h": by1 - by0}

    wordmark = band_rect(0, split)
    tagline = band_rect(split, LH)

    wm_img = lock[:split].copy()
    wx0, wy0, wx1, wy1 = bbox(wm_img[..., 3] > 0)
    wm_img = wm_img[max(0, wy0 - 2):wy1 + 2, max(0, wx0 - 2):wx1 + 2]
    save_lossless(Image.fromarray(resize_premultiplied(wm_img, 720)),
                  OUT_PUBLIC / "kickmath-wordmark-720.webp")

    # ---- wordmark parts --------------------------------------------------------
    wm_alpha = la.copy()
    wm_alpha[split:] = 0
    solid = (wm_alpha >= SOLID_ALPHA).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    comps = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 200]
    comps.sort(key=lambda i: (stats[i, cv2.CC_STAT_LEFT] // 12, stats[i, cv2.CC_STAT_TOP]))
    assert len(comps) == len(PART_IDS), f"expected {len(PART_IDS)} parts, found {len(comps)}"

    # Every pixel belongs to its nearest letter body (a Voronoi partition), so
    # halo pixels travel with their letter and the parts tile the wordmark.
    dist = np.stack([cv2.distanceTransform((labels != i).astype(np.uint8), cv2.DIST_L2, 5)
                     for i in comps])
    owner = np.argmin(dist, axis=0)
    owner[split:] = -1

    parts, coverage = [], np.zeros(la.shape, np.float64)
    for idx, (pid, comp) in enumerate(zip(PART_IDS, comps)):
        visible = (owner == idx) & (wm_alpha > 0)
        px0, py0, px1, py1 = bbox(visible)
        px0, py0, px1, py1 = max(0, px0 - 1), max(0, py0 - 1), min(LW, px1 + 1), min(split, py1 + 1)
        pw, ph = px1 - px0, py1 - py0
        clip = clip_polygon(owner[py0:py1, px0:px1] == idx, pw, ph)
        coverage[py0:py1, px0:px1] += rasterize_clip(clip, pw, ph)
        path, length = contour_path(labels[py0:py1, px0:px1] == comp, px0, py0)
        mean = lock[labels == comp][:, :3].mean(axis=0)
        extra = {"slash": slash_edge(labels == comp)} if pid == "k-cut" else {}
        parts.append({
            **extra,
            "id": pid,
            "tone": "brand" if mean[0] - mean[1] > 80 else "ink",
            "rect": {"x": px0, "y": py0, "w": pw, "h": ph},
            "body": {"x": int(stats[comp, 0]), "y": int(stats[comp, 1]),
                     "w": int(stats[comp, 2]), "h": int(stats[comp, 3])},
            "clip": clip,
            "path": path,
            "length": length,
        })

    # The clip windows must tile the wordmark: letter bodies exactly, and the
    # faint halo between letters to within a few 8-bit levels (window borders
    # run through that halo, so simplification can overlap them by a sub-pixel).
    # Parts are only shown while the logo assembles; the settled logo is the
    # unsplit image.
    body_err = np.abs(coverage - 1)[wm_alpha >= SOLID_ALPHA].max()
    assert body_err < 0.02, f"part windows do not tile the letter bodies ({body_err:.3f})"
    seam_drift = (np.abs(coverage - 1) * wm_alpha)[wm_alpha > 0].max()
    assert seam_drift < 16, f"part windows leave visible halo seams ({seam_drift:.1f} levels)"

    # ---- tagline glyph boxes (for the stepped decode) -------------------------
    tg_solid = (la >= SOLID_ALPHA).astype(np.uint8)
    tg_solid[:split] = 0
    n2, _, st2, _ = cv2.connectedComponentsWithStats(tg_solid, connectivity=8)
    boxes = sorted([tuple(int(v) for v in st2[i, :4]) for i in range(1, n2) if st2[i, 4] >= 20])
    text = "BUILT ON ANALYSIS, DRIVEN BY DISCIPLINE."
    glyph_chars = [c for c in text if c != " "]
    assert len(boxes) == len(glyph_chars), "tagline glyph count mismatch"
    glyphs = [{"char": ch, "x": x, "y": y, "w": w, "h": h} for ch, (x, y, w, h) in zip(glyph_chars, boxes)]

    # ---- glow: blurred copy of the logo, used only as a bloom effect ----------
    # From the wordmark only: the tagline is revealed later and keeps its own halo.
    grow = round(LW * 0.07)
    wordmark_only = lock.copy()
    wordmark_only[split:] = 0
    padded = cv2.copyMakeBorder(wordmark_only, grow, grow, grow, grow, cv2.BORDER_CONSTANT, value=0)
    small = resize_premultiplied(padded, round(padded.shape[1] * 0.5))
    glow = premultiplied_blur(small, radius=13)
    glow[..., 3] = np.clip(glow[..., 3].astype(np.float32) * 1.7, 0, 255).astype(np.uint8)
    Image.fromarray(glow).save(OUT_PUBLIC / "kickmath-glow.webp", "WEBP", quality=80, method=6)

    geometry = {
        "source": {"file": SOURCE.name, "width": W0, "height": H0, "crop": {"x": x0, "y": y0}},
        "lockup": {
            "w": LW, "h": LH,
            "src": "/brand/kickmath-lockup.webp",
            "renditions": [{"w": w, "src": f"/brand/kickmath-lockup-{w}.webp"} for w in RENDITIONS],
        },
        "split": split,
        "wordmark": {**wordmark, "src": "/brand/kickmath-wordmark-720.webp",
                     "crop": {"x": max(0, wx0 - 2), "y": max(0, wy0 - 2),
                              "w": wm_img.shape[1], "h": wm_img.shape[0]}},
        "tagline": {**tagline, "text": text, "glyphs": glyphs},
        "glow": {"x": -grow, "y": -grow, "w": LW + 2 * grow, "h": LH + 2 * grow,
                 "src": "/brand/kickmath-glow.webp"},
        "colors": {"brand": "#FC4D00", "ink": "#FDFDFD"},
        "parts": parts,
    }
    OUT_GEOMETRY.write_text(json.dumps(geometry, separators=(",", ":")) + "\n")

    # ---- app icons + social card: exact logo pixels on the brand background ---
    k_mask = np.isin(owner, [PART_IDS.index("k-cut"), PART_IDS.index("k")]) & (la > 0)
    kx0, ky0, kx1, ky1 = bbox(k_mask)
    k_rgba = lock.copy()
    k_rgba[..., 3][~k_mask] = 0
    k_rgba = k_rgba[ky0:ky1, kx0:kx1]

    def icon(size: int, path: Path) -> None:
        canvas = Image.new("RGBA", (size, size), BACKGROUND + (255,))
        glyph = Image.fromarray(resize_premultiplied(k_rgba, round(size * 0.6)))
        if glyph.height > size * 0.68:
            glyph = Image.fromarray(resize_premultiplied(k_rgba, round(size * 0.6 * size * 0.68 / glyph.height)))
        canvas.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
        canvas.convert("RGB").save(path, "PNG", optimize=True)

    icon(64, OUT_APP / "icon.png")
    icon(180, OUT_APP / "apple-icon.png")

    og_w, og_h = 1200, 630
    yy, xx = np.mgrid[0:og_h, 0:og_w].astype(np.float32)
    field = np.exp(-(((xx - og_w / 2) / (og_w * 0.5)) ** 2 + ((yy - og_h * 0.52) / (og_h * 0.55)) ** 2))
    base = np.array(BACKGROUND, np.float32) + field[..., None] * np.array([11, 8, 7], np.float32)
    og = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
    logo = Image.fromarray(resize_premultiplied(lock, round(og_w * 0.68)))
    og.alpha_composite(logo, ((og_w - logo.width) // 2, (og_h - logo.height) // 2))
    og.convert("RGB").save(OUT_APP / "opengraph-image.png", "PNG", optimize=True)

    print(f"lockup {LW}x{LH}  split y={split}  noise drift={drift:.2f}  part seam drift={seam_drift:.2f} levels")
    for p in parts:
        print(f"  {p['id']:6s} {p['tone']:5s} rect={p['rect']}  clip pts={len(p['clip'])}  outline={p['length']}")
    for f in sorted(OUT_PUBLIC.glob("*.webp")):
        print(f"  {f.name:30s} {f.stat().st_size / 1024:7.1f} KB")
    print(f"  logo-geometry.json {OUT_GEOMETRY.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
