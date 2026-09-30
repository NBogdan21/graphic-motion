import type { Composition, MotionConfig } from '../config';
import type { DeviceProfile } from '../device';
import { clamp, ease } from '../math';
import type { PointerTracker } from '../pointer';
import { ticker, type TickFrame } from '../ticker';

/** Everything a layer needs to draw one frame. Distances are CSS pixels. */
export interface StageFrame {
  /** Stage clock in seconds (ambient time; the intro keeps its own clock). */
  time: number;
  dt: number;
  width: number;
  height: number;
  dpr: number;
  composition: Composition;
  /** Particle/streak multiplier: device tier × intensity × adaptive quality. */
  density: number;
  /** Render a single calm frame; layers should avoid motion-dependent looks. */
  reduced: boolean;
  pointer: PointerTracker;
  /** Cursor reactions allowed (fine pointer, interactive config, not reduced). */
  interactive: boolean;
  colors: MotionConfig['colors'];
  /** Resolved monospace font family for canvas text. */
  font: string;
}

export interface StageLayer {
  /** Paint order; lower draws first. */
  readonly order: number;
  /** Keep the stage rendering even when no page "window" onto it is visible. */
  readonly alwaysRender?: boolean;
  /**
   * Page-level background layer. Ambient layers are held back while the intro
   * plays and fade in at the handoff (see `Stage.setAmbient`).
   */
  readonly ambient?: boolean;
  resize?(frame: StageFrame): void;
  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void;
  dispose?(): void;
}

export interface LayerHandle {
  /** Fade out (seconds) and unmount. */
  remove(fade?: number): void;
  fadeTo(alpha: number, seconds: number): void;
}

interface Mounted {
  layer: StageLayer;
  level: number;
  target: number;
  rate: number;
  removing: boolean;
}

/** Frames above this budget (ms, smoothed) trigger a quality step-down. */
const SLOW_FRAME_MS = 24;
const FAST_FRAME_MS = 18;

/**
 * The single canvas behind the site. Layers (ambient atmosphere, sports data,
 * the intro scenes, transition bursts) register here and are composited in one
 * pass per frame, so there is exactly one canvas and one rAF loop.
 */
export class Stage {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private layers: Mounted[] = [];
  private running = false;
  private time = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private adaptive = 1;
  private slowFrames = 0;
  private fastFrames = 0;
  private windows = new Set<Element>();
  private visibleWindows = new Set<Element>();
  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private font = 'ui-monospace, monospace';
  private stillPending = false;
  private frameHooks = new Set<(frame: StageFrame) => void>();
  private ambientLevel = 1;
  private ambientTarget = 1;
  private ambientRate = Infinity;

