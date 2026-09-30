import { partById, PARTS } from '@/brand/logo';
import { rgba } from '../../color';
import { clamp, ease, progress } from '../../math';
import { hash } from '../../random';
import { resetTransform } from '../../stage/draw';
import { glowSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import { DOT_CENTER, SCAN_ORDER, SLASH, dotFlight, kickOffset } from '../choreography';
import { logoCenter, logoScale, logoX, logoY, type IntroSceneState } from '../sceneState';
import type { Fx } from './shared';

const DOT = partById('i-dot').body;

/**
 * Light accents that sit exactly on the DOM letters: scan edges while each
 * letter opens, the glint when the K's cut closes, the i dot's tracked flight
 * and landing ripple, and the ignition shockwave.
 */
export class AccentsFx implements Fx {
  layout(): void {}

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    const { t, ch } = st;
    if (t < ch.particles.start - 0.2 || t > ch.ignite + 1) return;
    const { dpr, colors } = frame;
    const f = st.logo;
    const k = logoScale(f);

    ctx.globalCompositeOperation = 'lighter';

    // --- scan edges ------------------------------------------------------------
    for (const id of SCAN_ORDER) {
      const beat = ch.scan[id];
      if (!beat) continue;
      const p = progress(t, beat.start, beat.end);
      if (p <= 0 || p >= 1) continue;
      const part = PARTS.find((q) => q.id === id);
      if (!part) continue;
      const b = part.body;
      const open = ease.outExpo(p);
      const mid = b.y + b.h / 2;
      const top = logoY(f, mid - (b.h / 2) * open);
      const bottom = logoY(f, mid + (b.h / 2) * open);
      const x0 = logoX(f, b.x - 10);
      const x1 = logoX(f, b.x + b.w + 10);
      const a = alpha * Math.pow(1 - p, 0.6);
      const color = part.tone === 'brand' ? colors.brandHot : colors.ink;
      ctx.fillStyle = rgba(color, a * 0.95);
      ctx.fillRect(x0, top - 0.75, x1 - x0, 1.5);
      ctx.fillRect(x0, bottom - 0.75, x1 - x0, 1.5);
      ctx.fillStyle = rgba(color, a * 0.18);
      ctx.fillRect(x0, top - 4, x1 - x0, 8);
      ctx.fillRect(x0, bottom - 4, x1 - x0, 8);
    }

    // --- the kick: fragment trail + glint along the cut --------------------------
    {
      const p = progress(t, ch.kick.start, ch.kick.end);
      if (p > 0 && p < 1) {
        const [ox, oy] = kickOffset(p);
        const [sx, sy] = kickOffset(0);
        const cx = (SLASH[0][0] + SLASH[1][0]) / 2;
        const cy = (SLASH[0][1] + SLASH[1][1]) / 2;
        ctx.strokeStyle = rgba(colors.ink, alpha * 0.35 * (1 - p));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(logoX(f, cx + sx), logoY(f, cy + sy));
        ctx.lineTo(logoX(f, cx + ox), logoY(f, cy + oy));
        ctx.stroke();
      }
      const glint = progress(t, ch.kick.end - (ch.kick.end - ch.kick.start) * 0.25, ch.kick.end + 0.3);
      if (glint > 0 && glint < 1) {
        const ax = logoX(f, SLASH[0][0]);
        const ay = logoY(f, SLASH[0][1]);
        const bx = logoX(f, SLASH[1][0]);
        const by = logoY(f, SLASH[1][1]);
        const a = alpha * Math.sin(glint * Math.PI);
        ctx.strokeStyle = rgba(colors.ink, a);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax + (ax - bx) * 0.25, ay + (ay - by) * 0.25);
        ctx.lineTo(bx + (bx - ax) * 0.25, by + (by - ay) * 0.25);
        ctx.stroke();
        const g = glowSprite(colors.ink, 64);
        const u = ease.inOutCubic(glint);
        const gx = ax + (bx - ax) * u;
        const gy = ay + (by - ay) * u;
        ctx.globalAlpha = a;
        ctx.drawImage(g, gx - 22, gy - 22, 44, 44);
        ctx.globalAlpha = 1;
      }
    }

    // --- the i dot: tracked flight, landing ripple -------------------------------
    {
      const span = ch.dot.end - ch.dot.start;
      const p = progress(t, ch.dot.start, ch.dot.end);
      const r = (DOT.w / 2) * k;
      if (p > 0 && p < 1) {
        // ball-tracking dots behind the dot
        const samples = 22;
        for (let i = samples; i >= 1; i--) {
          const q = p - (i / samples) * 0.5;
          if (q <= 0) continue;
          const [ox, oy] = dotFlight(q);
          const a = alpha * (1 - i / samples) * 0.75;
          ctx.fillStyle = rgba(i % 5 === 0 ? colors.brandHot : colors.ink, a);
          const s = i % 5 === 0 ? 3 : 1.6;
          ctx.fillRect(logoX(f, DOT_CENTER[0] + ox) - s / 2, logoY(f, DOT_CENTER[1] + oy) - s / 2, s, s);
        }
        const [ox, oy] = dotFlight(p);
        const g = glowSprite(colors.ink, 64);
        ctx.globalAlpha = alpha * 0.55;
        const gr = r * 3.2;
        ctx.drawImage(g, logoX(f, DOT_CENTER[0] + ox) - gr, logoY(f, DOT_CENTER[1] + oy) - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      const since = t - ch.dot.end;
      const rippleLen = Math.max(0.3, span * 0.9);
      if (since > 0 && since < rippleLen) {
        const q = since / rippleLen;
        const x = logoX(f, DOT_CENTER[0]);
        const y = logoY(f, DOT_CENTER[1]);
        ctx.lineWidth = 1.25;
        for (let ring = 0; ring < 2; ring++) {
          const rq = clamp(q * 1.25 - ring * 0.25);
          if (rq <= 0 || rq >= 1) continue;
          ctx.strokeStyle = rgba(ring ? colors.brandHot : colors.ink, alpha * (1 - rq) * 0.8);
          ctx.beginPath();
          ctx.arc(x, y, r * (1.1 + ease.outCubic(rq) * 2.6), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // --- ignition shockwave ----------------------------------------------------------
    {
      const p = progress(t, ch.ignite, ch.ignite + 0.7);
      if (p > 0 && p < 1) {
        const [cx, cy] = logoCenter(f);
        const w = f.w * f.s;
        const h = f.h * f.s;
        const e = ease.outCubic(p);
        ctx.strokeStyle = rgba(colors.brandHot, alpha * 0.45 * (1 - p));
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (w / 2) * (1.02 + e * 0.5), (h / 2) * (1.1 + e * 1.4), 0, 0, Math.PI * 2);
        ctx.stroke();
        const rays = 30;
        ctx.strokeStyle = rgba(colors.ink, alpha * 0.5 * (1 - p));
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < rays; i++) {
          const ang = (i / rays) * Math.PI * 2 + hash(i, 7) * 0.2;
          const len = (24 + hash(i, 3) * 70) * e;
          const rx = (w / 2) * (1.05 + e * 0.35);
          const ry = (h / 2) * (1.2 + e * 1.1);
          const x0 = cx + Math.cos(ang) * rx;
          const y0 = cy + Math.sin(ang) * ry;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len * 0.6);
        }
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    resetTransform(ctx, dpr);
  }
}
