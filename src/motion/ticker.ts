/**
 * One requestAnimationFrame loop for the whole site. Subscribers run in
 * priority order (lower first) so the intro director updates time before the
 * canvas stage draws, keeping DOM and canvas on the same frame.
 *
 * The loop only runs while something is subscribed, and the browser already
 * suspends rAF for hidden tabs.
 */

export interface TickFrame {
  /** rAF timestamp in ms. */
  now: number;
  /** Seconds since the previous frame, clamped so a stalled tab can't jump. */
  dt: number;
}

type TickFn = (frame: TickFrame) => void;
type Entry = { fn: TickFn; priority: number };

const MAX_DT = 1 / 15;

class Ticker {
  private entries: Entry[] = [];
  private raf = 0;
  private last = 0;
  /** Exponential moving average of frame duration, in ms. */
  frameMs = 16.7;

  add(fn: TickFn, priority = 0): () => void {
    this.entries.push({ fn, priority });
    this.entries.sort((a, b) => a.priority - b.priority);
    if (!this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.loop);
    }
    return () => this.remove(fn);
  }

  remove(fn: TickFn): void {
    this.entries = this.entries.filter((e) => e.fn !== fn);
    if (!this.entries.length && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private loop = (now: number): void => {
    const elapsed = this.last ? now - this.last : 16.7;
    this.last = now;
    if (elapsed < 250) this.frameMs += (elapsed - this.frameMs) * 0.08;
    const frame: TickFrame = { now, dt: Math.min(elapsed / 1000, MAX_DT) };
    // Snapshot: subscribers may unsubscribe (or add) while iterating.
    for (const entry of this.entries.slice()) entry.fn(frame);
    this.raf = this.entries.length ? requestAnimationFrame(this.loop) : 0;
  };
}

export const ticker = new Ticker();
