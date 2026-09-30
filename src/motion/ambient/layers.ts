import { rgba } from '../color';
import { createItem, drawItem, ITEM_GAP, itemBounds, type DataItem, type DataKind, type ItemStyle } from '../data/items';
import { clamp, ease, ellipseDistance, ellipseRectDistance, progress, quad, rectsOverlap, wrap, type Rect } from '../math';
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

/** Slot timing: each slot shows one item per period, phase-shifted per slot. */
const slotPeriod = (slot: number): number => 10 + hash(slot, 1) * 6;
const slotPhase = (slot: number): number => hash(slot, 2) * slotPeriod(slot);

interface Placed {
  item: DataItem;
  /** Screen area it covers over its whole lifetime (drift and parallax included). */
  box: Rect;
}

export class AmbientDataLayer implements StageLayer {
  readonly order = 20;
  readonly ambient = true;
  private slots = 0;
  /** Placements by `slot:cycle`, with the time each lifetime ends. */
  private cache = new Map<string, { placed: Placed | null; until: number }>();
  private readonly density: number;
  private readonly intensity: number;
  private readonly seed: number;
  private readonly clear: ClearZone;
  private composition: StageFrame['composition'] = 'desktop';
  private width = 0;
  private height = 0;

  constructor(options: AmbientDataOptions = {}) {
    this.density = options.density ?? 1;
    this.intensity = options.intensity ?? 0.55;
    this.seed = options.seed ?? 0xd47a;
    this.clear = options.clear ?? { x: 0.5, y: 0.46, rx: 0.3, ry: 0.28 };
  }

  resize(frame: StageFrame): void {
    this.composition = frame.composition;
    this.width = frame.width;
    this.height = frame.height;
    const base = frame.composition === 'desktop' ? 14 : frame.composition === 'tablet' ? 10 : 6;
    this.slots = Math.max(2, Math.round(base * this.density * Math.min(1.2, frame.density + 0.2)));
    this.cache.clear();
  }

  private get size(): number {
    return this.composition === 'desktop' ? 12.5 : this.composition === 'tablet' ? 12 : 11;
  }

