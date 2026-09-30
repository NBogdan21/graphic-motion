import type { StageFrame, StageLayer } from '../stage/stage';
import { AccentsFx } from './fx/accents';
import { AtmosphereFx } from './fx/atmosphere';
import { DataFx } from './fx/data';
import { MomentumFx } from './fx/momentum';
import { ParticleFx } from './fx/particles';
import type { Fx } from './fx/shared';
import { SpeedFx } from './fx/speed';
import type { IntroSceneState } from './sceneState';

/**
 * The scripted intro as a single stage layer. Effects draw back to front and
 * read the shared scene state the director updates every frame.
 */
export class IntroSceneLayer implements StageLayer {
  readonly order = 50;
  readonly alwaysRender = true;
  private readonly fx: Fx[];
  private readonly particles = new ParticleFx();
  private lastFrame: StageFrame | null = null;

  constructor(private readonly st: IntroSceneState) {
    this.fx = [new AtmosphereFx(), new MomentumFx(), new DataFx(), new SpeedFx(), this.particles, new AccentsFx()];
  }

  resize(frame: StageFrame): void {
    this.lastFrame = frame;
    for (const fx of this.fx) fx.layout(frame, this.st);
  }

  /** Call once the lockup image has decoded, so particles can sample it. */
  imageReady(): void {
    if (this.lastFrame) this.particles.layout(this.lastFrame, this.st);
  }

  render(ctx: CanvasRenderingContext2D, frame: StageFrame, alpha: number): void {
    if (frame.width !== this.lastFrame?.width || frame.height !== this.lastFrame?.height) this.resize(frame);
    for (const fx of this.fx) fx.draw(ctx, frame, this.st, alpha);
  }
}
