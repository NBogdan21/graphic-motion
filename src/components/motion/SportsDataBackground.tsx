'use client';

import { useEffect } from 'react';
import { AmbientArcsLayer, AmbientDataLayer, type ClearZone } from '@/motion/ambient/layers';
import { getMotionRuntime } from '@/motion/runtime';

export interface SportsDataBackgroundProps {
  /** 0..1.5 — number of data items on screen. */
  density?: number;
  /** 0..1 — brightness of the data. */
  intensity?: number;
  /** Occasional ball-flight arcs across the background. */
  arcs?: boolean;
  /** Region kept free of data so content stays readable (fractions of the viewport). */
  clear?: ClearZone;
  seed?: number;
}

/**
 * Abstract sports analytics drifting behind a section: odds, model
 * probabilities, goal distributions, drift lines. Renders into the shared
 * MotionBackground canvas (no extra canvas) while mounted; place it inside any
 * page whose hero shows the background through (see `useStageWindow`).
 */
export function SportsDataBackground({
  density = 1,
  intensity = 0.55,
  arcs = true,
  clear,
  seed,
}: SportsDataBackgroundProps) {
  const cx = clear?.x;
  const cy = clear?.y;
  const rx = clear?.rx;
  const ry = clear?.ry;

  useEffect(() => {
    const { stage } = getMotionRuntime();
    const zone = cx != null && cy != null && rx != null && ry != null ? { x: cx, y: cy, rx, ry } : undefined;
    const data = stage.add(new AmbientDataLayer({ density, intensity, clear: zone, seed }), 1.2);
    const arc = arcs ? stage.add(new AmbientArcsLayer(intensity + 0.1), 1.2) : null;
    return () => {
      data.remove(0.5);
      arc?.remove(0.5);
    };
  }, [density, intensity, arcs, seed, cx, cy, rx, ry]);

  return null;
}
