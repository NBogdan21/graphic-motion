/**
 * Motion system configuration — the single place to tune the brand animation.
 *
 * Everything the intro, backgrounds, transitions and loaders do is derived from
 * this object: scene durations, intensity, particle counts, colours, logo size,
 * mobile behaviour, autoplay and reduced-motion policy. Components accept
 * partial overrides via props (see `mergeMotionConfig`).
 */

export type Composition = 'desktop' | 'tablet' | 'mobile';
export type IntroMode = 'full' | 'short' | 'none';

/** Seconds spent in each scene of the intro, in order. */
export interface SceneTiming {
  /** 01 — dark atmosphere, faint geometry, drifting light. */
  atmosphere: number;
  /** 02 — odds, probabilities, graphs decoding in. */
  data: number;
  /** 03 — acceleration: streaks, slabs, light trails. */
  speed: number;
  /** 04 — particles, light strokes and masked slices assemble the logo. */
  construct: number;
  /** 05 — ignition, overshoot, light sweep, tagline decode. */
  reveal: number;
  /** 06 — trajectories, rings and field geometry around the logo. */
  momentum: number;
  /** 07 — the logo lands in the page and the site builds in. */
  handoff: number;
}

export interface MotionConfig {
  /** Brand palette. Defaults are sampled from the master logo. */
  colors: {
    /** "Math" orange. */
    brand: string;
    /** Lighter orange for glows and light trails. */
    brandHot: string;
    /** "Kick" white. */
    ink: string;
    /** Page background (near-black, neutral). */
    background: string;
    /** Raised surfaces. */
    surface: string;
  };
  /** Global effect multiplier: 0.5 = calmer, 1 = as designed, 1.3 = louder. */
  intensity: number;
  intro: {
    /** Play the intro automatically on a first visit. */
    autoplay: boolean;
    /** Global time scale: 1 = as designed, 1.25 = 25 % faster. */
    speed: number;
    /** Force a total length (seconds) for the full intro; scenes scale proportionally. */
    duration: number | null;
    /** What a returning visitor sees. */
    returning: 'short' | 'none';
    /** A last visit older than this counts as a first visit again. */
    returningAfterDays: number;
    /** Landing on the site again within the same browser session. */
    sameSession: 'short' | 'none';
    /** Show a skip control (Esc also skips). */
    skippable: boolean;
    /** Full intro per composition — the mobile cut is its own edit, not a scaled desktop. */
    timing: Record<Composition, SceneTiming>;
    /** The returning-visitor cut. Scenes set to 0 are skipped. */
    shortTiming: SceneTiming;
  };
  /** Particles that assemble the logo (scaled by `intensity` and device tier). */
  particles: Record<Composition, number>;
  logo: {
    /** CSS width of the logo while the intro plays. */
    introWidth: Record<Composition, string>;
    /**
     * CSS width of the logo when the intro comes to rest (the page's own logo,
     * which the intro lands on). `null` = same as `introWidth`, so the final
     * frame is the artwork rendered at its native layout size (no scaling).
     */
    restWidth: Record<Composition, string> | null;
  };
  layout: {
    /** Below this viewport width the dedicated mobile composition is used. */
    mobileBreakpoint: number;
    /** Below this width (and above mobile) the tablet composition is used. */
    tabletBreakpoint: number;
    /** Upper bound for the canvas pixel ratio per composition. */
    maxDpr: Record<Composition, number>;
  };
  /**
   * 'user'   – follow the OS preference and the in-site motion toggle
   * 'always' – always use the calm, static presentation
   * 'never'  – ignore the preference (not recommended)
   */
  reducedMotion: 'user' | 'always' | 'never';
  /** Cursor-reactive light and parallax (fine pointers only). */
  interactive: boolean;
}

