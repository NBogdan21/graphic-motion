import { rgba } from '../color';
import { createItem, drawItem, type DataItem, type DataKind, type ItemStyle } from '../data/items';
import { clamp, ease, progress, quad, wrap } from '../math';
import { createRng, hash } from '../random';
import { drawScanLine, resetTransform, setFont } from '../stage/draw';
import { glowSprite } from '../stage/sprites';
import type { StageFrame, StageLayer } from '../stage/stage';

/**
 * Post-intro ambient layers. They reuse the intro's visual vocabulary at a much
 * lower volume so the hero stays alive without competing with the content.
 * All are time-driven and seeded: in reduced-motion mode the stage renders a
 * single settled frame of them.
 */

export interface ClearZone {
  /** Centre, as a fraction of the viewport. */
  x: number;
  y: number;
  /** Radii, as a fraction of the viewport. */
  rx: number;
  ry: number;
}

/* ------------------------------------------------------------------------- */
/* Atmosphere: dust, a match-minute ruler, an occasional scan                  */
/* ------------------------------------------------------------------------- */

export class AmbientAtmosphereLayer implements StageLayer {
  readonly order = 10;
  readonly ambient = true;
  private n = 0;
  private dx = new Float32Array(0);
  private dy = new Float32Array(0);
  private dz = new Float32Array(0);
  private ds = new Float32Array(0);

  constructor(private readonly intensity = 1) {}

  resize(frame: StageFrame): void {
    const rng = createRng(0xa7b1);
    const base = frame.composition === 'desktop' ? 70 : frame.composition === 'tablet' ? 50 : 26;
    this.n = Math.round(base * Math.min(1.2, frame.density) * this.intensity);
    this.dx = Float32Array.from({ length: this.n }, () => rng() * frame.width);
    this.dy = Float32Array.from({ length: this.n }, () => rng() * frame.height);
    this.dz = Float32Array.from({ length: this.n }, () => 0.25 + rng() * 0.75);
    this.ds = Float32Array.from({ length: this.n }, () => rng());
  }

  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void {
    const { width: W, height: H, time: t, colors, dpr } = frame;
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;
    const a = alpha * this.intensity;

    ctx.fillStyle = rgba(colors.ink, 1);
    for (let i = 0; i < this.n; i++) {
      const z = this.dz[i] ?? 0.5;
      const seed = this.ds[i] ?? 0;
      const x = wrap((this.dx[i] ?? 0) - t * 3 * z + px * 14 * z, W);
      const y = wrap((this.dy[i] ?? 0) - t * (4 + 9 * z) + py * 9 * z, H);
      ctx.globalAlpha = a * z * 0.45 * (0.55 + 0.45 * Math.sin(t * (0.9 + seed) + seed * 40));
      const s = 0.8 + z * 1.1;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;

    // match-minute ruler along the lower edge
    const y = H * 0.9 + py * 4;
    const minor = frame.composition === 'mobile' ? 12 : 16;
    const major = minor * 5;
    const drift = -t * 6;
    ctx.fillStyle = rgba(colors.ink, 0.05 * a);
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = rgba(colors.ink, 0.1 * a);
    for (let k = Math.floor((-major - drift) / major); ; k++) {
      const x = k * major + drift;
      if (x > W + major) break;
      ctx.fillRect(x, y - 6, 1, 6);
      for (let j = 1; j < 5; j++) ctx.fillRect(x + j * minor, y - 3, 1, 3);
    }

    // a slow scan pass every 9 s
    const cycle = 9;
    const p = progress(wrap(t, cycle), 0, 3.2);
    if (p > 0 && p < 1 && !frame.reduced) {
      drawScanLine(ctx, W, ease.inOutQuad(p) * H, colors.ink, 0.45 * a * Math.sin(p * Math.PI));
    }
    resetTransform(ctx, dpr);
  }
}

/* ------------------------------------------------------------------------- */
/* Sports data: items that decode in, tick, and hand over to new ones          */
/* ------------------------------------------------------------------------- */

export interface AmbientDataOptions {
  /** 0..1.5 — how many data items are on screen. */
  density?: number;
  /** 0..1 — overall brightness. */
  intensity?: number;
  seed?: number;
  /** Keep this area clear for content. */
  clear?: ClearZone;
}

const AMBIENT_KINDS: DataKind[] = ['odds', 'metric', 'spark', 'metric', 'poisson', 'form', 'score', 'odds'];

export class AmbientDataLayer implements StageLayer {
  readonly order = 20;
  readonly ambient = true;
  private slots = 0;
  private cache = new Map<string, DataItem>();
  private readonly density: number;
  private readonly intensity: number;
  private readonly seed: number;
  private readonly clear: ClearZone;
  private composition: StageFrame['composition'] = 'desktop';

  constructor(options: AmbientDataOptions = {}) {
    this.density = options.density ?? 1;
    this.intensity = options.intensity ?? 0.55;
    this.seed = options.seed ?? 0xd47a;
    this.clear = options.clear ?? { x: 0.5, y: 0.46, rx: 0.3, ry: 0.28 };
  }

