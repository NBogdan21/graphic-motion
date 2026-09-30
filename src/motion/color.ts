/** Colour helpers for canvas drawing (config colours are hex strings). */

export type RGB = readonly [number, number, number];

const cache = new Map<string, RGB>();

export function hexToRgb(hex: string): RGB {
  const hit = cache.get(hex);
  if (hit) return hit;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const rgb: RGB = Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, rgb);
  return rgb;
}

export function rgba(color: string | RGB, alpha: number): string {
  const [r, g, b] = typeof color === 'string' ? hexToRgb(color) : color;
  return `rgba(${r},${g},${b},${alpha < 0 ? 0 : alpha > 1 ? 1 : +alpha.toFixed(3)})`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