export const defaultMotionConfig: MotionConfig = {
  colors: {
    brand: '#FC4D00',
    brandHot: '#FF7A38',
    ink: '#FDFDFD',
    background: '#07080A',
    surface: '#0F1114',
  },
  intensity: 1,
  intro: {
    autoplay: true,
    speed: 1,
    duration: null,
    returning: 'short',
    returningAfterDays: 30,
    sameSession: 'none',
    skippable: true,
    timing: {
      desktop: { atmosphere: 1.5, data: 1.5, speed: 1.5, construct: 1.5, reveal: 1.5, momentum: 1.5, handoff: 1.0 },
      tablet: { atmosphere: 1.2, data: 1.4, speed: 1.3, construct: 1.5, reveal: 1.4, momentum: 1.3, handoff: 1.0 },
      mobile: { atmosphere: 0.9, data: 1.2, speed: 1.0, construct: 1.3, reveal: 1.25, momentum: 1.0, handoff: 0.9 },
    },
    shortTiming: { atmosphere: 0.2, data: 0, speed: 0.4, construct: 0.7, reveal: 0.8, momentum: 0, handoff: 0.8 },
  },
  particles: { desktop: 1400, tablet: 950, mobile: 520 },
  logo: {
    introWidth: { desktop: 'min(62vw, 920px)', tablet: '74vw', mobile: '86vw' },
    restWidth: null,
  },
  layout: {
    mobileBreakpoint: 768,
    tabletBreakpoint: 1100,
    maxDpr: { desktop: 2, tablet: 1.75, mobile: 1.5 },
  },
  reducedMotion: 'user',
  interactive: true,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type MotionConfigOverrides = DeepPartial<MotionConfig>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function mergeMotionConfig(
  base: MotionConfig,
  overrides: MotionConfigOverrides | undefined,
): MotionConfig {
  if (!overrides) return base;
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      if (value === undefined) continue;
      out[key] = isPlainObject(value) && isPlainObject(a[key]) ? merge(a[key], value) : value;
    }
    return out;
  };
  return merge(base as unknown as Record<string, unknown>, overrides as Record<string, unknown>) as unknown as MotionConfig;
}

/** Resolved resting width of the logo (falls back to the intro width). */
export const restWidthOf = (config: MotionConfig): Record<Composition, string> =>
  config.logo.restWidth ?? config.logo.introWidth;

/* ------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* ------------------------------------------------------------------------- */

export interface Span {
  start: number;
  end: number;
  len: number;
}

export type SceneName = keyof SceneTiming;

export const SCENES: readonly SceneName[] = [
  'atmosphere',
  'data',
  'speed',
  'construct',
  'reveal',
  'momentum',
  'handoff',
];

export type Timeline = Record<SceneName, Span> & {
  mode: Exclude<IntroMode, 'none'>;
  composition: Composition;
  duration: number;
};

/** Lays the scenes end to end and applies `speed` / `duration`. */
export function resolveTimeline(
  config: MotionConfig,
  composition: Composition,
  mode: Exclude<IntroMode, 'none'>,
  durationOverride?: number | null,
): Timeline {
  const base = mode === 'short' ? config.intro.shortTiming : config.intro.timing[composition];
  const natural = SCENES.reduce((sum, s) => sum + base[s], 0);
  const target = mode === 'full' ? (durationOverride ?? config.intro.duration) : null;
  const scale = target ? target / natural : 1 / Math.max(0.1, config.intro.speed);

  let cursor = 0;
  const spans = {} as Record<SceneName, Span>;
  for (const scene of SCENES) {
    const len = base[scene] * scale;
    spans[scene] = { start: cursor, end: cursor + len, len };
    cursor += len;
  }
  return { ...spans, mode, composition, duration: cursor };
}

/* ------------------------------------------------------------------------- */
/* Persistence keys (shared by the boot script and the runtime)               */
/* ------------------------------------------------------------------------- */

export const STORAGE_KEYS = {
  /** Timestamp of the last intro a visitor saw (localStorage). */
  lastIntro: 'km:intro:last',
  /** Set once per browser session (sessionStorage). */
  sessionIntro: 'km:intro:session',
  /** In-site motion preference: 'reduced' | 'full' (localStorage). */
  motion: 'km:motion',
} as const;

/** How long the pre-hydration loader waits for JS before revealing the page anyway. */
export const INTRO_FAILSAFE_MS = 6000;
