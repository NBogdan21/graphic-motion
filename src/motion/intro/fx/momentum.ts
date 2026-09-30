import { rgba } from '../../color';
import { clamp, ease, outsideRect, progress, quad, rectsOverlap, wrap, type Rect } from '../../math';
import { resetTransform, setFont } from '../../stage/draw';
import { glowSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import { logoCenter, type IntroSceneState } from '../sceneState';
import { exitLevel, type Fx } from './shared';

interface Arc {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
}

const STATS = ['P 0.62', 'P 0.71', 'P 0.84'];
/** Preferred points along the arc; each moves to the nearest spot that stays off the logo. */
const STAT_AT = [0.3, 0.55, 0.8];
/** Space kept between a probability point and the logo (clears the HUD brackets too). */
const STAT_KEEP_OUT = 28;

/**
 * Scene 06 — sports momentum around the settled logo: ball-flight
 * trajectories with tracked probability points, a perspective "centre circle"
 * orbiting the wordmark, velocity curves, chevrons driving outward, and faint
 * pitch geometry rushing beneath. Data + speed + sport + precision.
 */
export class MomentumFx implements Fx {
  private arcA: Arc = { x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0 };
  private arcB: Arc = { x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0 };
  private mobile = false;

  layout(frame: StageFrame): void {
    const { width: W, height: H } = frame;
    this.mobile = frame.composition === 'mobile';
    // Arc A flies over the logo and arc B under it: neither crosses the letters
    // (on a phone the lockup spans the width, so A stays above it).
    if (this.mobile) {
      this.arcA = { x0: -0.08 * W, y0: 0.38 * H, cx: 0.4 * W, cy: -0.06 * H, x1: 1.08 * W, y1: 0.26 * H };
      this.arcB = { x0: 1.06 * W, y0: 0.76 * H, cx: 0.4 * W, cy: 1.12 * H, x1: -0.08 * W, y1: 0.66 * H };
    } else {
      this.arcA = { x0: -0.04 * W, y0: 0.86 * H, cx: 0.2 * W, cy: -0.34 * H, x1: 1.04 * W, y1: 0.5 * H };
      this.arcB = { x0: 1.05 * W, y0: 0.74 * H, cx: 0.5 * W, cy: 1.06 * H, x1: -0.05 * W, y1: 0.62 * H };
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    const { t, tl } = st;
    const m = tl.momentum;
    if (m.len <= 0 || t < m.start - 0.3 || t > tl.handoff.end) return;
    const { width: W, height: H, dpr, colors } = frame;
    const [cx, cy] = logoCenter(st.logo);
    const lw = st.logo.w * st.logo.s;
    const lh = st.logo.h * st.logo.s;
    const exit = exitLevel(t, tl);
    const out = 1 - ease.inCubic(exit);
    const a = alpha * out;
    if (a <= 0.005) return;
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;

    // --- field geometry beneath the logo ------------------------------------------
    const fieldIn = ease.outCubic(progress(t, m.start - m.len * 0.1, m.start + m.len * 0.5));
    if (fieldIn > 0) {
      const horizon = cy + lh * (this.mobile ? 1.9 : 0.95);
      const depth = H - horizon;
      const vpX = W / 2 + px * 20;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(colors.ink, 0.07 * a * fieldIn);
      ctx.beginPath();
      const rays = this.mobile ? 6 : 10;
      for (let k = 0; k <= rays; k++) {
        const bx = W / 2 + (k / rays - 0.5) * W * (this.mobile ? 2.4 : 2.2);
        ctx.moveTo(vpX + (bx - vpX) * 0.08, horizon);
        ctx.lineTo(bx, H);
      }
      // cross lines rushing toward the viewer
      const rush = (t - m.start) * (1.6 + exit * 5);
      for (let k = 0; k < 7; k++) {
        const z = 1 + wrap(k - rush, 7);
        const y = horizon + depth * (1 / z) * 0.98;
        const spread = (y - horizon) / depth;
        ctx.moveTo(vpX - W * spread * 1.1, y);
        ctx.lineTo(vpX + W * spread * 1.1, y);
      }
      ctx.stroke();
    }

    // --- perspective rings around the logo -----------------------------------------
    const ringIn = ease.outCubic(progress(t, m.start - m.len * 0.05, m.start + m.len * 0.45));
    if (ringIn > 0) {
      const grow = 1 + exit * 0.25;
      const rx = Math.min(lw * (this.mobile ? 0.5 : 0.62), W * 0.47) * grow;
      const ry = this.mobile ? Math.min(rx * 0.92, H * 0.42) : lh * 0.98 * grow;
      const spin = (t - m.start) * 0.18;
      const start = -Math.PI / 2 + spin;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(colors.ink, 0.2 * a);
      ctx.beginPath();
      ctx.ellipse(cx + px * 4, cy + py * 3, rx, ry, 0, start, start + Math.PI * 2 * ringIn);
      ctx.stroke();
      // gauge ticks on the swept part
      ctx.strokeStyle = rgba(colors.ink, 0.28 * a);
      ctx.beginPath();
      const ticks = 48;
      for (let i = 0; i < ticks * ringIn; i++) {
        const ang = start + (i / ticks) * Math.PI * 2;
        const major = i % 6 === 0;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const inner = major ? 0.955 : 0.975;
        ctx.moveTo(cx + px * 4 + cos * rx, cy + py * 3 + sin * ry);
        ctx.lineTo(cx + px * 4 + cos * rx * inner, cy + py * 3 + sin * ry * inner);
      }
      ctx.stroke();
      // outer dashed ring, counter-rotating, brand colour
      const outerIn = ease.outCubic(progress(t, m.start + m.len * 0.08, m.start + m.len * 0.6));
      if (outerIn > 0) {
        ctx.setLineDash([2, 9]);
        ctx.lineDashOffset = -t * 30;
        ctx.strokeStyle = rgba(colors.brand, 0.45 * a);
        ctx.beginPath();
        const s2 = Math.PI / 2 - spin * 1.4;
        ctx.ellipse(cx + px * 7, cy + py * 5, rx * 1.14, ry * 1.18, 0, s2, s2 - Math.PI * 2 * outerIn, true);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // --- velocity curves ------------------------------------------------------------
    if (!this.mobile) {
      const curveIn = progress(t, m.start + m.len * 0.1, m.start + m.len * 0.7);
      if (curveIn > 0) {
        ctx.lineWidth = 1;
        const rows = [
          { y: cy - H * 0.3, amp: 14, wave: 420, speed: 2.4 },
          { y: cy + H * 0.27, amp: 10, wave: 300, speed: 3.1 },
          { y: cy + H * 0.35, amp: 18, wave: 520, speed: 1.8 },
        ];
        for (const [i, r] of rows.entries()) {
          const reach = W * ease.inOutCubic(clamp(curveIn * 1.3 - i * 0.12));
          if (reach <= 0) continue;
          ctx.strokeStyle = rgba(i === 1 ? colors.brand : colors.ink, (i === 1 ? 0.22 : 0.12) * a);
          ctx.beginPath();
          for (let x = 0; x <= reach; x += 8) {
            const y = r.y + Math.sin((x / r.wave) * Math.PI * 2 - t * r.speed) * r.amp * (0.4 + (x / W) * 0.6);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }

    // --- trajectories ---------------------------------------------------------------
    const logo: Rect = { x: cx - lw / 2, y: cy - lh / 2, w: lw, h: lh };
    const keepOut: Rect = {
      x: logo.x - STAT_KEEP_OUT,
      y: logo.y - STAT_KEEP_OUT,
      w: logo.w + STAT_KEEP_OUT * 2,
      h: logo.h + STAT_KEEP_OUT * 2,
    };
    this.trajectory(ctx, frame, this.arcA, t, m.start, m.start + m.len * 0.78, colors.ink, a, logo, keepOut);
    this.trajectory(ctx, frame, this.arcB, t, m.start + m.len * 0.22, m.start + m.len * 0.98, colors.brandHot, a * 0.85, logo, null);

    // --- chevrons driving outward ------------------------------------------------------
    const chevIn = progress(t, m.start + m.len * 0.3, m.start + m.len * 0.9);
    if (chevIn > 0 && chevIn < 1) {
      ctx.lineWidth = 1.5;
      const size = this.mobile ? 6 : 8;
      for (let i = 0; i < 3; i++) {
        const q = clamp(chevIn * 1.6 - i * 0.18);
        if (q <= 0 || q >= 1) continue;
        const travel = ease.outCubic(q) * 46;
        const fade = Math.sin(q * Math.PI);
        ctx.strokeStyle = rgba(colors.brand, 0.75 * a * fade);
        ctx.beginPath();
        if (this.mobile) {
          const yTop = cy - lh * 0.5 - 26 - i * 12 - travel;
          const yBot = cy + lh * 0.5 + 26 + i * 12 + travel;
          ctx.moveTo(cx - size, yTop + size * 0.6);
          ctx.lineTo(cx, yTop - size * 0.3);
          ctx.lineTo(cx + size, yTop + size * 0.6);
          ctx.moveTo(cx - size, yBot - size * 0.6);
          ctx.lineTo(cx, yBot + size * 0.3);
          ctx.lineTo(cx + size, yBot - size * 0.6);
        } else {
          const xl = cx - lw * 0.5 - 30 - i * 14 - travel;
          const xr = cx + lw * 0.5 + 30 + i * 14 + travel;
          ctx.moveTo(xl + size * 0.6, cy - size);
          ctx.lineTo(xl - size * 0.3, cy);
          ctx.lineTo(xl + size * 0.6, cy + size);
          ctx.moveTo(xr - size * 0.6, cy - size);
          ctx.lineTo(xr + size * 0.3, cy);
          ctx.lineTo(xr - size * 0.6, cy + size);
        }
        ctx.stroke();
      }
    }
    resetTransform(ctx, dpr);
  }

  /**
   * A ball-flight arc: tracked trail, glowing head and, when `stats` gives the
   * area to keep clear, probability points whose readouts never sit on the logo.
   * The arcs are laid out to pass the logo; should a viewport's proportions
   * still bring one across it, it fades out behind the lockup's box rather
   * than showing between the letters.
   */
  private trajectory(
    ctx: CanvasRenderingContext2D,
    frame: StageFrame,
    arc: Arc,
    t: number,
    start: number,
    end: number,
    color: string,
    a: number,
    logo: Rect,
    stats: Rect | null,
  ): void {
    const p = progress(t, start, end);
    const after = clamp((t - end) / 0.5);
    if (p <= 0 || after >= 1) return;
    const head = ease.inOutCubic(p);
    const trail = 0.34;
    const fade = a * (1 - after);
    const pt = (s: number): [number, number] => [quad(arc.x0, arc.cx, arc.x1, s), quad(arc.y0, arc.cy, arc.y1, s)];

    // trail: short segments brightening toward the head
    const segs = 26;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < segs; i++) {
      const s0 = head - trail * (1 - i / segs);
      const s1 = head - trail * (1 - (i + 1) / segs);
      if (s1 <= 0) continue;
      const [x0, y0] = pt(Math.max(0, s0));
      const [x1, y1] = pt(s1);
      const behind = outsideRect(logo, (x0 + x1) / 2, (y0 + y1) / 2, 14);
      if (behind <= 0) continue;
      ctx.strokeStyle = rgba(color, fade * behind * (i / segs) * 0.9);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // tracking dots along the full flown path
    ctx.fillStyle = rgba(color, fade * 0.35);
    for (let s = 0.02; s < head - trail * 0.6; s += 0.035) {
      const [x, y] = pt(s);
      if (outsideRect(logo, x, y, 14) > 0.5) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // head
    const [hx, hy] = pt(head);
    const headFade = fade * outsideRect(logo, hx, hy, 24);
    if (p < 1 && headFade > 0) {
      const g = glowSprite(color, 64);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = headFade;
      ctx.drawImage(g, hx - 18, hy - 18, 36, 36);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba('#ffffff', headFade);
      ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
    }
    if (!stats) return;
    const fontSize = frame.composition === 'mobile' ? 9.5 : 10.5;
    setFont(ctx, fontSize, frame.font, 500);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    STAT_AT.forEach((preferred, i) => {
      const at = statPoint(arc, preferred, ctx.measureText(STATS[i] ?? '').width, fontSize, stats, frame);
      if (at < 0 || head < at) return;
      const since = (head - at) / 0.12;
      const [x, y] = pt(at);
      const pop = ease.outCubic(clamp(since));
      ctx.strokeStyle = rgba(color, fade * (1 - clamp(since - 0.2)) * 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3 + pop * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba(i === STATS.length - 1 ? frame.colors.brand : color, fade);
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      ctx.fillStyle = rgba(i === STATS.length - 1 ? frame.colors.brand : color, fade * pop * 0.9);
      ctx.fillText(STATS[i] ?? '', x + 8, y - 6);
    });
  }
}

/**
 * The arc parameter nearest `preferred` where a probability point (its ring,
 * up to 10 px, and the readout to its upper right) stays clear of `keepOut`
 * and on screen; -1 if there is none nearby.
 */
function statPoint(arc: Arc, preferred: number, labelW: number, fontSize: number, keepOut: Rect, frame: StageFrame): number {
  const margin = 8;
  // preferred, then +0.01, -0.01, +0.02, … (later on the arc first)
  for (let j = 0; j <= 40; j++) {
    const s = preferred + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.01;
    if (s < 0.05 || s > 0.95) continue;
    const x = quad(arc.x0, arc.cx, arc.x1, s);
    const y = quad(arc.y0, arc.cy, arc.y1, s);
    const r = { x: x - 10, y: y - 6 - fontSize, w: 18 + labelW, h: 16 + fontSize };
    if (r.x < margin || r.y < margin || r.x + r.w > frame.width - margin || r.y + r.h > frame.height - margin) continue;
    if (!rectsOverlap(r, keepOut)) return s;
  }
  return -1;
}
