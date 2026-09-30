import { LOCKUP, partById, type PartId } from '@/brand/logo';
import type { Timeline } from '../config';
import { ease, quad } from '../math';

/**
 * Beat sheet for the logo, derived from the scene timeline. The DOM rig and
 * the canvas both read these windows, so letters, particles, light strokes and
 * highlights stay locked together at any duration or playback speed.
 */

export interface Beat {
  start: number;
  end: number;
}

/** Letters that assemble by scanning in, in order (Kick, then Math). */
export const SCAN_ORDER: readonly PartId[] = ['k', 'i', 'c', 'k2', 'm', 'a', 't', 'h'];
/** Every part, for the light strokes (the fragment and dot trace too). */
export const STROKE_ORDER: readonly PartId[] = ['k-cut', 'k', 'i-dot', 'i', 'c', 'k2', 'm', 'a', 't', 'h'];

export interface Choreography {
  /** Light strokes tracing each letter's outline. */
  strokes: Partial<Record<PartId, Beat>>;
  /** Masked scan-in of each letter. */
  scan: Partial<Record<PartId, Beat>>;
  /** The K fragment snaps shut along the diagonal cut. */
  kick: Beat;
  /** The i dot arrives on a ball-flight arc. */
  dot: Beat;
  /** Spread of particle arrivals. */
  particles: Beat;
  /** Moment the assembled logo ignites (start of the reveal scene). */
  ignite: number;
  /** Scale overshoot and settle. */
  settle: Beat;
  flash: Beat;
  chroma: Beat;
  sweep: Beat;
  tagline: Beat;
  brackets: Beat;
  momentum: Beat;
  /** The logo flies to its place in the page. */
  flight: Beat;
  /** Page content starts building in. */
  siteReveal: number;
  end: number;
}

const beat = (start: number, len: number): Beat => ({ start, end: start + len });
const never: Beat = { start: Number.POSITIVE_INFINITY, end: Number.POSITIVE_INFINITY };

export function choreograph(tl: Timeline): Choreography {
  const c = tl.construct;
  const r = tl.reveal;
  const h = tl.handoff;
  const full = tl.mode === 'full';

  const strokes: Choreography['strokes'] = {};
  if (full) {
    STROKE_ORDER.forEach((id, i) => {
      strokes[id] = beat(c.start + c.len * (0.1 + 0.045 * i), c.len * 0.36);
    });
  }

  const scan: Choreography['scan'] = {};
  SCAN_ORDER.forEach((id, i) => {
    scan[id] = beat(c.start + c.len * (0.28 + 0.05 * i), c.len * 0.28);
  });

  return {
    strokes,
    scan,
    kick: beat(c.start + c.len * 0.5, c.len * 0.2),
    dot: beat(c.start + c.len * 0.52, c.len * 0.3),
    particles: beat(c.start + c.len * 0.08, c.len * 0.5),
    ignite: r.start,
    settle: beat(r.start, Math.max(0.45, r.len * 0.55)),
    flash: beat(r.start, Math.min(0.32, r.len * 0.4)),
    chroma: beat(r.start, Math.min(0.42, r.len * 0.5)),
    sweep: beat(r.start + r.len * 0.2, r.len * 0.48),
    tagline: beat(r.start + r.len * 0.34, r.len * 0.46),
    brackets: full ? beat(r.start + r.len * 0.34, r.len * 0.36) : never,
    momentum: beat(tl.momentum.start, tl.momentum.len),
    flight: beat(h.start + h.len * 0.08, h.len * 0.92),
    siteReveal: h.start + h.len * 0.18,
    end: tl.duration,
  };
}

/* ------------------------------------------------------------------------- */
/* Signature moves (shared by the DOM rig and the canvas accents)             */
/* ------------------------------------------------------------------------- */

const dotBody = partById('i-dot').body;
/** Resting centre of the i dot, in lockup px. */
export const DOT_CENTER: [number, number] = [dotBody.x + dotBody.w / 2, dotBody.y + dotBody.h / 2];

/**
 * The i dot arrives like a lofted pass: launched from below the wordmark, it
 * arcs over "ckMath" and drops onto the i. Linear time along a quadratic
 * Bézier gives constant horizontal speed and a parabolic height — ball physics.
 * Returns the offset from its resting place, in lockup px.
 */
export function dotFlight(p: number): [number, number] {
  const x0 = LOCKUP.w * 0.52;
  const y0 = LOCKUP.h * 1.05;
  const cx = LOCKUP.w * 0.27;
  const cy = -LOCKUP.h * 1.2;
  return [quad(x0, cx, 0, p), quad(y0, cy, 0, p)];
}

const slash = partById('k-cut').slash ?? [
  [35, 157],
  [102, 87],
];
const sdx = slash[1][0] - slash[0][0];
const sdy = slash[1][1] - slash[0][1];
const sLen = Math.hypot(sdx, sdy) || 1;
/** Unit vector along the K's diagonal cut (pointing up-right). */
export const SLASH_DIR: [number, number] = [sdx / sLen, sdy / sLen];
/** Unit normal pointing away from the K body (up-left). */
export const SLASH_NORMAL: [number, number] = [SLASH_DIR[1], -SLASH_DIR[0]];
export const SLASH = slash;

/**
 * The "kick": the K's cut fragment slides down its own diagonal and snaps
 * shut. Returns the offset from its resting place (lockup px).
 */
export function kickOffset(p: number): [number, number] {
  const e = 1 - ease.outExpo(p);
  return [
    e * (SLASH_DIR[0] * 88 + SLASH_NORMAL[0] * 22),
    e * (SLASH_DIR[1] * 88 + SLASH_NORMAL[1] * 22),
  ];
}
