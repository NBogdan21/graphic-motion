import geometry from './logo-geometry.json';

/**
 * Typed access to the logo geometry produced by scripts/build_brand_assets.py.
 * All coordinates are in pixels of the trimmed lockup image (LOCKUP.w × LOCKUP.h).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PartId = 'k-cut' | 'k' | 'i-dot' | 'i' | 'c' | 'k2' | 'm' | 'a' | 't' | 'h';

export interface LogoPart {
  id: PartId;
  /** 'brand' = orange ("Math"), 'ink' = white ("Kick"). */
  tone: 'brand' | 'ink';
  /** Window rect: the letter plus the halo pixels it owns. */
  rect: Rect;
  /** Solid letter body (alpha ≥ 50 %). */
  body: Rect;
  /** Clip-path polygon of the window, in % of `rect`. */
  clip: [number, number][];
  /** Outline of the letter body as an SVG path (lockup coordinates). */
  path: string;
  /** Perimeter of `path`, for stroke-dash animation. */
  length: number;
  /** K fragment only: the diagonal cut, left → right. */
  slash?: [[number, number], [number, number]];
}

export interface TaglineGlyph extends Rect {
  char: string;
}

interface LogoGeometry {
  lockup: { w: number; h: number; src: string; renditions: { w: number; src: string }[] };
  split: number;
  wordmark: Rect & { src: string; crop: Rect };
  tagline: Rect & { text: string; glyphs: TaglineGlyph[] };
  glow: Rect & { src: string };
  colors: { brand: string; ink: string };
  parts: LogoPart[];
}

export const LOGO = geometry as unknown as LogoGeometry;
export const LOCKUP = LOGO.lockup;
export const PARTS = LOGO.parts;
export const TAGLINE = LOGO.tagline;
export const WORDMARK = LOGO.wordmark;

export const LOGO_NAME = 'KickMath';
export const LOGO_ALT = 'KickMath — Built on analysis, driven by discipline.';

/** srcset for the full lockup (renditions + master). */
export const LOCKUP_SRCSET = [
  ...LOCKUP.renditions.map((r) => `${r.src} ${r.w}w`),
  `${LOCKUP.src} ${LOCKUP.w}w`,
].join(', ');

export const partById = (id: PartId): LogoPart => {
  const part = PARTS.find((p) => p.id === id);
  if (!part) throw new Error(`Unknown logo part: ${id}`);
  return part;
};

/** Percent helpers for positioning inside the lockup box. */
export const pctX = (x: number): string => `${(x / LOCKUP.w) * 100}%`;
export const pctY = (y: number): string => `${(y / LOCKUP.h) * 100}%`;
