import { rgba } from '../../color';
import { clamp, ease, progress, wrap } from '../../math';
import { createRng, hash } from '../../random';
import { drawScanLine, resetTransform, setFont } from '../../stage/draw';
import { glowSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import { logoCenter, type IntroSceneState } from '../sceneState';
import { exitLevel, speedLevel, speedTravel, type Fx } from './shared';

/** Width of the pre-hydration loader line (keep in sync with LogoIntro.module.css). */
export const LOADER_LINE_VW = { desktop: 22, tablet: 30, mobile: 46 } as const;

const MINUTES = ["0'", "15'", "30'", "45'", "60'", "75'", "90'"];

/** The match-minute rulers sit this far above and below the logo centre (fraction of the height). */
const RULER_OFFSET = 0.4;

/**
 * Horizontal bands the rulers occupy (ticks, minute labels and parallax), as
 * [top, bottom] in CSS px, so other layers can keep their type off them.
 */
export function rulerBands(frame: StageFrame, logoCenterY: number): [number, number][] {
  // Desktop/tablet only: on a phone the rulers would crowd the market feed.
  if (frame.composition === 'mobile') return [];
  const top = logoCenterY - frame.height * RULER_OFFSET;
  const bottom = logoCenterY + frame.height * RULER_OFFSET;
  return [
    [top - 12, top + 20],
    [bottom - 19, bottom + 13],
  ];
}

interface Line {
  x: number;
  y: number;
  angle: number;
  delay: number;
  dashed: boolean;
}

/**
 * Scene 01 — a dark, nearly empty stage that feels alive: the loader line
 * stretches into a horizon, faint construction lines draw themselves, match-
 * minute rulers tick past, and a few specks of "data dust" drift.
 */
export class AtmosphereFx implements Fx {
  private n = 0;
  private dx = new Float32Array(0);
  private dy = new Float32Array(0);
  private dz = new Float32Array(0);
  private ds = new Float32Array(0);
  private lines: Line[] = [];

  layout(frame: StageFrame): void {
    const rng = createRng(0x1a7e);
    const { width: W, height: H, composition } = frame;
    const base = composition === 'desktop' ? 110 : composition === 'tablet' ? 80 : 44;
    this.n = Math.round(base * Math.min(1.2, frame.density));
    this.dx = new Float32Array(this.n);
    this.dy = new Float32Array(this.n);
    this.dz = new Float32Array(this.n);
    this.ds = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.dx[i] = rng() * W;
      this.dy[i] = rng() * H;
      this.dz[i] = 0.25 + rng() * 0.75;
      this.ds[i] = rng();
    }
    this.lines =
      composition === 'mobile'
        ? [
            { x: 0.18, y: 0.5, angle: Math.PI / 2, delay: 0.1, dashed: false },
            { x: 0.82, y: 0.5, angle: Math.PI / 2, delay: 0.25, dashed: false },
            { x: 0.5, y: 0.5, angle: 1.05, delay: 0.4, dashed: true },
          ]
        : [
            { x: 0.3, y: 0.5, angle: 1.08, delay: 0.1, dashed: false },
            { x: 0.71, y: 0.5, angle: -1.02, delay: 0.3, dashed: false },
            { x: 0.5, y: 0.5, angle: Math.PI / 2, delay: 0.5, dashed: true },
          ];
  }

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    const { t, tl } = st;
    const { width: W, height: H, dpr, colors, composition } = frame;
    const a = tl.atmosphere;
    const [, cy] = logoCenter(st.logo);
    const exit = 1 - exitLevel(t, tl);
    const fadeForLogo = 1 - progress(t, tl.construct.start, tl.construct.start + tl.construct.len * 0.6) * 0.7;
    const travel = speedTravel(t, tl);
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;

    // --- horizon: the loader line stretches across the screen ---------------
    const loaderW = (LOADER_LINE_VW[composition] / 100) * W;
    const grow = ease.inOutCubic(progress(t, a.start, a.start + Math.max(0.25, a.len * 0.5)));
    const half = (loaderW + (W * 1.05 - loaderW) * grow) / 2;
    const lineAlpha = (0.38 - 0.26 * grow) * alpha * exit * (1 - progress(t, tl.speed.start, tl.speed.end) * 0.6);
    ctx.fillStyle = rgba(colors.ink, lineAlpha);
    ctx.fillRect(W / 2 - half, cy - 0.5, half * 2, 1);
    if (grow > 0 && grow < 1) {
      const glint = glowSprite(colors.ink, 64);
      const g = (1 - grow) * 0.9 * alpha;
      ctx.globalAlpha = g;
      ctx.drawImage(glint, W / 2 - half - 16, cy - 16, 32, 32);
      ctx.drawImage(glint, W / 2 + half - 16, cy - 16, 32, 32);
      ctx.globalAlpha = 1;
    }

    // --- construction lines draw themselves ----------------------------------
    const linesIn = progress(t, a.start + a.len * 0.25, a.end + tl.data.len * 0.4);
    const linesOut = 1 - progress(t, tl.speed.start, tl.speed.start + tl.speed.len * 0.6);
    const lineLevel = 0.07 * alpha * linesOut * exit;
    if (lineLevel > 0.002 && linesIn > 0) {
      ctx.lineWidth = 1;
      const reach = Math.hypot(W, H);
      for (const line of this.lines) {
        const p = ease.inOutCubic(clamp((linesIn - line.delay) / (1 - line.delay)));
        if (p <= 0) continue;
        const cx = line.x * W + px * 6;
        const ly = line.y * H + py * 4;
        const ux = Math.cos(line.angle) * reach * 0.5 * p;
        const uy = Math.sin(line.angle) * reach * 0.5 * p;
        ctx.strokeStyle = rgba(colors.ink, lineLevel);
        ctx.setLineDash(line.dashed ? [2, 7] : []);
        ctx.beginPath();
        ctx.moveTo(cx - ux, ly - uy);
        ctx.lineTo(cx + ux, ly + uy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // --- match-minute rulers (content drifts left, faster with the speed field) --
    const rulerIn = ease.outCubic(progress(t, a.start + a.len * 0.35, a.end));
    const rulerLevel = rulerIn * alpha * exit * fadeForLogo;
    if (rulerLevel > 0.01 && composition !== 'mobile') {
      const offset = H * RULER_OFFSET;
      const scroll = t * 14 + travel * 2600;
      const minor = 16;
      const major = minor * 5;
      setFont(ctx, 9.5, frame.font, 500);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const dir of [-1, 1] as const) {
        const y = cy + dir * offset + py * 5 * dir;
        const drift = -scroll * (dir === -1 ? 1 : 0.6);
        ctx.fillStyle = rgba(colors.ink, 0.07 * rulerLevel);
        ctx.fillRect(0, y, W, 1);
        const tickTop = (len: number) => (dir === -1 ? y - len : y + 1);
        for (let k = Math.floor((-major - drift) / major); ; k++) {
          const x = k * major + drift;
          if (x > W + major) break;
          ctx.fillStyle = rgba(colors.ink, 0.16 * rulerLevel);
          ctx.fillRect(x, tickTop(7), 1, 7);
          for (let j = 1; j < 5; j++) ctx.fillRect(x + j * minor, tickTop(3), 1, 3);
          ctx.fillStyle = rgba(colors.ink, 0.22 * rulerLevel);
          ctx.fillText(MINUTES[wrap(k, MINUTES.length)] ?? '', x, dir === -1 ? y + 5 : y - 14);
        }
      }
    }

    // --- data dust --------------------------------------------------------------
    const dustIn = progress(t, a.start + a.len * 0.1, a.end);
    const dustLevel = dustIn * alpha * exit * fadeForLogo;
    if (dustLevel > 0.01) {
      const streak = speedLevel(t, tl);
      ctx.fillStyle = rgba(colors.ink, 1);
      ctx.strokeStyle = rgba(colors.ink, 1);
      ctx.lineWidth = 1;
      for (let i = 0; i < this.n; i++) {
        const z = this.dz[i] ?? 0.5;
        const seed = this.ds[i] ?? 0;
        const x = wrap((this.dx[i] ?? 0) - travel * 2200 * z + px * 12 * z, W);
        const y = wrap((this.dy[i] ?? 0) - t * (5 + 12 * z) + py * 8 * z, H);
        const twinkle = 0.55 + 0.45 * Math.sin(t * (1.1 + seed) + seed * 40);
        const flick = hash(i, Math.floor(t * 12)) > 0.985 ? 1.8 : 1;
        ctx.globalAlpha = Math.min(1, dustLevel * z * twinkle * 0.55 * flick);
        if (streak > 0.08) {
          const len = streak * 90 * z;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y);
          ctx.stroke();
        } else {
          const s = 0.8 + z * 1.2;
          ctx.fillRect(x, y, s, s);
        }
      }
      ctx.globalAlpha = 1;
    }

    // --- one slow scan pass through the dark ------------------------------------
    const scan = progress(t, a.start + a.len * 0.35, a.end + tl.data.len * 0.2);
    if (scan > 0 && scan < 1) drawScanLine(ctx, W, ease.inOutQuad(scan) * H, colors.ink, 0.6 * alpha * Math.sin(scan * Math.PI));
    resetTransform(ctx, dpr);
  }
}
