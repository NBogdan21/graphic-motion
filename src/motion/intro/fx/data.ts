import { createItem, drawItem, itemWidth, scatterItems, type DataItem, type ItemStyle } from '../../data/items';
import { clamp, ease, progress } from '../../math';
import { createRng } from '../../random';
import { drawScanLine, resetTransform } from '../../stage/draw';
import { streakSprite } from '../../stage/sprites';
import type { StageFrame } from '../../stage/stage';
import type { IntroSceneState } from '../sceneState';
import { speedLevel, speedTravel, type Fx } from './shared';

/**
 * Scene 02 — sports data decodes into the dark: odds, probabilities, goal
 * distributions, drift lines. A scan line sweeps through and brightens what it
 * touches. In scene 03 the data is pulled into motion and stretches into the
 * speed streaks (sideways on desktop, upwards like a feed on mobile).
 */
export class DataFx implements Fx {
  private items: DataItem[] = [];
  private vertical = false;

  layout(frame: StageFrame, st: IntroSceneState): void {
    const d = st.tl.data;
    if (d.len <= 0) {
      this.items = [];
      return;
    }
    const window: [number, number] = [d.start - d.len * 0.08, d.start + d.len * 0.62];
    this.vertical = frame.composition === 'mobile';
    if (this.vertical) {
      // Mobile: a two-column market feed that scrolls like a live list.
      const rng = createRng(0xfeed);
      const items: DataItem[] = [];
      const rows = 7;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          let fy = 0.1 + (r / (rows - 1)) * 0.8;
          if (Math.abs(fy - 0.5) < 0.075) fy += fy < 0.5 ? -0.05 : 0.05;
          const kind = (r + c) % 3 === 0 ? 'metric' : r === 3 && c === 1 ? 'spark' : 'odds';
          const appear = window[0] + ((r * 2 + c) / (rows * 2)) * (window[1] - window[0]);
          items.push(createItem(rng, kind, c === 0 ? 0.07 : 0.55, fy, appear));
        }
      }
      this.items = items;
    } else {
      const cols = frame.composition === 'desktop' ? 6 : 5;
      this.items = scatterItems(0xda7a, cols, 4, window);
    }
  }

  draw(ctx: CanvasRenderingContext2D, frame: StageFrame, st: IntroSceneState, alpha: number): void {
    if (!this.items.length) return;
    const { t, tl } = st;
    const { width: W, height: H, dpr, colors } = frame;
    const d = tl.data;
    const s = tl.speed;
    if (t < d.start - d.len * 0.1 || t > s.end + 0.2) return;

    const travel = speedTravel(t, tl);
    const level = speedLevel(t, tl);
    const fadeOut = 1 - ease.inQuad(progress(t, s.start + s.len * 0.12, s.start + s.len * 0.62));
    if (fadeOut <= 0) return;

    const style: ItemStyle = {
      font: frame.font,
      ink: colors.ink,
      brand: colors.brand,
      size: frame.composition === 'desktop' ? 14 : frame.composition === 'tablet' ? 12.5 : 11.5,
    };
    const scanP = progress(t, d.start + d.len * 0.22, d.end);
    const scanY = ease.inOutQuad(scanP) * H;
    const scanOn = scanP > 0 && scanP < 1;
    const px = frame.interactive ? frame.pointer.x : 0;
    const py = frame.interactive ? frame.pointer.y : 0;
    const streak = streakSprite(colors.ink);
    const streakHot = streakSprite(colors.brand, colors.brandHot);

    for (const item of this.items) {
      const life = progress(t, item.appear, item.appear + 0.55);
      if (life <= 0) continue;
      const depth = item.depth;
      const pull = travel * 2600 * (0.55 + depth * 0.9);
      let x = item.fx * W + px * 14 * depth;
      let y = item.fy * H + py * 8 * depth;
      if (this.vertical) y -= pull + (t - d.start) * 9;
      else x -= pull;

      const boost = scanOn ? clamp(1 - Math.abs(y - scanY) / 40) : 0;
      drawItem(ctx, item, x, y, life, t - item.appear, t, alpha * fadeOut, style, boost);

      // The data stretches into a light streak as it accelerates.
      if (level > 0.02) {
        const len = Math.min(this.vertical ? H * 0.6 : W * 0.5, 40 + level * 420 * depth);
        const w = itemWidth(item, style.size);
        ctx.globalAlpha = alpha * Math.min(1, level * 1.4) * (0.25 + depth * 0.55) * (1 - progress(t, s.end - 0.1, s.end + 0.25));
        const sprite = item.hot ? streakHot : streak;
        if (this.vertical) {
          ctx.setTransform(0, -dpr, dpr * 1, 0, (x + w * 0.35) * dpr, (y + len / 2 + 10) * dpr);
          ctx.drawImage(sprite, -len / 2, -4, len, 8);
        } else {
          ctx.setTransform(-dpr, 0, 0, dpr, (x + len / 2 + w * 0.6) * dpr, (y + style.size * 1.4) * dpr);
          ctx.drawImage(sprite, -len / 2, -4, len, 8);
        }
        resetTransform(ctx, dpr);
        ctx.globalAlpha = 1;
      }
    }

    if (scanOn) drawScanLine(ctx, W, scanY, colors.ink, alpha * Math.sin(scanP * Math.PI));
  }
}
