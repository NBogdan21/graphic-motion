/**
 * Small, allocation-free math helpers shared by the canvas layers and the logo rig.
 * Every animated value in the motion system is a pure function of time built
 * from these primitives, which is what makes the intro seekable and skippable.
 */

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Normalised progress of `t` through the window [start, end], clamped to 0..1. */
export const progress = (t: number, start: number, end: number): number => {
  if (end <= start) return t >= start ? 1 : 0;
  return clamp((t - start) / (end - start));
};

/** 0 → 1 → 0 bump over [start, end]; `hold` is the fraction spent at full value. */
export const pulse = (t: number, start: number, end: number, hold = 0): number => {
  const p = progress(t, start, end);
  if (p <= 0 || p >= 1) return 0;
  const rise = (1 - hold) / 2;
  if (p < rise) return ease.outCubic(p / rise);
  if (p > 1 - rise) return ease.inCubic((1 - p) / rise);
  return 1;
};

export const fract = (v: number): number => v - Math.floor(v);

/** Positive modulo, for wrapping positions. */
export const wrap = (v: number, size: number): number => ((v % size) + size) % size;

export const smoothstep = (edge0: number, edge1: number, v: number): number => {
  const x = clamp((v - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  inExpo: (t: number) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  /** Fast attack, long settle — the "confident landing" curve used for most arrivals. */
  outCirc: (t: number) => Math.sqrt(1 - (t - 1) ** 2),
} satisfies Record<string, Easing>;

/**
 * Damped spring response from 0 to 1 (overshoots, then settles).
 * `t` in seconds; `frequency` in Hz; `damping` is the decay rate per second.
 */
export const spring = (t: number, frequency = 2.4, damping = 8): number => {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * frequency;
  return 1 - Math.exp(-damping * t) * (Math.cos(w * t) + (damping / w) * Math.sin(w * t));
};

/** Quadratic Bézier point, written out to stay allocation-free. */
export const quad = (a: number, c: number, b: number, t: number): number => {
  const u = 1 - t;
  return u * u * a + 2 * u * t * c + t * t * b;
};

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);