  constructor(
    private readonly getDevice: () => DeviceProfile,
    private readonly getConfig: () => MotionConfig,
    private readonly pointer: PointerTracker,
  ) {}

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
    if (mono) this.font = mono;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.sync();
  }

  detach(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas = null;
    this.ctx = null;
    this.stop();
  }

  add(layer: StageLayer, fadeIn = 0.6): LayerHandle {
    const mounted: Mounted = {
      layer,
      level: fadeIn > 0 ? 0 : 1,
      target: 1,
      rate: fadeIn > 0 ? 1 / fadeIn : Infinity,
      removing: false,
    };
    this.layers.push(mounted);
    this.layers.sort((a, b) => a.layer.order - b.layer.order);
    if (this.width) layer.resize?.(this.frame(0));
    this.sync();
    return {
      remove: (fade = 0.6) => {
        mounted.removing = true;
        mounted.target = 0;
        mounted.rate = fade > 0 ? 1 / fade : Infinity;
        this.sync();
      },
      fadeTo: (alpha, seconds) => {
        mounted.target = clamp(alpha);
        mounted.rate = seconds > 0 ? Math.abs(mounted.target - mounted.level) / seconds : Infinity;
        this.sync();
      },
    };
  }

  /** A page region that shows the stage through a transparent background. */
  registerWindow(el: Element): () => void {
    this.observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) this.visibleWindows.add(entry.target);
        else this.visibleWindows.delete(entry.target);
      }
      this.sync();
    });
    this.windows.add(el);
    this.observer.observe(el);
    return () => {
      this.observer?.unobserve(el);
      this.windows.delete(el);
      this.visibleWindows.delete(el);
      this.sync();
    };
  }

  /**
   * Run `hook` after every rendered frame (DOM effects that must stay in sync
   * with the canvas, e.g. the cursor light or logo parallax).
   */
  onFrame(hook: (frame: StageFrame) => void): () => void {
    this.frameHooks.add(hook);
    return () => this.frameHooks.delete(hook);
  }

  /** Fade all ambient layers to `level` over `seconds` (the intro holds them at 0). */
  setAmbient(level: number, seconds = 0): void {
    this.ambientTarget = clamp(level);
    this.ambientRate = seconds > 0 ? Math.abs(this.ambientTarget - this.ambientLevel) / seconds : Infinity;
    if (this.ambientRate === Infinity) this.ambientLevel = this.ambientTarget;
  }

  /** Re-evaluate device/config (e.g. motion preference toggled). */
  refresh(): void {
    this.resize();
    this.sync();
  }

  private get shouldRun(): boolean {
    if (!this.ctx || !this.layers.length) return false;
    if (this.getDevice().reducedMotion) return false;
    if (document.visibilityState === 'hidden') return false;
    return this.visibleWindows.size > 0 || this.layers.some((m) => m.layer.alwaysRender);
  }

  private sync(): void {
    if (this.shouldRun) this.start();
    else {
      this.stop();
      if (this.getDevice().reducedMotion) this.requestStill();
    }
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    ticker.add(this.tick, 10);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private stop(): void {
    if (!this.running) return;
    this.running = false;
    ticker.remove(this.tick);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => this.sync();

  /** Reduced motion: draw one settled frame instead of animating. */
  private requestStill(): void {
    if (this.stillPending || !this.ctx) return;
    this.stillPending = true;
    requestAnimationFrame(() => {
      this.stillPending = false;
      for (const m of this.layers) m.level = m.removing ? 0 : 1;
      this.ambientLevel = this.ambientTarget = 1;
      this.layers = this.layers.filter((m) => {
        if (m.removing) m.layer.dispose?.();
        return !m.removing;
      });
      this.draw(this.frame(0, 6));
    });
  }

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const device = this.getDevice();
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = device.dpr;
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const frame = this.frame(0);
    for (const m of this.layers) m.layer.resize?.(frame);
    if (!this.running) this.sync();
  }

  private frame(dt: number, time = this.time): StageFrame {
    const device = this.getDevice();
    const config = this.getConfig();
    return {
      time,
      dt,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      composition: device.composition,
      density: device.density * this.adaptive,
      reduced: device.reducedMotion,
      pointer: this.pointer,
      interactive: config.interactive && device.finePointer && !device.reducedMotion,
      colors: config.colors,
      font: this.font,
    };
  }

  private tick = ({ dt }: TickFrame): void => {
    this.time += dt;
    this.pointer.update(dt);
    this.adapt();
    if (this.ambientLevel !== this.ambientTarget) {
      const step = this.ambientRate === Infinity ? 1 : this.ambientRate * dt;
      this.ambientLevel =
        this.ambientLevel < this.ambientTarget
          ? Math.min(this.ambientTarget, this.ambientLevel + step)
          : Math.max(this.ambientTarget, this.ambientLevel - step);
    }
    for (const m of this.layers) {
      if (m.level !== m.target) {
        const step = m.rate === Infinity ? 1 : m.rate * dt;
        m.level = m.level < m.target ? Math.min(m.target, m.level + step) : Math.max(m.target, m.level - step);
      }
    }
    const before = this.layers.length;
    this.layers = this.layers.filter((m) => {
      const done = m.removing && m.level <= 0;
      if (done) m.layer.dispose?.();
      return !done;
    });
    const frame = this.frame(dt);
    this.draw(frame);
    for (const hook of this.frameHooks) hook(frame);
    if (before !== this.layers.length) this.sync();
  };

  private draw(frame: StageFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const m of this.layers) {
      const gate = m.layer.ambient ? this.ambientLevel : 1;
      const alpha = ease.inOutQuad(m.level) * ease.inOutQuad(gate);
      if (alpha <= 0.001) continue;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      m.layer.render(ctx, frame, alpha);
      ctx.restore();
    }
  }

  /** Step density down when frames run long; recover slowly when they're fast. */
  private adapt(): void {
    const ms = ticker.frameMs;
    if (ms > SLOW_FRAME_MS) {
      this.fastFrames = 0;
      if (++this.slowFrames > 45 && this.adaptive > 0.45) {
        this.adaptive = Math.max(0.45, this.adaptive - 0.15);
        this.slowFrames = 0;
        // Struggling device (e.g. software compositing): also pause decorative CSS loops.
        if (this.adaptive <= 0.6) document.documentElement.dataset.motionLite = '';
      }
    } else if (ms < FAST_FRAME_MS) {
      this.slowFrames = 0;
      if (++this.fastFrames > 240 && this.adaptive < 1) {
        this.adaptive = Math.min(1, this.adaptive + 0.1);
        this.fastFrames = 0;
      }
    }
  }
}
