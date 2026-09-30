import { rgba } from '../color';
import { clamp, ease, rectsOverlap, type Rect } from '../math';
import { createRng, hash, type Rng } from '../random';
import { randomWalk, setFont, strokeSeries } from '../stage/draw';

/**
 * The abstract sports-data vocabulary used by the intro and the ambient
 * backgrounds: odds rows, model probabilities, Poisson goal distributions,
 * odds-drift sparklines, form guides and live scores. Everything is drawn as
 * thin type and hairlines so it reads as analytics, never as a dashboard.
 */

export type DataKind = 'odds' | 'metric' | 'spark' | 'poisson' | 'form' | 'score';

export interface DataItem {
  kind: DataKind;
  /** Position as a fraction of the viewport. */
  fx: number;
  fy: number;
  /** 0.35 (far) … 1 (near): size, brightness and parallax. */
  depth: number;
  /** Seconds (relative to the owner's clock) when the item starts decoding in. */
  appear: number;
  seed: number;
  /** Highlight the value in brand orange. */
  hot: boolean;
  label: string;
  values: number[];
  decimals: number;
  prefix: string;
  suffix: string;
  /** Seconds after `appear` at which the value ticks, and by how much. */
  ticks: number[];
  deltas: number[];
  series: Float32Array | null;
}

const TEAMS = ['RIV', 'NOR', 'HAR', 'ALP', 'MET', 'BAY', 'COR', 'VAL', 'KIN', 'EAS', 'WES', 'SUN', 'FOR', 'LYN'];
const METRICS: { label: string; min: number; max: number; decimals: number; prefix?: string; suffix?: string }[] = [
  { label: 'P(HOME)', min: 0.31, max: 0.68, decimals: 3 },
  { label: 'P(DRAW)', min: 0.21, max: 0.31, decimals: 3 },
  { label: 'xG', min: 0.4, max: 2.8, decimals: 2 },
  { label: 'λ GOALS', min: 1.1, max: 3.2, decimals: 2 },
  { label: 'σ', min: 0.12, max: 0.41, decimals: 2 },
  { label: 'EV', min: 1.2, max: 6.8, decimals: 1, prefix: '+', suffix: '%' },
  { label: 'CLV', min: 0.6, max: 3.9, decimals: 1, prefix: '+', suffix: '%' },
  { label: 'Δ PRICE', min: 0.02, max: 0.14, decimals: 2, prefix: '+' },
  { label: 'POSS', min: 44, max: 66, decimals: 0, suffix: '%' },
  { label: 'O/U 2.5', min: 1.72, max: 2.14, decimals: 2 },
  { label: 'BTTS', min: 1.62, max: 2.05, decimals: 2 },
];

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFHKLMNPRSTVXZ';

export function createItem(rng: Rng, kind: DataKind, fx: number, fy: number, appear: number): DataItem {
  const home = rng.pick(TEAMS);
  let away = rng.pick(TEAMS);
  if (away === home) away = TEAMS[(TEAMS.indexOf(home) + 3) % TEAMS.length] ?? 'NOR';
  const base: DataItem = {
    kind,
    fx,
    fy,
    depth: 0.35 + rng() * 0.65,
    appear,
    seed: Math.floor(rng() * 1e6),
    hot: rng.chance(0.18),
    label: '',
    values: [],
    decimals: 2,
    prefix: '',
    suffix: '',
    ticks: [0.7 + rng() * 0.5, 1.6 + rng() * 1.4, 3.2 + rng() * 2],
    deltas: [rng.sign() * rng.range(0.01, 0.09), rng.sign() * rng.range(0.01, 0.07), rng.sign() * rng.range(0.01, 0.06)],
    series: null,
  };
  switch (kind) {
    case 'odds': {
      const pHome = rng.range(0.28, 0.62);
      const pDraw = rng.range(0.22, 0.3);
      const pAway = Math.max(0.08, 1 - pHome - pDraw);
      const margin = 1.05;
      return { ...base, label: `${home} v ${away}`, values: [pHome, pDraw, pAway].map((p) => 1 / (p * margin)) };
    }
    case 'metric': {
      const m = rng.pick(METRICS);
      return {
        ...base,
        label: m.label,
        values: [rng.range(m.min, m.max)],
        decimals: m.decimals,
        prefix: m.prefix ?? '',
        suffix: m.suffix ?? '',
        deltas: base.deltas.map((d) => d * (m.max - m.min) * 0.8),
      };
    }
    case 'spark':
      return { ...base, label: `${home} DRIFT`, values: [rng.range(1.6, 3.4)], series: randomWalk(rng, 28, 0.2) };
    case 'poisson':
      return { ...base, label: 'λ', values: [rng.range(1.1, 2.9)] };
    case 'form':
      return { ...base, label: `${home} FORM`, values: Array.from({ length: 5 }, () => rng.int(0, 3)) };
    case 'score':
      return { ...base, label: `${home}  ${away}`, values: [rng.int(0, 4), rng.int(0, 3), rng.int(8, 88)], hot: true };
  }
}