  /**
   * The item a slot shows during its `cycle`-th lifetime (seeded, cached), or
   * null when there is no free spot for it. An item never overlaps the clear
   * zone, the screen edges, or any lower slot's item on screen at the same
   * time, so type never collides however the slot timings line up.
   */
  private item(slot: number, cycle: number): Placed | null {
    const key = `${slot}:${cycle}`;
    const hit = this.cache.get(key);
    if (hit) return hit.placed;

    const period = slotPeriod(slot);
    const from = cycle * period - slotPhase(slot);
    const to = from + period;
    const busy: Rect[] = [];
    for (let other = 0; other < slot; other++) {
      const p = slotPeriod(other);
      const phase = slotPhase(other);
      const last = Math.floor((to + phase) / p);
      for (let c = Math.floor((from + phase) / p); c <= last; c++) {
        const placed = this.item(other, c);
        if (placed) busy.push(placed.box);
      }
    }

    const rng = createRng(this.seed + slot * 7919 + cycle * 104729);
    const item = createItem(rng, AMBIENT_KINDS[(slot + cycle) % AMBIENT_KINDS.length] ?? 'metric', 0, 0, 0);
    item.depth = 0.35 + rng() * 0.5;
    const W = this.width;
    const H = this.height;
    const { w, h } = itemBounds(item, this.size);
    // Over its lifetime an item drifts left and up (see render); the cursor
    // parallax moves it both ways on top of that.
    const driftX = period * 1.2 * item.depth;
    const driftY = period * 0.6;
    const parX = 16 * item.depth;
    const parY = 10 * item.depth;
    const { x: cx, y: cy, rx, ry } = this.clear;
    let placed: Placed | null = null;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      const fx = 0.04 + rng() * 0.88;
      const fy = 0.08 + rng() * 0.84;
      const reach = { x: fx * W - driftX - parX, y: fy * H - driftY - parY, w: w + driftX + parX * 2, h: h + driftY + parY * 2 };
      if (reach.x < 12 || reach.y < 12 || reach.x + reach.w > W - 12 || reach.y + reach.h > H - 12) continue;
      if (ellipseRectDistance(cx * W, cy * H, rx * W, ry * H, reach) < 1) continue;
      // Neighbours share most of the parallax, so the gap only needs the drift.
      const box = {
        x: fx * W - driftX - ITEM_GAP.x,
        y: fy * H - driftY - ITEM_GAP.y,
        w: w + driftX + ITEM_GAP.x * 2,
        h: h + driftY + ITEM_GAP.y * 2,
      };
      if (busy.some((b) => rectsOverlap(b, box))) continue;
      item.fx = fx;
      item.fy = fy;
      placed = { item, box };
    }
    this.cache.set(key, { placed, until: to });
    return placed;
  }

  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void {
    const { width: W, height: H, time, colors } = frame;
    const t = frame.reduced ? 6 : time;
    const style: ItemStyle = {
      font: frame.font,
      ink: colors.ink,
      brand: colors.brand,
      size: this.size,
    };
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;
    // Forget lifetimes that have ended. Never mid-lookup: placements depend on
    // each other, and a cache emptied during one would recompute endlessly.
    if (this.cache.size > 2048) {
      for (const [key, entry] of this.cache) if (entry.until < t - 1) this.cache.delete(key);
    }
    for (let slot = 0; slot < this.slots; slot++) {
      const period = slotPeriod(slot);
      const local = t + slotPhase(slot);
      const cycle = Math.floor(local / period);
      const age = local - cycle * period;
      const item = this.item(slot, cycle)?.item;
      if (!item) continue;
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
    /** The ball passes behind this zone (the content): it fades out while crossing it. */
    private readonly clear?: ClearZone,
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
    const z = this.clear;
    const visible = (x: number, y: number): number =>
      z ? clamp((ellipseDistance(z.x * W, z.y * H, z.rx * W, z.ry * H, x, y) - 1) / 0.12) : 1;

    ctx.lineWidth = 1.25;
    const segs = 22;
    for (let i = 0; i < segs; i++) {
      const s0 = head - 0.3 * (1 - i / segs);
      const s1 = head - 0.3 * (1 - (i + 1) / segs);
      if (s1 <= 0) continue;
      const [ax, ay] = pt(Math.max(0, s0));
      const [bx, by] = pt(s1);
      const v = visible((ax + bx) / 2, (ay + by) / 2);
      if (v <= 0) continue;
      ctx.strokeStyle = rgba(color, a * v * (i / segs) * 0.6);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(color, a * 0.25);
    for (let s = 0.02; s < head - 0.18; s += 0.04) {
      const [x, y] = pt(s);
      if (visible(x, y) > 0.5) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    const [hx, hy] = pt(head);
    const headVisible = visible(hx, hy);
    if (p < 1 && headVisible > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.8 * headVisible;
      ctx.drawImage(glowSprite(color, 64), hx - 14, hy - 14, 28, 28);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // a probability readout that travels with the ball (never over the content)
    if (p > 0.35 && p < 1) {
      const size = mobile ? 9 : 10;
      const label = { x: hx + 10, y: hy - 8 - size, w: size * 4, h: size };
      const clearFade = z ? clamp((ellipseRectDistance(z.x * W, z.y * H, z.rx * W, z.ry * H, label) - 1) / 0.15) : 1;
      if (clearFade > 0) {
        setFont(ctx, size, frame.font, 500);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(color, a * 0.7 * clearFade * Math.sin(((p - 0.35) / 0.65) * Math.PI));
        ctx.fillText(`P ${(0.48 + head * 0.36).toFixed(2)}`, hx + 10, hy - 8);
      }
    }
    resetTransform(ctx, dpr);
  }
}
