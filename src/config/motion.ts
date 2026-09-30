import type { MotionConfigOverrides } from '@/motion/config';

/**
 * Site-level motion settings. Anything here overrides the defaults in
 * src/motion/config.ts. For example:
 *
 *   export const siteMotion: MotionConfigOverrides = {
 *     intensity: 0.8,                                   // calmer effects
 *     intro: { duration: 8, returning: 'none' },        // 8 s intro; returning visitors skip it
 *     particles: { mobile: 380 },                       // lighter phone build
 *     colors: { brand: '#FC4D00' },                     // palette
 *     logo: { introWidth: { desktop: 'min(56vw, 840px)' } },
 *   };
 */
export const siteMotion: MotionConfigOverrides = {};
