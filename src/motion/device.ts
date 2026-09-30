import type { Composition, MotionConfig } from './config';
import { STORAGE_KEYS } from './config';

export type Tier = 'high' | 'medium' | 'low';

export interface DeviceProfile {
  composition: Composition;
  tier: Tier;
  /** Calm presentation: no intro, no loops, no parallax. */
  reducedMotion: boolean;
  /** Mouse/trackpad with hover — enables cursor reactions. */
  finePointer: boolean;
  /** Canvas pixel ratio after the per-composition cap and tier adjustment. */
  dpr: number;
  /** Density multiplier for particles/streaks (tier × intensity). */
  density: number;
  /** CSS/SVG filter effects (blur-to-sharp) are worth their cost on this device. */
  filters: boolean;
}

type NavigatorExtras = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** Width breakpoints only, so the canvas composition always matches the CSS layout. */
export function getComposition(width: number, config: MotionConfig): Composition {
  const { mobileBreakpoint, tabletBreakpoint } = config.layout;
  if (width < mobileBreakpoint) return 'mobile';
  if (width < tabletBreakpoint) return 'tablet';
  return 'desktop';
}

export function prefersReducedMotion(config: MotionConfig): boolean {
  if (config.reducedMotion === 'always') return true;
  if (config.reducedMotion === 'never') return false;
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced') {
    return true;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.motion);
    if (stored === 'reduced') return true;
    if (stored === 'full') return false;
  } catch {
    /* storage unavailable: fall through to the OS preference */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function detectDevice(config: MotionConfig): DeviceProfile {
  const nav = navigator as NavigatorExtras;
  const composition = getComposition(window.innerWidth, config);
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 8;
  const saveData = Boolean(nav.connection?.saveData);

  let tier: Tier = 'medium';
  if (saveData || cores <= 2 || memory <= 2 || (composition === 'mobile' && cores <= 4)) tier = 'low';
  else if (composition === 'desktop' && cores >= 8 && memory >= 8) tier = 'high';

  const finePointer =
    matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches;
  const tierDensity = tier === 'high' ? 1 : tier === 'medium' ? 0.8 : 0.5;
  const cap = config.layout.maxDpr[composition] * (tier === 'low' ? 0.75 : 1);

  return {
    composition,
    tier,
    reducedMotion: prefersReducedMotion(config),
    finePointer,
    dpr: Math.max(1, Math.min(window.devicePixelRatio || 1, cap)),
    density: tierDensity * Math.max(0.2, config.intensity),
    filters: tier === 'high' || (tier === 'medium' && composition !== 'mobile'),
  };
}
