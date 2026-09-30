import { LOCKUP } from '@/brand/logo';
import type { Timeline } from '../config';
import type { Choreography } from './choreography';

/**
 * Where the logo is on screen this frame. The director measures the rig's
 * untransformed layout box and publishes the transform it applies, so canvas
 * effects (particles, highlights, rings) land exactly on the DOM letters.
 */
export interface LogoFrame {
  /** Untransformed layout box of the lockup, in viewport CSS pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Transform currently applied to the rig (translate in px, scale about the centre). */
  tx: number;
  ty: number;
  s: number;
}

export interface IntroSceneState {
  /** Intro clock in seconds. */
  t: number;
  tl: Timeline;
  ch: Choreography;
  logo: LogoFrame;
  /** The decoded lockup image (used to sample particle targets). */
  image: HTMLImageElement | null;
  /** Particle count for this composition before density scaling. */
  particleBudget: number;
}

/** Lockup pixel → screen CSS pixel. */
export const logoX = (f: LogoFrame, u: number): number =>
  f.x + f.w / 2 + f.tx + (u - LOCKUP.w / 2) * (f.w / LOCKUP.w) * f.s;

export const logoY = (f: LogoFrame, v: number): number =>
  f.y + f.h / 2 + f.ty + (v - LOCKUP.h / 2) * (f.h / LOCKUP.h) * f.s;

/** Screen pixels per lockup pixel. */
export const logoScale = (f: LogoFrame): number => (f.w / LOCKUP.w) * f.s;

/** Screen-space centre of the logo. */
export const logoCenter = (f: LogoFrame): [number, number] => [
  f.x + f.w / 2 + f.tx,
  f.y + f.h / 2 + f.ty,
];
