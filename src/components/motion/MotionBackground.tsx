'use client';

import { useEffect, useRef } from 'react';
import { siteMotion } from '@/config/motion';
import { AmbientAtmosphereLayer } from '@/motion/ambient/layers';
import { defaultMotionConfig, mergeMotionConfig, type MotionConfigOverrides } from '@/motion/config';
import { getMotionRuntime } from '@/motion/runtime';
import styles from './MotionBackground.module.css';

export interface MotionBackgroundProps {
  /** Per-instance overrides on top of the site motion config. */
  config?: MotionConfigOverrides;
  /** 0..1.5 brightness/density of the ambient atmosphere. */
  intensity?: number;
  /** Animated film grain (automatically static for reduced motion). */
  grain?: boolean;
}

/**
 * The site's living background: one fixed canvas (shared by the intro,
 * ambient data and transitions) over a few cheap CSS layers — base gradient,
 * dot grid, a light that drifts toward the cursor, vignette and grain.
 * Mount once, in the root layout.
 */
export function MotionBackground({ config, intensity = 1, grain = true }: MotionBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  // Serialise so an inline `config` object doesn't re-attach the canvas each render.
  const configKey = JSON.stringify(config ?? null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runtime = getMotionRuntime();
    const overrides = JSON.parse(configKey) as MotionConfigOverrides | null;
    runtime.configure(mergeMotionConfig(mergeMotionConfig(defaultMotionConfig, siteMotion), overrides ?? undefined));
    runtime.stage.attach(canvas);
    const atmosphere = runtime.stage.add(new AmbientAtmosphereLayer(intensity), 0.8);

    const light = lightRef.current;
    const dots = dotsRef.current;
    const off = runtime.stage.onFrame((frame) => {
      const { pointer } = frame;
      if (light) {
        const x = frame.interactive ? pointer.px : frame.width * 0.5;
        const y = frame.interactive ? pointer.py : frame.height * 0.35;
        light.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        light.style.opacity = (0.35 + 0.65 * (frame.interactive ? pointer.presence : 0)).toFixed(3);
      }
      if (dots && frame.interactive) {
        dots.style.transform = `translate3d(${(pointer.x * -8).toFixed(2)}px, ${(pointer.y * -6).toFixed(2)}px, 0)`;
      }
    });
    return () => {
      off();
      atmosphere.remove(0);
      runtime.stage.detach();
    };
  }, [configKey, intensity]);

  return (
    <div className={styles.root} aria-hidden>
      <div className={styles.base} />
      <div ref={dotsRef} className={styles.dots} />
      <div className={styles.warm} />
      <div className={styles.cool} />
      <div ref={lightRef} className={styles.light} />
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.vignette} />
      {grain && <div className={styles.grain} />}
    </div>
  );
}
