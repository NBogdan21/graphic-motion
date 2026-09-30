import { rgba } from '../../color';
import { clamp, ease, lerp, progress, pulse, wrap } from '../../math';
import { createRng } from '../../random';
import { resetTransform } from '../../stage/draw';
import { bandSprite, streakSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import { logoCenter, type IntroSceneState } from '../sceneState';
import { convergence, gaussian, speedLevel, speedTravel, type Fx } from './shared';

interface Slab {
  at: number;
  y: number;
  h: number;
  w: number;
  dir: 1 | -1;
}

/**
 * Scene 03 — momentum. Streaks accelerate across the frame (sideways on
 * desktop/tablet, upwards on mobile), orange diagonals cut through, and two
 * angular slabs wipe past like broadcast transitions. At the end everything
 * converges into a horizontal band of light: the line the logo is built on.
 */
export class SpeedFx implements Fx {
  private n = 0;
  private lane = new Float32Array(0);
  private len = new Float32Array(0);
  private vel = new Float32Array(0);
  private thick = new Float32Array(0);
  private phase = new Float32Array(0);
  private tone = new Uint8Array(0);
  private bright = new Float32Array(0);
  private diagonals = 0;
  private slabs: Slab[] = [];
  private vertical = false;

  layout(frame: StageFrame, st: IntroSceneState): void {
    const rng = createRng(0x5eed);
    const { composition } = frame;
    this.vertical = composition === 'mobile';
    const base = composition === 'desktop' ? 120 : composition === 'tablet' ? 80 : 44;
    const short = st.tl.mode === 'short' ? 0.6 : 1;
    this.n = Math.max(12, Math.round(base * Math.min(1.25, frame.density) * short));
    this.lane = new Float32Array(this.n);
    this.len = new Float32Array(this.n);
    this.vel = new Float32Array(this.n);
    this.thick = new Float32Array(this.n);
    this.phase = new Float32Array(this.n);
    this.tone = new Uint8Array(this.n);
    this.bright = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      // Lanes cluster around the band the logo will occupy.
      this.lane[i] = clamp(0.5 + gaussian(rng) * (this.vertical ? 0.24 : 0.2), 0.02, 0.98);
      this.len[i] = rng.range(70, 460);
      this.vel[i] = rng.range(2200, 5600);
      this.thick[i] = rng.range(0.8, 2.2);
      this.phase[i] = rng();
      this.tone[i] = rng.chance(0.2) ? 1 : 0;
      this.bright[i] = rng.range(0.25, 0.95);
    }
    this.diagonals = this.vertical ? 0 : Math.round(12 * Math.min(1.2, frame.density));
    const s = st.tl.speed;
    this.slabs = this.vertical
      ? [{ at: s.start + s.len * 0.55, y: 0.5, h: 0.5, w: 1.2, dir: -1 }]
      : st.tl.mode === 'short'
        ? []
        : [
            { at: s.start + s.len * 0.42, y: 0.44, h: 0.62, w: 0.3, dir: -1 },
            { at: s.start + s.len * 0.66, y: 0.58, h: 0.5, w: 0.22, dir: 1 },
          ];
  }

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    const { t, tl } = st;
    const s = tl.speed;
    const c = tl.construct;
    if (s.len <= 0 || t < s.start - 0.05 || t > c.start + c.len * 0.7) return;
    const { width: W, height: H, dpr, colors } = frame;
    const [cx, cy] = logoCenter(st.logo);
    const travel = speedTravel(t, tl);
    const level = speedLevel(t, tl);
    const conv = convergence(t, tl);
    const ramp = ease.outCubic(progress(t, s.start - s.len * 0.05, s.start + s.len * 0.55));
    const fade = 1 - ease.inCubic(progress(t, c.start + c.len * 0.05, c.start + c.len * 0.5));
    const visible = Math.floor(this.n * ramp);
    const ink = streakSprite(colors.ink);
    const hot = streakSprite(colors.brand, colors.brandHot);

    ctx.globalCompositeOperation = 'lighter';

    // --- main streak field ------------------------------------------------------
    for (let i = 0; i < visible; i++) {
      const len = (this.len[i] ?? 100) * (0.55 + level * 0.9);
      const span = (this.vertical ? H : W) + len * 2;
      const pos = wrap((this.phase[i] ?? 0) * span - travel * (this.vel[i] ?? 3000) - (t - s.start) * 160, span) - len;
      const laneFrac = this.lane[i] ?? 0.5;
      const th = (this.thick[i] ?? 1) * (1 + conv * 0.6);
      const a =
        alpha * fade * (this.bright[i] ?? 0.5) * clamp(0.25 + level * 1.2) * (this.tone[i] ? 0.9 : 0.75);
      if (a <= 0.01) continue;
      ctx.globalAlpha = Math.min(1, a);
      const sprite = this.tone[i] ? hot : ink;
      if (this.vertical) {
        const lx = lerp(laneFrac * W, cx + (laneFrac * W - cx) * 0.1, conv * 0.4);
        ctx.setTransform(0, -dpr, dpr, 0, lx * dpr, (pos + len / 2) * dpr);
      } else {
        const ly = lerp(laneFrac * H, cy + (laneFrac * H - cy) * 0.06, conv);
        ctx.setTransform(-dpr, 0, 0, dpr, (pos + len / 2) * dpr, ly * dpr);
      }
      ctx.drawImage(sprite, -len / 2, -th * 3, len, th * 6);
    }

    // --- orange diagonals -------------------------------------------------------
    const diagIn = progress(t, s.start + s.len * 0.3, s.start + s.len * 0.5);
    const diagOut = 1 - progress(t, s.end - s.len * 0.1, s.end + 0.15);
    if (this.diagonals && diagIn > 0 && diagOut > 0) {
      const angle = -0.28;
      for (let i = 0; i < this.diagonals; i++) {
        const len = 180 + ((i * 97) % 260);
        const span = W + H + len * 2;
        const pos = wrap(i * 0.137 * span - travel * (4200 + (i % 4) * 900), span) - len;
        const offset = ((i * 0.618) % 1) * H * 1.4 - H * 0.2;
        // Travel along the streak's own axis so it never appears to slide sideways.
        const x = pos;
        const y = offset + (W - pos) * Math.tan(-angle);
        ctx.globalAlpha = alpha * diagIn * diagOut * 0.55;
        const cos = Math.cos(angle) * dpr;
        const sin = Math.sin(angle) * dpr;
        ctx.setTransform(-cos, -sin, -sin, cos, x * dpr, y * dpr);
        ctx.drawImage(hot, -len / 2, -3, len, 6);
      }
    }
    resetTransform(ctx, dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // --- slabs: angular broadcast-style wipes -------------------------------------
    for (const slab of this.slabs) {
      const dur = Math.min(0.34, s.len * 0.26);
      const p = progress(t, slab.at, slab.at + dur);
      if (p <= 0 || p >= 1) continue;
      const e = ease.inOutExpo(p);
      const w = slab.w * W;
      const h = slab.h * H;
      const skew = h * 0.32;
      const x0 = slab.dir === -1 ? lerp(W + skew, -w - skew, e) : lerp(-w - skew, W + skew, e);
      const yTop = slab.y * H - h / 2;
      const lead = slab.dir === -1 ? x0 : x0 + w;
      ctx.fillStyle = rgba(colors.ink, 0.035 * alpha);
      ctx.beginPath();
      ctx.moveTo(x0 + skew, yTop);
      ctx.lineTo(x0 + w + skew, yTop);
      ctx.lineTo(x0 + w, yTop + h);
      ctx.lineTo(x0, yTop + h);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(colors.brand, 0.9 * alpha);
      ctx.beginPath();
      ctx.moveTo(lead + skew, yTop);
      ctx.lineTo(lead, yTop + h);
      ctx.stroke();
      const trail = slab.dir === -1 ? x0 + w : x0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(colors.ink, 0.3 * alpha);
      ctx.beginPath();
      ctx.moveTo(trail + skew, yTop);
      ctx.lineTo(trail, yTop + h);
      ctx.stroke();
    }

    // --- the band the logo is built on ------------------------------------------
    const bandA = pulse(t, s.end - s.len * 0.3, c.start + c.len * 0.55, 0.35);
    if (bandA > 0.01) {
      const bandW = W * (0.35 + conv * 0.85);
      const bandH = st.logo.h * lerp(1.7, 0.9, conv);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bandA * 0.42 * alpha;
      ctx.drawImage(bandSprite(colors.brand), cx - bandW / 2, cy - bandH / 2, bandW, bandH);
      ctx.globalAlpha = bandA * 0.5 * alpha;
      ctx.drawImage(bandSprite(colors.ink), cx - bandW * 0.4, cy - 1.5, bandW * 0.8, 3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
}
