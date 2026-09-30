import { rgba } from '../color';

/**
 * Pre-rendered glow and streak textures. Drawing a cached bitmap with a
 * transform is far cheaper than shadowBlur or per-frame gradients, and keeps
 * the "light" look consistent across the whole system.
 */

const cache = new Map<string, HTMLCanvasElement>();

function surface(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Soft radial blob; draw centred and scaled to taste. */
export function glowSprite(color: string, size = 64, core = 0.18): HTMLCanvasElement {
  const key = `glow:${color}:${size}:${core}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = surface(size, size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(color, 1));
  g.addColorStop(core, rgba(color, 0.55));
  g.addColorStop(0.45, rgba(color, 0.14));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

/**
 * Horizontal light streak: transparent tail on the left, hot head on the right,
 * with a soft vertical falloff. Draw with a transform to aim it.
 */
export function streakSprite(color: string, headColor = '#ffffff'): HTMLCanvasElement {
  const key = `streak:${color}:${headColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 16;
  const [c, ctx] = surface(W, H);
  const horizontal = ctx.createLinearGradient(0, 0, W, 0);
  horizontal.addColorStop(0, rgba(color, 0));
  horizontal.addColorStop(0.7, rgba(color, 0.55));
  horizontal.addColorStop(0.94, rgba(headColor, 0.95));
  horizontal.addColorStop(1, rgba(headColor, 0));
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, H);
  vertical.addColorStop(0, 'rgba(0,0,0,0)');
  vertical.addColorStop(0.42, 'rgba(0,0,0,0.35)');
  vertical.addColorStop(0.5, 'rgba(0,0,0,1)');
  vertical.addColorStop(0.58, 'rgba(0,0,0,0.35)');
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, W, H);
  cache.set(key, c);
  return c;
}

/** Wide horizontal band of light (the "speed band" the logo forms in). */
export function bandSprite(color: string): HTMLCanvasElement {
  const key = `band:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 512;
  const H = 64;
  const [c, ctx] = surface(W, H);
  const horizontal = ctx.createLinearGradient(0, 0, W, 0);
  horizontal.addColorStop(0, rgba(color, 0));
  horizontal.addColorStop(0.25, rgba(color, 0.6));
  horizontal.addColorStop(0.5, rgba(color, 1));
  horizontal.addColorStop(0.75, rgba(color, 0.6));
  horizontal.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H / 2);
  vertical.addColorStop(0, 'rgba(0,0,0,1)');
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.setTransform(W / H, 0, 0, 1, 0, 0);
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, H, H);
  cache.set(key, c);
  return c;
}