/** Keeps scattered items apart and on screen (all in CSS px). */
export interface ScatterFit {
  width: number;
  height: number;
  /** Base value size the items are drawn at (`ItemStyle.size`). */
  size: number;
  /** Horizontal bands to keep clear, as [top, bottom] (e.g. the match-minute rulers). */
  avoid?: readonly (readonly [number, number])[];
}

/** Minimum clearance around a data item, in CSS px (doubled between two items). */
export const ITEM_GAP = { x: 14, y: 9 } as const;
const EDGE_MARGIN = 12;

/**
 * Scatter items over the viewport on a jittered grid, keeping a clear zone at
 * the centre. With `fit`, items also never touch each other or an `avoid`
 * band, and stay fully on screen: an item that doesn't fit is re-jittered
 * within its cell (on its own random stream, so the rest of the layout keeps
 * its positions) and left out if it still can't be placed.
 */
export function scatterItems(
  seed: number,
  cols: number,
  rows: number,
  window: [number, number],
  clear: { rx: number; ry: number } = { rx: 0.26, ry: 0.11 },
  fit?: ScatterFit,
): DataItem[] {
  const rng = createRng(seed);
  const kinds: DataKind[] = ['odds', 'metric', 'spark', 'metric', 'poisson', 'odds', 'form', 'metric', 'score'];
  const items: DataItem[] = [];
  const placed: Rect[] = [];
  const inClear = (fx: number, fy: number) => ((fx - 0.5) / clear.rx) ** 2 + ((fy - 0.5) / clear.ry) ** 2 < 1;
  // push outside the clear zone, vertically
  const clearY = (fy: number, r: number) => 0.5 + Math.sign(fy - 0.5 || 1) * clear.ry * (1.15 + r * 0.3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng.chance(0.12)) continue;
      let fx = (c + 0.5 + (rng() - 0.5) * 0.62) / cols;
      let fy = (r + 0.5 + (rng() - 0.5) * 0.55) / rows;
      if (inClear(fx, fy)) {
        fy = clearY(fy, rng());
        fx = clamp(fx, 0.06, 0.94);
      }
      const appear = window[0] + rng() * (window[1] - window[0]);
      const item = createItem(rng, kinds[(r * cols + c + rng.int(0, 3)) % kinds.length] ?? 'metric', fx, fy, appear);
      if (!fit) {
        items.push(item);
        continue;
      }
      const { w, h } = itemBounds(item, fit.size);
      const alt = createRng(item.seed);
      for (let tries = 0; tries < 16; tries++) {
        if (tries > 0) {
          item.fx = (c + 0.08 + alt() * 0.84) / cols;
          item.fy = (r + 0.08 + alt() * 0.84) / rows;
          if (inClear(item.fx, item.fy)) item.fy = clearY(item.fy, alt());
        }
        const x = item.fx * fit.width;
        const y = item.fy * fit.height;
        if (x < EDGE_MARGIN || y < EDGE_MARGIN) continue;
        if (x + w > fit.width - EDGE_MARGIN || y + h > fit.height - EDGE_MARGIN) continue;
        const box = { x: x - ITEM_GAP.x, y: y - ITEM_GAP.y, w: w + ITEM_GAP.x * 2, h: h + ITEM_GAP.y * 2 };
        if (fit.avoid?.some(([top, bottom]) => box.y < bottom && top < box.y + box.h)) continue;
        if (placed.some((p) => rectsOverlap(p, box))) continue;
        placed.push(box);
        items.push(item);
        break;
      }
    }
  }
  return items;
}

/* ------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* ------------------------------------------------------------------------- */

export interface ItemStyle {
  font: string;
  ink: string;
  brand: string;
  /** Base font size for values (labels are ~70 %). */
  size: number;
}

/** Characters settle left to right while unsettled ones cycle through glyphs. */
export function decode(text: string, p: number, t: number, seed: number): string {
  if (p >= 1) return text;
  let out = '';
  const n = text.length;
  for (let k = 0; k < n; k++) {
    const ch = text.charAt(k);
    const settle = 0.3 + (k / Math.max(1, n)) * 0.62;
    if (p >= settle || ch === ' ' || ch === '.' || ch === '%' || ch === "'") out += ch;
    else if (p < (k / n) * 0.3) out += ' ';
    else {
      const r = hash(seed + k * 131, Math.floor(t * 26));
      out += DIGITS.includes(ch) ? DIGITS.charAt(Math.floor(r * 10)) : LETTERS.charAt(Math.floor(r * LETTERS.length));
    }
  }
  return out;
}

