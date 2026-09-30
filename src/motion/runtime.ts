import {
  defaultMotionConfig,
  mergeMotionConfig,
  STORAGE_KEYS,
  type MotionConfig,
  type MotionConfigOverrides,
} from './config';
import { detectDevice, type DeviceProfile } from './device';
import { PointerTracker } from './pointer';
import { Stage } from './stage/stage';
import { ticker } from './ticker';

type Listener = (device: DeviceProfile) => void;

declare global {
  interface Window {
    /** Offline render hook (only with `?intro=…&render=1`): advance one frame. */
    __kmRender?: { step(dt?: number): void };
  }
}

/**
 * Client-side singleton that owns the shared motion state: configuration,
 * device profile, the smoothed pointer and the canvas stage. React components
 * are thin bindings over this object.
 */
export class MotionRuntime {
  config: MotionConfig = defaultMotionConfig;
  device: DeviceProfile;
  readonly pointer = new PointerTracker();
  readonly stage: Stage;
  /**
   * Video-export mode (`?intro=…&render=1`): the clock only advances through
   * `window.__kmRender.step()`, and quality is pinned to the highest tier.
   */
  readonly renderMode: boolean;
  private listeners = new Set<Listener>();
  private resizeRaf = 0;

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.renderMode = params.has('intro') && params.get('render') === '1';
    if (this.renderMode) {
      ticker.setManual(true);
      window.__kmRender = { step: (dt = 1 / 60) => ticker.step(dt) };
    }
    this.device = this.detect();
    this.stage = new Stage(() => this.device, () => this.config, this.pointer);
    window.addEventListener('resize', this.onResize, { passive: true });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', this.refresh);
    this.syncPointer();
  }

  configure(overrides?: MotionConfigOverrides): void {
    this.config = mergeMotionConfig(defaultMotionConfig, overrides);
    this.refresh();
  }

  /** In-site motion toggle; `null` returns control to the OS preference. */
  setMotionPreference(pref: 'reduced' | 'full' | null): void {
    try {
      if (pref) localStorage.setItem(STORAGE_KEYS.motion, pref);
      else localStorage.removeItem(STORAGE_KEYS.motion);
    } catch {
      /* storage unavailable: the preference lasts for this page view only */
    }
    const root = document.documentElement;
    if (pref === 'reduced') root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
    this.refresh();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh = (): void => {
    this.device = this.detect();
    document.documentElement.dataset.composition = this.device.composition;
    this.syncPointer();
    this.stage.refresh();
    for (const listener of this.listeners) listener(this.device);
  };

  private onResize = (): void => {
    cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      const prev = this.device;
      const next = this.detect();
      if (next.composition !== prev.composition || next.dpr !== prev.dpr) this.refresh();
    });
  };

  private detect(): DeviceProfile {
    const device = detectDevice(this.config);
    if (!this.renderMode) return device;
    // Exporting: best tier and full resolution regardless of the machine rendering it.
    return {
      ...device,
      tier: 'high',
      density: Math.max(0.2, this.config.intensity),
      filters: true,
      dpr: Math.min(window.devicePixelRatio || 1, 3),
    };
  }

  private syncPointer(): void {
    const d = this.device;
    if (this.config.interactive && d.finePointer && !d.reducedMotion) this.pointer.enable();
    else this.pointer.disable();
  }
}

let runtime: MotionRuntime | null = null;

/** Lazily creates the runtime (client only). */
export function getMotionRuntime(): MotionRuntime {
  if (typeof window === 'undefined') {
    throw new Error('The motion runtime is only available in the browser.');
  }
  runtime ??= new MotionRuntime();
  return runtime;
}
