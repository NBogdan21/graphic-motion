import { rgba } from '../color';

/** Canvas drawing helpers shared by the scene layers. */

const fontCache = new WeakMap<CanvasRenderingContext2D, string>();

/** Set ctx.font only when it changes (the setter re-parses the string). */
export function setFont(ctx: CanvasRenderingContext2D, size: number, family: string, weight = 500): void {
  const font = `${weight} ${Math.round(size * 2) / 2}px ${family}`;
  if (fontCache.get(ctx) !== font) {
    ctx.font = font;
    fontCache.set(ctx, font);
  }
}

/** Invalidate the font cache after ctx.save()/restore() cycles that may reset state. */
export function resetFontCache(ctx: CanvasRenderingContext2D): void {
  fontCache.delete(ctx);
}

/**
 * Draw a sprite centred at (x, y), rotated by `angle`, stretched to w × h.
 * Uses setTransform directly (no save/restore) — callers reset the transform.
 */
export function drawSpriteAt(
  ctx: CanvasRenderingContext2D,
  sprite: CanvasImageSource,
  dpr: number,
  x: number,
  y: number,
  w: number,
  h: number,
  angle = 0,
  flip = false,
): void {
  const cos = Math.cos(angle) * dpr;
  const sin = Math.sin(angle) * dpr;
  const sx = flip ? -1 : 1;
  ctx.setTransform(cos * sx, sin * sx, -sin, cos, x * dpr, y * dpr);
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
}

export function resetTransform(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Random-walk series for sparklines, deterministic from the rng. */
export function randomWalk(rng: () => number, count: number, volatility = 0.18): Float32Array {
  const out = new Float32Array(count);
  let v = 0.5;
  for (let i = 0; i < count; i++) {
    v += (rng() - 0.5) * volatility;
    v = v < 0.08 ? 0.08 + (0.08 - v) : v > 0.92 ? 0.92 - (v - 0.92) : v;
    out[i] = v;
  }
  return out;
}

/** Stroke the first `amount` (0..1) of a polyline given as normalised values. */
export function strokeSeries(
  ctx: CanvasRenderingContext2D,
  series: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  amount = 1,
): [number, number] {
  const n = series.length;
  const last = Math.max(1, (n - 1) * amount);
  const whole = Math.floor(last);
  ctx.beginPath();
  let px = x;
  let py = y + h - (series[0] ?? 0) * h;
  ctx.moveTo(px, py);
  for (let i = 1; i <= whole; i++) {
    px = x + (i / (n - 1)) * w;
    py = y + h - (series[i] ?? 0) * h;
    ctx.lineTo(px, py);
  }
  const frac = last - whole;
  if (frac > 0 && whole + 1 < n) {
    const a = series[whole] ?? 0;
    const b = series[whole + 1] ?? 0;
    px = x + ((whole + frac) / (n - 1)) * w;
    py = y + h - (a + (b - a) * frac) * h;
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  return [px, py];
}

/**
 * A scan pass: a hairline that is brightest at the centre of the screen, with a
 * soft glow that fades on both sides (no hard edges). `level` 0..1.
 */
export function drawScanLine(ctx: CanvasRenderingContext2D, width: number, y: number, color: string, level: number): void {
  if (level <= 0.005) return;
  const glow = ctx.createLinearGradient(0, y - 110, 0, y + 40);
  glow.addColorStop(0, rgba(color, 0));
  glow.addColorStop(0.72, rgba(color, 0.035 * level));
  glow.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, y - 110, width, 150);
  const line = ctx.createLinearGradient(0, 0, width, 0);
  line.addColorStop(0, rgba(color, 0));
  line.addColorStop(0.5, rgba(color, 0.28 * level));
  line.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = line;
  ctx.fillRect(0, y, width, 1);
}
