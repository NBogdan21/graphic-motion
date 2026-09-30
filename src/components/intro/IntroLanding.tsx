'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { usePointerParallax, useStageWindow } from '@/components/motion/hooks';
import { replayIntro } from '@/components/motion/LogoIntro';
import { SportsDataBackground } from '@/components/motion/SportsDataBackground';
import { siteMotion } from '@/config/motion';
import { sizesFor } from '@/motion/boot';
import { defaultMotionConfig, mergeMotionConfig, restWidthOf } from '@/motion/config';
import { getMotionRuntime } from '@/motion/runtime';
import styles from './IntroLanding.module.css';

const motion = mergeMotionConfig(defaultMotionConfig, siteMotion);
const REST_SIZES = sizesFor(restWidthOf(motion), motion);

const subscribeMotion = (onChange: () => void) => getMotionRuntime().subscribe(onChange);
const readReduced = () => getMotionRuntime().device.reducedMotion;

/**
 * Where the intro comes to rest: the logo (the exact artwork, which the intro
 * lands on) over the living background — drifting sports data, occasional
 * trajectories, a light that follows the cursor. Visits with no intro (same
 * session, reduced motion) get a short scan-and-sweep reveal instead.
 */
export function IntroLanding() {
  const sectionRef = useRef<HTMLElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const [sweep, setSweep] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, readReduced, () => false);
  useStageWindow(sectionRef);
  usePointerParallax(logoRef, 4, 3);

  // Hover isn't available on touch: a light sweep greets the logo when it's tapped.
  useEffect(() => {
    if (!sweep) return;
    const id = window.setTimeout(() => setSweep(false), 1300);
    return () => window.clearTimeout(id);
  }, [sweep]);

  return (
    <section ref={sectionRef} className={styles.stage} aria-labelledby="logo-title">
      <SportsDataBackground density={0.9} intensity={0.5} clear={{ x: 0.5, y: 0.5, rx: 0.38, ry: 0.24 }} />
      <h1 id="logo-title" className={styles.title}>
        <span
          ref={logoRef}
          className={styles.logo}
          data-sweep={sweep || undefined}
          onPointerDown={(e) => e.pointerType !== 'mouse' && setSweep(true)}
        >
          <BrandLogo variant="lockup" anchor priority width="var(--km-rest-logo-w)" sizes={REST_SIZES} />
        </span>
      </h1>
      {!reduced && (
        <button
          type="button"
          className={styles.replay}
          data-enter
          style={{ '--enter': 2 } as CSSProperties}
          onClick={() => replayIntro()}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
            <path d="M4.2 2.3v2.8H7" />
          </svg>
          Replay intro
        </button>
      )}
    </section>
  );
}