const fmt = (v: number, decimals: number): string => v.toFixed(decimals);

/** Current value and last tick direction for an item at local time `age`. */
function tickedValue(item: DataItem, index: number, age: number): [number, number, number] {
  let v = item.values[index] ?? 0;
  let dir = 0;
  let since = Infinity;
  for (let k = 0; k < item.ticks.length; k++) {
    const at = (item.ticks[k] ?? 0) + index * 0.13;
    if (age >= at) {
      const d = (item.deltas[k] ?? 0) * (index % 2 ? -1 : 1);
      v += d;
      dir = Math.sign(d);
      since = age - at;
    }
  }
  return [v, dir, since];
}

/**
 * Draw one item with its top-left at (x, y).
 * `life` 0..1 fades/decodes in; `age` is seconds since it appeared.
 */
export function drawItem(
  ctx: CanvasRenderingContext2D,
  item: DataItem,
  x: number,
  y: number,
  life: number,
  age: number,
  t: number,
  alpha: number,
  style: ItemStyle,
  boost = 0,
): void {
  if (life <= 0 || alpha <= 0.004) return;
  const d = item.depth;
  const size = style.size * (0.78 + d * 0.32);
  const label = size * 0.7;
  const charW = size * 0.6;
  const a = alpha * clamp(ease.outCubic(life) * (0.38 + d * 0.52) + boost * 0.35, 0, 1);
  const decodeP = clamp(life * 1.25);
  const valueColor = item.hot ? style.brand : style.ink;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // Label
  setFont(ctx, label, style.font, 500);
  ctx.fillStyle = rgba(style.ink, a * 0.55);
  ctx.fillText(decode(item.label, decodeP, t, item.seed), x, y);
  const vy = y + label * 1.45;

  switch (item.kind) {
    case 'odds': {
      setFont(ctx, size, style.font, 500);
      let cx = x;
      for (let i = 0; i < 3; i++) {
        const [v, dir, since] = tickedValue(item, i, age);
        const text = fmt(v, 2);
        const flash = since < 0.45 ? 1 - since / 0.45 : 0;
        const best = item.hot && i === 0;
        ctx.fillStyle = rgba(best || (flash > 0 && dir > 0) ? style.brand : style.ink, Math.min(1, a * (1 + flash * 0.8)));
        ctx.fillText(decode(text, decodeP, t, item.seed + i * 17), cx, vy);
        if (flash > 0 && life >= 1) drawArrow(ctx, cx + charW * 4.3, vy + size * 0.5, dir, size * 0.28, flash * a, style);
        cx += charW * 5.6;
      }
      break;
    }
    case 'metric': {
      const [v, dir, since] = tickedValue(item, 0, age);
      const text = `${item.prefix}${fmt(v, item.decimals)}${item.suffix}`;
      const flash = since < 0.5 ? 1 - since / 0.5 : 0;
      setFont(ctx, size * 1.12, style.font, 500);
      ctx.fillStyle = rgba(valueColor, Math.min(1, a * (1 + flash)));
      ctx.fillText(decode(text, decodeP, t, item.seed), x, vy);
      if (flash > 0 && life >= 1) drawArrow(ctx, x + text.length * charW * 1.12 + 6, vy + size * 0.55, dir, size * 0.3, flash * a, style);
      if (item.label.startsWith('P(')) {
        // probability bar
        const w = charW * 1.12 * 5.2;
        ctx.fillStyle = rgba(style.ink, a * 0.14);
        ctx.fillRect(x, vy + size * 1.55, w, 1);
        ctx.fillStyle = rgba(valueColor, a * 0.8);
        ctx.fillRect(x, vy + size * 1.55, w * clamp(v) * ease.outCubic(life), 1);
      }
      break;
    }
    case 'spark': {
      const w = size * 6.4;
      const h = size * 1.7;
      const [v] = tickedValue(item, 0, age);
      if (item.series) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(valueColor, a * 0.85);
        const [ex, ey] = strokeSeries(ctx, item.series, x, vy, w, h, ease.inOutCubic(life));
        ctx.fillStyle = rgba(valueColor, a);
        ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
      }
      setFont(ctx, size, style.font, 500);
      ctx.fillStyle = rgba(style.ink, a * 0.9);
      ctx.fillText(decode(fmt(v, 2), decodeP, t, item.seed), x + w + 8, vy + h * 0.2);
      break;
    }
    case 'poisson': {
      const lambda = item.values[0] ?? 1.5;
      setFont(ctx, label, style.font, 500);
      ctx.fillStyle = rgba(style.ink, a * 0.55);
      ctx.fillText(fmt(lambda, 2), x + label * 1.3, y);
      const bw = size * 0.42;
      const gap = size * 0.28;
      const h = size * 2.1;
      let pmf = Math.exp(-lambda);
      let peak = 0;
      for (let k = 0, p = pmf; k < 7; k++, p *= lambda / k) peak = Math.max(peak, p);
      for (let k = 0; k < 7; k++) {
        if (k > 0) pmf *= lambda / k;
        const grow = ease.outCubic(clamp(life * 1.6 - k * 0.09));
        const bh = (pmf / peak) * h * grow;
        const hot = k === Math.floor(lambda);
        ctx.fillStyle = rgba(hot ? style.brand : style.ink, a * (hot ? 0.95 : 0.55));
        ctx.fillRect(x + k * (bw + gap), vy + h - bh, bw, bh);
      }
      ctx.fillStyle = rgba(style.ink, a * 0.2);
      ctx.fillRect(x, vy + h + 1, 7 * (bw + gap) - gap, 1);
      break;
    }
    case 'form': {
      const s = size * 0.62;
      for (let i = 0; i < 5; i++) {
        const r = item.values[i] ?? 0;
        const on = clamp(life * 1.8 - i * 0.12);
        if (on <= 0) continue;
        const cx = x + i * (s + size * 0.34);
        if (r === 2) {
          ctx.fillStyle = rgba(style.ink, a * 0.8 * on);
          ctx.fillRect(cx, vy + 2, s, s);
        } else if (r === 1) {
          ctx.strokeStyle = rgba(style.ink, a * 0.6 * on);
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, vy + 2.5, s - 1, s - 1);
        } else {
          ctx.fillStyle = rgba(style.brand, a * 0.7 * on);
          ctx.fillRect(cx, vy + 2 + s / 2 - 0.5, s, 1.5);
        }
      }
      break;
    }
    case 'score': {
      const [h, aw, min] = [item.values[0] ?? 0, item.values[1] ?? 0, item.values[2] ?? 0];
      const minute = Math.min(90, Math.floor(min + age / 6));
      setFont(ctx, size * 1.25, style.font, 600);
      ctx.fillStyle = rgba(style.ink, a);
      ctx.fillText(decode(`${h} – ${aw}`, decodeP, t, item.seed), x, vy);
      setFont(ctx, label, style.font, 500);
      const pulse = 0.55 + 0.45 * Math.sin(t * 5);
      ctx.fillStyle = rgba(style.brand, a * pulse);
      ctx.fillText(`${minute}'`, x + size * 4.4, vy + size * 0.35);
      break;
    }
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  s: number,
  a: number,
  style: ItemStyle,
): void {
  if (!dir || a <= 0.01) return;
  ctx.fillStyle = rgba(dir > 0 ? style.brand : style.ink, dir > 0 ? a : a * 0.6);
  ctx.beginPath();
  if (dir > 0) {
    ctx.moveTo(x - s, y + s * 0.6);
    ctx.lineTo(x + s, y + s * 0.6);
    ctx.lineTo(x, y - s * 0.8);
  } else {
    ctx.moveTo(x - s, y - s * 0.6);
    ctx.lineTo(x + s, y - s * 0.6);
    ctx.lineTo(x, y + s * 0.8);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Rendered size of an item drawn by `drawItem` at base size `size`, in CSS px:
 * label row plus values, including tick arrows (monospace advance is 0.6 em).
 */
export function itemBounds(item: DataItem, size: number): { w: number; h: number } {
  const s = size * (0.78 + item.depth * 0.32);
  const labelW = item.label.length * s * 0.42;
  const values = s * 1.015; // top of the value row (label size × 1.45)
  let w: number;
  let h: number;
  switch (item.kind) {
    case 'odds':
      w = s * 9.72;
      h = values + s;
      break;
    case 'metric': {
      // one spare character: a tick can add a digit
      const chars = item.prefix.length + fmt(item.values[0] ?? 0, item.decimals).length + item.suffix.length + 1;
      w = chars * s * 0.672 + 6 + s * 0.3;
      h = values + (item.label.startsWith('P(') ? s * 1.55 + 1 : s * 1.12);
      break;
    }
    case 'spark':
      w = s * 8.8 + 8;
      h = values + s * 1.7 + 2;
      break;
    case 'poisson':
      w = s * 4.62;
      h = values + s * 2.1 + 2;
      break;
    case 'form':
      w = s * 4.46;
      h = values + s * 0.62 + 2;
      break;
    case 'score':
      w = s * 5.66;
      h = values + s * 1.25;
      break;
  }
  return { w: Math.max(w, labelW), h };
}
