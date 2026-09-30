import type { Timeline } from '../config';
import { clamp, progress } from '../math';
import type { MotionRuntime } from '../runtime';
import type { LayerHandle } from '../stage/stage';
import { ticker, type TickFrame } from '../ticker';
import { choreograph, type Choreography } from './choreography';
import { LogoRigController, type FlightTarget, type RigTransform } from './rig';
import { IntroSceneLayer } from './scene';
import type { IntroSceneState } from './sceneState';

export type IntroPhase = 'playing' | 'handoff' | 'done';

export interface IntroDirectorOptions {
  runtime: MotionRuntime;
  timeline: Timeline;
  /** Element containing the rig markup. */
  root: HTMLElement;
  /** The rig frame: its layout box is the untransformed logo. */
  frame: HTMLElement;
  /** The decoded lockup image (particle targets are sampled from it). */
  image: HTMLImageElement;
  particleBudget: number;
  /** Where the logo should land in the page (null = fade out in place). */
  findAnchor: () => FlightTarget | null;
  onPhase: (phase: IntroPhase) => void;
  /** QA: hold the intro at this time. */
  freezeAt?: number | null;
  /** QA: extra playback rate. */
  rate?: number;
}

/** Seconds a skip takes to fast-forward to the landing. */
const SKIP_WARP = 0.55;

/**
 * Runs the brand intro: one clock drives the canvas scene and the DOM rig on
 * the same frame, flips the page through its phases, and lands the logo on its
 * anchor in the page. Skipping is a time-warp (fast-forward), not a cut.
 */
export class IntroDirector {
  readonly ch: Choreography;
  private t = 0;
  private rate: number;
  private warp = 0;
  private paused = false;
  private phase: IntroPhase | null = null;
  private readonly rig: LogoRigController;
  private readonly layer: IntroSceneLayer;
  private readonly state: IntroSceneState;
  private handle: LayerHandle | null = null;
  private frameRect: DOMRect;
  private landing: RigTransform | null = null;
  private landingVariant: FlightTarget['variant'] | null = null;
  private fadingLayer = false;
  /** No anchor to land on: the logo fades out in place instead. */
  private fadeInPlace = false;
  private disposed = false;

  constructor(private readonly o: IntroDirectorOptions) {
    this.ch = choreograph(o.timeline);
    this.rate = o.rate ?? 1;
    this.rig = new LogoRigController(o.root, o.runtime.device.filters);
    this.frameRect = o.frame.getBoundingClientRect();
    this.state = {
      t: 0,
      tl: o.timeline,
      ch: this.ch,
      logo: this.logoFrame({ tx: 0, ty: 0, s: 1 }),
      image: o.image,
      particleBudget: o.particleBudget,
    };
    this.layer = new IntroSceneLayer(this.state);
    if (o.freezeAt != null) this.t = clamp(o.freezeAt, 0, o.timeline.duration);
  }

  get time(): number {
    return this.t;
  }

  get duration(): number {
    return this.o.timeline.duration;
  }

  start(): void {
    const { stage } = this.o.runtime;
    stage.setAmbient(0);
    this.handle = stage.add(this.layer, 0);
    this.layer.imageReady();
    window.addEventListener('resize', this.measure);
    this.setPhase('playing');
    this.render();
    ticker.add(this.tick, 0);
  }

  /** Fast-forward to the landing. */
  skip(): void {
    const remaining = this.ch.flight.start - this.t;
    if (this.warp || remaining <= 0.1) return;
    this.paused = false;
    this.warp = Math.max(1, remaining / SKIP_WARP);
  }

  seek(t: number): void {
    this.t = clamp(t, 0, this.duration);
    this.render();
  }

  pause(): void {
    this.paused = true;
  }

  play(): void {
    this.paused = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ticker.remove(this.tick);
    window.removeEventListener('resize', this.measure);
    this.handle?.remove(0.3);
    this.o.runtime.stage.setAmbient(1, 0.6);
  }

  private measure = (): void => {
    this.frameRect = this.o.frame.getBoundingClientRect();
    if (this.landingVariant) this.computeLanding();
  };

  private tick = ({ dt }: TickFrame): void => {
    if (this.disposed) return;
    if (!this.paused && this.o.freezeAt == null) {
      let rate = this.rate;
      if (this.warp) {
        rate = this.t < this.ch.flight.start - 0.02 ? this.warp : 1.3;
      }
      this.t = Math.min(this.duration, this.t + dt * rate);
    }
    this.render();
  };

  private logoFrame(transform: RigTransform) {
    const r = this.frameRect;
    return { x: r.left, y: r.top, w: r.width, h: r.height, ...transform };
  }

  private computeLanding(): void {
    const target = this.o.findAnchor();
    this.landingVariant = target?.variant ?? 'lockup';
    this.landing = target
      ? LogoRigController.landing(this.frameRect, target)
      : { tx: 0, ty: 0, s: 0.94 };
    this.fadeInPlace = !target;
  }

  private render(): void {
    const { t, ch } = this;
    const tl = this.o.timeline;

    if (t >= ch.flight.start && !this.landing) this.computeLanding();
    if (t >= ch.siteReveal && this.phase === 'playing') {
      this.setPhase('handoff');
      this.o.runtime.stage.setAmbient(1, Math.max(0.4, tl.handoff.end - t));
    }
    if (t >= tl.handoff.start + tl.handoff.len * 0.3 && !this.fadingLayer) {
      this.fadingLayer = true;
      this.handle?.remove(Math.max(0.25, tl.handoff.len * 0.55));
    }

    const pointer = this.o.runtime.pointer;
    const interactive = this.o.runtime.config.interactive && this.o.runtime.device.finePointer;
    const flightP = this.landing ? progress(t, ch.flight.start, ch.flight.end) : 0;
    const transform = this.rig.apply(
      t,
      ch,
      this.frameRect.width,
      this.landing
        ? { target: this.landing, p: flightP, fadeTagline: this.landingVariant === 'wordmark' }
        : null,
      interactive ? { x: pointer.x, y: pointer.y } : { x: 0, y: 0 },
    );
    // (the frame, not the root: the rig root is display: contents and has no box)
    if (this.fadeInPlace) this.o.frame.style.opacity = String(1 - flightP);
    this.state.t = t;
    this.state.logo = this.logoFrame(transform);

    if (t >= this.duration && this.o.freezeAt == null) {
      this.setPhase('done');
      this.dispose();
    }
  }

  private setPhase(phase: IntroPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.o.onPhase(phase);
  }
}
