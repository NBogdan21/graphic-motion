import { LOCKUP, LOGO, PARTS, type PartId } from '@/brand/logo';
import { rgba } from '../../color';
import { clamp, ease, progress, quad } from '../../math';
import { createRng } from '../../random';
import { resetTransform } from '../../stage/draw';
import { glowSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import { SCAN_ORDER } from '../choreography';
import { logoCenter, logoX, logoY, type IntroSceneState } from '../sceneState';
import { gaussian, type Fx } from './shared';

type Poly = Float32Array;

/** Parse "M x y L x y ... Z" (first subpath) into a flat [x0, y0, x1, y1, ...] polygon. */
function pathPolygon(path: string): Poly {
  const first = path.split('Z')[0] ?? '';
  const nums = first.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
  return Float32Array.from(nums);
}

function inPolygon(poly: Poly, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i] ?? 0;
    const yi = poly[i + 1] ?? 0;
    const xj = poly[j] ?? 0;
    const yj = poly[j + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Part windows as polygons in lockup coordinates (for assigning particles to letters). */
const WINDOWS: { id: PartId; poly: Poly }[] = PARTS.map((p) => ({
  id: p.id,
  poly: Float32Array.from(p.clip.flatMap(([x, y]) => [p.rect.x + (x / 100) * p.rect.w, p.rect.y + (y / 100) * p.rect.h])),
}));
const K_CUT = pathPolygon(PARTS.find((p) => p.id === 'k-cut')?.path ?? '');
const DOT = PARTS.find((p) => p.id === 'i-dot')?.body;

/**
 * Scene 04 — the logo assembles from light. Particle targets are sampled from
 * the real logo image at runtime, so the silhouette is the actual letterforms.
 * Particles stream in along the band, brake into place left to right, spark as
 * they lock, and dissolve as each letter scans in over them. (The K fragment
 * and the i dot are left out: they make their own entrances.)
 */
export class ParticleFx implements Fx {
  private n = 0;
  private tu = new Float32Array(0);
  private tv = new Float32Array(0);
  private off = new Float32Array(0);
  private jit = new Float32Array(0);
  private depart = new Float32Array(0);
  private arrive = new Float32Array(0);
  private fadeA = new Float32Array(0);
  private fadeB = new Float32Array(0);
  private size = new Float32Array(0);
  private seed = new Float32Array(0);
  private tone = new Uint8Array(0);
  // per-frame scratch
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private a = new Float32Array(0);
  private state = new Uint8Array(0);
  private sampledKey = '';
  private vertical = false;

  layout(frame: StageFrame, st: IntroSceneState): void {
    this.vertical = frame.composition === 'mobile';
    if (!st.image) return;
    const base = st.tl.mode === 'short' ? 0.5 : 1;
    const count = Math.round(st.particleBudget * Math.min(1.3, frame.density) * base);
    const key = `${count}:${st.tl.construct.start}:${st.tl.construct.len}`;
    if (key === this.sampledKey) return;
    this.sampledKey = key;
    this.sample(st, count);
  }

  private sample(st: IntroSceneState, count: number): void {
    const image = st.image;
    if (!image || !image.naturalWidth) return;
    const res = 380;
    const scale = res / LOCKUP.w;
    const sw = res;
    const sh = Math.round(LOGO.split * scale);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const k = image.naturalWidth / LOCKUP.w;
    ctx.drawImage(image, 0, 0, LOCKUP.w * k, LOGO.split * k, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    const candidates: number[] = [];
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const o = (y * sw + x) * 4;
        if ((data[o + 3] ?? 0) < 170) continue;
        const u = (x + 0.5) / scale;
        const v = (y + 0.5) / scale;
        if (inPolygon(K_CUT, u, v)) continue;
        if (DOT && u > DOT.x - 3 && u < DOT.x + DOT.w + 3 && v > DOT.y - 3 && v < DOT.y + DOT.h + 3) continue;
        const brand = (data[o] ?? 0) - (data[o + 1] ?? 0) > 90 ? 1 : 0;
        candidates.push(u, v, brand);
      }
    }
    const total = candidates.length / 3;
    const n = Math.min(count, total);
    const rng = createRng(0xb17);
    // partial Fisher–Yates over candidate triples
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (total - i));
      for (let c = 0; c < 3; c++) {
        const tmp = candidates[i * 3 + c] ?? 0;
        candidates[i * 3 + c] = candidates[j * 3 + c] ?? 0;
        candidates[j * 3 + c] = tmp;
      }
    }

    this.alloc(n);
    const { tl, ch } = st;
    const c = tl.construct;
    const arrivals = ch.particles;
    const travelScale = Math.max(0.45, c.len / 1.5);
    for (let i = 0; i < n; i++) {
      const u = candidates[i * 3] ?? 0;
      const v = candidates[i * 3 + 1] ?? 0;
      this.tu[i] = u + (rng() - 0.5) / scale;
      this.tv[i] = v + (rng() - 0.5) / scale;
      this.tone[i] = candidates[i * 3 + 2] ?? 0;
      this.off[i] = 0.3 + rng() * 0.85;
      this.jit[i] = gaussian(rng);
      const arrive = arrivals.start + (arrivals.end - arrivals.start) * (0.72 * (u / LOCKUP.w) + 0.28 * rng());
      this.arrive[i] = arrive;
      this.depart[i] = arrive - (0.34 + rng() * 0.3) * travelScale;
      this.size[i] = 1.1 + rng() * 1.2;
      this.seed[i] = rng();
      const part = WINDOWS.find((w) => SCAN_ORDER.includes(w.id) && inPolygon(w.poly, u, v))?.id ?? 'k';
      const scan = ch.scan[part] ?? { start: c.end, end: c.end };
      this.fadeA[i] = scan.start + (scan.end - scan.start) * 0.2;
      this.fadeB[i] = scan.end + 0.12;
    }
  }

  private alloc(n: number): void {
    this.n = n;
    const f = () => new Float32Array(n);
    this.tu = f();
    this.tv = f();
    this.off = f();
    this.jit = f();
    this.depart = f();
    this.arrive = f();
    this.fadeA = f();
    this.fadeB = f();
    this.size = f();
    this.seed = f();
    this.tone = new Uint8Array(n);
    this.x = f();
    this.y = f();
    this.px = f();
    this.py = f();
    this.a = f();
    this.state = new Uint8Array(n);
  }

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    const { t } = st;
    if (!this.n || t < (this.depart[0] ?? 0) - 1 || t > st.ch.ignite + 0.3) return;
    const { width: W, height: H, dpr, colors } = frame;
    const f = st.logo;
    const [cx, cy] = logoCenter(f);
    const lag = 0.03;
    let any = false;

    for (let i = 0; i < this.n; i++) {
      const d = this.depart[i] ?? 0;
      const ar = this.arrive[i] ?? 0;
      if (t < d) {
        this.state[i] = 0;
        continue;
      }
      const fade = 1 - progress(t, this.fadeA[i] ?? 0, this.fadeB[i] ?? 0);
      if (fade <= 0) {
        this.state[i] = 0;
        continue;
      }
      any = true;
      const tx = logoX(f, this.tu[i] ?? 0);
      const ty = logoY(f, this.tv[i] ?? 0);
      let sx: number;
      let sy: number;
      let kx: number;
      let ky: number;
      if (this.vertical) {
        sx = cx + (tx - cx) * 0.25 + (this.jit[i] ?? 0) * 8;
        sy = ty + (this.off[i] ?? 0.5) * H * 0.75;
        kx = sx;
        ky = sy + (ty - sy) * 0.7;
      } else {
        sx = tx + (this.off[i] ?? 0.5) * W;
        sy = cy + (ty - cy) * 0.1 + (this.jit[i] ?? 0) * 9;
        kx = sx + (tx - sx) * 0.72;
        ky = sy;
      }
      const span = Math.max(0.001, ar - d);
      const p = clamp((t - d) / span);
      const e = ease.outExpo(p);
      const e0 = ease.outExpo(clamp((t - lag - d) / span));
      this.x[i] = quad(sx, kx, tx, e);
      this.y[i] = quad(sy, ky, ty, e);
      this.px[i] = quad(sx, kx, tx, e0);
      this.py[i] = quad(sy, ky, ty, e0);
      const appear = progress(t, d, d + 0.1);
      const twinkle = p >= 1 ? 0.78 + 0.22 * Math.sin(t * 13 + (this.seed[i] ?? 0) * 40) : 1;
      this.a[i] = alpha * appear * fade * twinkle;
      this.state[i] = p < 1 ? 1 : 2;
    }
    if (!any) return;

    const inkC = colors.ink;
    const brandC = colors.brandHot;
    const levels = [0.3, 0.55, 0.8, 1] as const;

    // Motion trails (additive) for particles still in flight.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.2;
    for (let tone = 0; tone < 2; tone++) {
      for (let b = 0; b < levels.length; b++) {
        const lo = b === 0 ? 0 : (levels[b - 1] ?? 0);
        const hi = levels[b] ?? 1;
        ctx.beginPath();
        let has = false;
        for (let i = 0; i < this.n; i++) {
          if (this.state[i] !== 1 || this.tone[i] !== tone) continue;
          const a = this.a[i] ?? 0;
          if (a <= lo || a > hi) continue;
          ctx.moveTo(this.px[i] ?? 0, this.py[i] ?? 0);
          ctx.lineTo((this.x[i] ?? 0) + 0.01, this.y[i] ?? 0);
          has = true;
        }
        if (has) {
          ctx.strokeStyle = rgba(tone ? brandC : inkC, hi * 0.85);
          ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Settled particles: crisp squares.
    for (let tone = 0; tone < 2; tone++) {
      for (let b = 0; b < levels.length; b++) {
        const lo = b === 0 ? 0 : (levels[b - 1] ?? 0);
        const hi = levels[b] ?? 1;
        ctx.beginPath();
        let has = false;
        for (let i = 0; i < this.n; i++) {
          if (this.state[i] !== 2 || this.tone[i] !== tone) continue;
          const a = this.a[i] ?? 0;
          if (a <= lo || a > hi) continue;
          const s = this.size[i] ?? 1.5;
          ctx.rect((this.x[i] ?? 0) - s / 2, (this.y[i] ?? 0) - s / 2, s, s);
          has = true;
        }
        if (has) {
          ctx.fillStyle = rgba(tone ? colors.brand : inkC, hi);
          ctx.fill();
        }
      }
    }

    // A few sparks as particles lock into place.
    ctx.globalCompositeOperation = 'lighter';
    const sparkInk = glowSprite(inkC, 32);
    const sparkBrand = glowSprite(colors.brandHot, 32);
    for (let i = 0; i < this.n; i++) {
      if ((this.seed[i] ?? 1) > 0.07) continue;
      const since = t - (this.arrive[i] ?? 0);
      if (since < 0 || since > 0.28) continue;
      ctx.globalAlpha = (1 - since / 0.28) * (this.a[i] ?? 0) * 0.9;
      const r = 9;
      ctx.drawImage(this.tone[i] ? sparkBrand : sparkInk, (this.x[i] ?? 0) - r, (this.y[i] ?? 0) - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    resetTransform(ctx, dpr);
  }
}
