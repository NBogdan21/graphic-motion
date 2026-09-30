import { damp } from './math';

/**
 * Smoothed cursor position shared by every cursor-reactive effect.
 * Values are normalised to -1..1 around the viewport centre and eased with a
 * heavy lag, so reactions stay subtle and never jitter.
 */
export class PointerTracker {
  /** Smoothed position, -1..1 (0 = centre). */
  x = 0;
  y = 0;
  /** Smoothed position in CSS pixels (for the cursor light). */
  px = 0;
  py = 0;
  /** 0..1 — fades in while the cursor is over the page. */
  presence = 0;

  private tx = 0;
  private ty = 0;
  private tpx = 0;
  private tpy = 0;
  private inside = false;
  private enabled = false;

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.px = this.tpx = window.innerWidth / 2;
    this.py = this.tpy = window.innerHeight / 2;
    window.addEventListener('pointermove', this.onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onLeave);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('pointermove', this.onMove);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    this.inside = false;
    this.tx = this.ty = 0;
  }

  update(dt: number): void {
    const k = damp(3.2, dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    const kp = damp(6, dt);
    this.px += (this.tpx - this.px) * kp;
    this.py += (this.tpy - this.py) * kp;
    this.presence += ((this.inside ? 1 : 0) - this.presence) * damp(2.5, dt);
  }

  private onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.tpx = e.clientX;
    this.tpy = e.clientY;
    this.tx = (e.clientX / w) * 2 - 1;
    this.ty = (e.clientY / h) * 2 - 1;
    this.inside = true;
  };

  private onLeave = (): void => {
    this.inside = false;
    this.tx = 0;
    this.ty = 0;
  };
}