  resize(frame: StageFrame): void {
    this.composition = frame.composition;
    const base = frame.composition === 'desktop' ? 14 : frame.composition === 'tablet' ? 10 : 6;
    this.slots = Math.max(2, Math.round(base * this.density * Math.min(1.2, frame.density + 0.2)));
    this.cache.clear();
  }

  /** The item a slot shows during its `cycle`-th lifetime (seeded, cached). */
  private item(slot: number, cycle: number): DataItem {
    const key = `${slot}:${cycle}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const rng = createRng(this.seed + slot * 7919 + cycle * 104729);
    let fx = 0.5;
    let fy = 0.5;
    for (let tries = 0; tries < 12; tries++) {
      fx = 0.05 + rng() * 0.82;
      fy = 0.12 + rng() * 0.74;
      const dx = (fx - this.clear.x) / this.clear.rx;
      const dy = (fy - this.clear.y) / this.clear.ry;
      if (dx * dx + dy * dy > 1) break;
    }
    const item = createItem(rng, AMBIENT_KINDS[(slot + cycle) % AMBIENT_KINDS.length] ?? 'metric', fx, fy, 0);
    item.depth = 0.35 + rng() * 0.5;
    if (this.cache.size > 256) this.cache.clear();
    this.cache.set(key, item);
    return item;
  }

  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void {
    const { width: W, height: H, time, colors } = frame;
    const t = frame.reduced ? 6 : time;
    const style: ItemStyle = {
      font: frame.font,
      ink: colors.ink,
      brand: colors.brand,
      size: this.composition === 'desktop' ? 12.5 : this.composition === 'tablet' ? 12 : 11,
    };
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;
    for (let slot = 0; slot < this.slots; slot++) {
      const period = 10 + hash(slot, 1) * 6;
      const local = t + hash(slot, 2) * period;
      const cycle = Math.floor(local / period);
      const age = local - cycle * period;
      const item = this.item(slot, cycle);
      const life = progress(age, 0.2, 0.9);
      const out = 1 - progress(age, period - 1.2, period - 0.2);
      if (life <= 0 || out <= 0) continue;
      const x = item.fx * W + px * 16 * item.depth - age * 1.2 * item.depth;
      const y = item.fy * H + py * 10 * item.depth - age * 0.6;
      drawItem(ctx, item, x, y, life, age, t, alpha * this.intensity * out, style);
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Momentum: an occasional trajectory arc and ring pulse                       */
/* ------------------------------------------------------------------------- */

export class AmbientArcsLayer implements StageLayer {
  readonly order = 15;
  readonly ambient = true;

  constructor(
    private readonly intensity = 0.6,
    private readonly period = 7.5,
  ) {}

  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void {
    if (frame.reduced) return;
    const { width: W, height: H, time: t, colors, dpr } = frame;
    const cycle = Math.floor(t / this.period);
    const local = t - cycle * this.period;
    const flip = cycle % 2 === 1;
    const p = progress(local, 0.6, 3.4);
    const after = clamp((local - 3.4) / 0.9);
    if (p <= 0 || after >= 1) return;
    const mobile = frame.composition === 'mobile';
    const x0 = flip ? 1.05 * W : -0.05 * W;
    const x1 = flip ? -0.05 * W : 1.05 * W;
    const y0 = (mobile ? 0.86 : 0.78) * H;
    const y1 = (0.55 + hash(cycle, 5) * 0.2) * H;
    const cy = (mobile ? 0.12 : -0.05 + hash(cycle, 9) * 0.15) * H;
    const color = cycle % 3 === 2 ? colors.brandHot : colors.ink;
    const a = alpha * this.intensity * (1 - after);
    const head = ease.inOutCubic(p);
    const pt = (s: number): [number, number] => [quad(x0, W / 2, x1, s), quad(y0, cy, y1, s)];

    ctx.lineWidth = 1.25;
    const segs = 22;
    for (let i = 0; i < segs; i++) {
      const s0 = head - 0.3 * (1 - i / segs);
      const s1 = head - 0.3 * (1 - (i + 1) / segs);
      if (s1 <= 0) continue;
      const [ax, ay] = pt(Math.max(0, s0));
      const [bx, by] = pt(s1);
      ctx.strokeStyle = rgba(color, a * (i / segs) * 0.6);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(color, a * 0.25);
    for (let s = 0.02; s < head - 0.18; s += 0.04) {
      const [x, y] = pt(s);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    if (p < 1) {
      const [hx, hy] = pt(head);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8;
      ctx.drawImage(glowSprite(color, 64), hx - 14, hy - 14, 28, 28);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // a probability readout that travels with the ball
    if (p > 0.35 && p < 1) {
      const [hx, hy] = pt(head);
      setFont(ctx, mobile ? 9 : 10, frame.font, 500);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(color, a * 0.7 * Math.sin(((p - 0.35) / 0.65) * Math.PI));
      ctx.fillText(`P ${(0.48 + head * 0.36).toFixed(2)}`, hx + 10, hy - 8);
    }
    resetTransform(ctx, dpr);
  }
}
