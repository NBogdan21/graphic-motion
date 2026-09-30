'use client';

import { useEffect, type RefObject } from 'react';
import { ease } from '@/motion/math';
import { getMotionRuntime } from '@/motion/runtime';

/**
 * Mark an element as a window onto the motion background. The shared canvas
 * only renders while at least one window is on screen, so pages with opaque
 * sections cost nothing once scrolled past the hero.
 */
export function useStageWindow(ref: RefObject<Element | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return getMotionRuntime().stage.registerWindow(el);
  }, [ref]);
}

const introActive = (): boolean => {
  const state = document.documentElement.dataset.introState;
  return state === 'pending' || state === 'playing' || state === 'handoff';
};

/**
 * Subtle cursor parallax (a few pixels) for an element, in sync with the stage
 * frame. Held at rest while the intro runs (the intro lands on this element)
 * and eased in afterwards; inert on touch devices and with reduced motion.
 */
export function usePointerParallax(ref: RefObject<HTMLElement | null>, x = 4, y = 3): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let engaged = 0;
    const off = getMotionRuntime().stage.onFrame((frame) => {
      if (!frame.interactive || introActive()) {
        engaged = 0;
        if (el.style.transform) el.style.transform = '';
        return;
      }
      engaged = Math.min(1, engaged + frame.dt / 1.2);
      const k = ease.inOutCubic(engaged);
      // Snap to whole device pixels so raster artwork (the logo) is never resampled.
      const ratio = window.devicePixelRatio || 1;
      const snap = (v: number) => Math.round(v * ratio) / ratio;
      el.style.transform = `translate3d(${snap(frame.pointer.x * x * k)}px, ${snap(frame.pointer.y * y * k)}px, 0)`;
    });
    return () => {
      off();
      el.style.transform = '';
    };
  }, [ref, x, y]);
}
