import type { StageFrame } from '../../stage/stage';
import type { Timeline } from '../../config';
import { ease, progress } from '../../math';
import type { IntroSceneState } from '../sceneState';

/** A drawable piece of the intro scene. */
export interface Fx {
  layout(frame: StageFrame, st: IntroSceneState): void;
  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void;
}

const DECAY = 0.28;

/**
 * Distance travelled by the speed field, in "seconds at full speed".
 * Velocity ramps quadratically through the speed scene, then decays
 * exponentially as the logo starts to form — so streaks brake into the band.
 */
export function speedTravel(t: number, tl: Timeline): number {
  const s = tl.speed;
  if (s.len <= 0 || t <= s.start) return 0;
  if (t <= s.end) {
    const p = (t - s.start) / s.len;
    return (s.len * p * p * p) / 3;
  }
  return s.len / 3 + DECAY * (1 - Math.exp(-(t - s.end) / DECAY));
}

/** Instantaneous speed (0..1) matching `speedTravel`'s derivative. */
export function speedLevel(t: number, tl: Timeline): number {
  const s = tl.speed;
  if (s.len <= 0 || t <= s.start) return 0;
  if (t <= s.end) {
    const p = (t - s.start) / s.len;
    return p * p;
  }
  return Math.exp(-(t - s.end) / DECAY);
}

/** 0..1 — streaks gathering into the horizontal band the logo forms in. */
export function convergence(t: number, tl: Timeline): number {
  return ease.inOutCubic(progress(t, tl.speed.end - tl.speed.len * 0.35, tl.construct.start + tl.construct.len * 0.12));
}

/** 0..1 — everything clears out as the page takes over. */
export function exitLevel(t: number, tl: Timeline): number {
  return progress(t, tl.handoff.start, tl.handoff.start + tl.handoff.len * 0.5);
}

/** Box–Muller normal sample, clamped to ±3σ. */
export function gaussian(rng: () => number): number {
  const u = Math.max(1e-6, rng());
  const v = rng();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(-3, Math.min(3, g));
}
