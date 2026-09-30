/**
 * Deterministic randomness. Layouts are seeded so that every visitor sees the
 * same composition and so any frame can be re-rendered exactly (seek, skip, QA).
 */

export type Rng = {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  sign(): 1 | -1;
};

/** mulberry32 — tiny, fast, good enough for visuals. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, maxExclusive) => Math.floor(next.range(min, maxExclusive));
  next.pick = (items) => items[Math.floor(next() * items.length)] as (typeof items)[number];
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

/** Stateless hash → [0, 1). Used for per-frame flicker that must stay seekable. */
export function hash(a: number, b = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
