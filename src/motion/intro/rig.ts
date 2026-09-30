import { LOCKUP, LOGO, PARTS, TAGLINE, WORDMARK, type LogoPart, type PartId } from '@/brand/logo';
import { clamp, ease, lerp, progress, pulse, spring } from '../math';
import { hash } from '../random';
import { dotFlight, kickOffset, type Choreography } from './choreography';

/** Where the logo lands at the end of the intro (viewport px). */
export interface FlightTarget {
  variant: 'lockup' | 'wordmark';
  rect: DOMRect;
}

export interface RigTransform {
  tx: number;
  ty: number;
  s: number;
}

interface PartEls {
  part: LogoPart;
  win: HTMLElement;
  scan: HTMLElement;
}

interface StrokeEls {
  glow: SVGPathElement;
  core: SVGPathElement;
}

/** Scale applied while the letters assemble; the reveal punches it down to 1. */
const BUILD_SCALE = 1.045;
const f3 = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const pct = (v: number): string => `${f3(v)}%`;

/**
 * Applies the intro choreography to the logo rig's DOM every frame. Only
 * transform, opacity, clip-path and (on capable devices) blur are touched, and
 * each write is skipped when the value hasn't changed.
 */
export class LogoRigController {
  private readonly rig: HTMLElement;
  private readonly glow: HTMLElement | null;
  private readonly parts = new Map<PartId, PartEls>();
  private readonly strokes = new Map<PartId, StrokeEls>();
  private readonly svg: SVGSVGElement | null;
  private readonly wordmark: HTMLElement | null;
  private readonly tagline: HTMLElement | null;
  private readonly caret: HTMLElement | null;
  private readonly flash: HTMLElement | null;
  private readonly chromaBrand: HTMLElement | null;
  private readonly chromaInk: HTMLElement | null;
  private readonly sweep: HTMLElement | null;
  private readonly brackets: HTMLElement | null;
  private readonly cache = new WeakMap<Element, Record<string, string>>();
  private readonly glyphTimes: number[] = [];
  private glyphBeat = { start: -1, end: -1 };

  constructor(
    private readonly root: HTMLElement,
    private readonly filters: boolean,
  ) {
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T & Element>(sel) as T | null;
    const rig = q('[data-rig]');
    if (!rig) throw new Error('Logo rig markup missing');
    this.rig = rig;
    this.glow = q('[data-rig-glow]');
    this.svg = q<SVGSVGElement>('[data-rig-strokes]');
    this.wordmark = q('[data-rig-wordmark]');
    this.tagline = q('[data-rig-tagline]');
    this.caret = q('[data-rig-caret]');
    this.flash = q('[data-rig-flash]');
    this.chromaBrand = q('[data-rig-chroma="brand"]');
    this.chromaInk = q('[data-rig-chroma="ink"]');
    this.sweep = q('[data-rig-sweep] > i');
    this.brackets = q('[data-rig-brackets]');
    for (const part of PARTS) {
      const win = q(`[data-part="${part.id}"]`);
      const scan = win?.firstElementChild as HTMLElement | null;
      if (win && scan) this.parts.set(part.id, { part, win, scan });
      const glow = q<SVGPathElement>(`[data-stroke="${part.id}"][data-kind="glow"]`);
      const core = q<SVGPathElement>(`[data-stroke="${part.id}"][data-kind="core"]`);
      if (glow && core) this.strokes.set(part.id, { glow, core });
    }
  }

  private set(el: Element | null, prop: string, value: string): void {
    if (!el) return;
    let c = this.cache.get(el);
    if (!c) {
      c = {};
      this.cache.set(el, c);
    }
    if (c[prop] === value) return;
    c[prop] = value;
    (el as HTMLElement).style.setProperty(prop, value);
  }

  private show(el: Element | null, on: boolean): void {
    this.set(el, 'visibility', on ? 'visible' : 'hidden');
  }

  /** Base transform of the rig at time t (before the flight to the page). */
  transformAt(t: number, ch: Choreography): RigTransform {
    let s = BUILD_SCALE;
    if (t >= ch.settle.start) {
      s = BUILD_SCALE + (1 - BUILD_SCALE) * spring(t - ch.settle.start, 2.1, 7.5);
    }
    s *= 1 + 0.014 * ease.inOutQuad(progress(t, ch.momentum.start, ch.momentum.end + 1));
    return { tx: 0, ty: 0, s };
  }

  /**
   * Render the rig at time `t`. `flight` blends toward the landing transform;
   * `pointer` adds the idle micro-parallax once the logo is complete.
   */
  apply(
    t: number,
    ch: Choreography,
    frameWidth: number,
    flight: { target: RigTransform; p: number; fadeTagline: boolean } | null,
    pointer: { x: number; y: number },
  ): RigTransform {
    const base = this.transformAt(t, ch);
    const settled = progress(t, ch.ignite + 0.2, ch.ignite + 0.9);
    let { s } = base;
    let tx = pointer.x * 3.5 * settled;
    let ty = pointer.y * 2.5 * settled;
    const fp = flight ? ease.inOutCubic(flight.p) : 0;
    if (flight) {
      s = lerp(s, flight.target.s, fp);
      tx = lerp(tx, flight.target.tx, fp);
      ty = lerp(ty, flight.target.ty, fp);
    }
    this.set(this.rig, 'transform', `translate3d(${f3(tx)}px, ${f3(ty)}px, 0) scale(${f3(s)})`);
    const blur = this.filters ? 3 * (1 - progress(t, ch.ignite, ch.ignite + 0.18)) * (t >= ch.ignite ? 1 : 0) : 0;
    this.set(this.rig, 'filter', blur > 0.05 ? `blur(${f3(blur)}px)` : 'none');

    const ignited = t >= ch.ignite;
    this.parts_(t, ch, ignited);
    this.strokes_(t, ch, frameWidth);

    // Final artwork: the untouched lockup image, split at the tagline.
    this.show(this.wordmark, ignited);
    this.tagline_(t, ch, flight?.fadeTagline ? fp : 0);

    // Ignition: white-hot flash cooling into the true colours, a chromatic split.
    const flashP = progress(t, ch.flash.start, ch.flash.end);
    this.set(this.flash, 'opacity', ignited && flashP < 1 ? f3(0.92 * (1 - ease.outCubic(flashP))) : '0');
    const chroma = progress(t, ch.chroma.start, ch.chroma.end);
    const ce = ease.outCubic(chroma);
    const chromaOn = ignited && chroma < 1;
    this.set(this.chromaBrand, 'opacity', chromaOn ? f3(0.55 * (1 - ce)) : '0');
    this.set(this.chromaInk, 'opacity', chromaOn ? f3(0.4 * (1 - ce)) : '0');
    this.set(this.chromaBrand, 'transform', `translate3d(${pct(-1.3 * (1 - ce))}, 0, 0)`);
    this.set(this.chromaInk, 'transform', `translate3d(${pct(1.3 * (1 - ce))}, 0, 0)`);

    // Specular sweep.
    const sw = progress(t, ch.sweep.start, ch.sweep.end);
    this.set(this.sweep, 'transform', `translate3d(${pct(-130 + 480 * ease.inOutCubic(sw))}, 0, 0) skewX(-14deg)`);
    this.set(this.sweep, 'opacity', sw > 0 && sw < 1 ? '1' : '0');

    // Bloom.
    const build = 0.1 * progress(t, ch.scan.k?.start ?? ch.ignite - 1, ch.ignite);
    const burst = 0.42 * pulse(t, ch.ignite - 0.04, ch.ignite + 0.75, 0.06);
    const rest = 0.12 * progress(t, ch.ignite + 0.2, ch.ignite + 0.8);
    this.set(this.glow, 'opacity', f3(Math.max(build, burst, rest) * (1 - fp)));
    this.set(this.glow, 'transform', `scale(${f3(0.94 + 0.1 * ease.outCubic(progress(t, ch.ignite, ch.ignite + 0.8)))})`);

    // HUD corner brackets lock on, breathe, then retract as the logo leaves.
    const bp = progress(t, ch.brackets.start, ch.brackets.end);
    const retract = flight ? ease.inCubic(clamp(flight.p * 2.2)) : 0;
    const k = ease.outExpo(bp) * (1 - retract);
    const breathe = 1 + 0.012 * Math.sin((t - ch.brackets.end) * 3) * progress(t, ch.brackets.end, ch.brackets.end + 0.4);
    this.set(this.brackets, '--k', f3(k));
    this.set(this.brackets, 'opacity', f3(clamp(bp * 3) * (1 - retract)));
    this.set(this.brackets, 'transform', `translate3d(${f3(tx)}px, ${f3(ty)}px, 0) scale(${f3(s * breathe)})`);

    return { tx, ty, s };
  }

  private parts_(t: number, ch: Choreography, ignited: boolean): void {
    for (const [id, els] of this.parts) {
      if (ignited) {
        this.show(els.win, false);
        continue;
      }
      const { part, win, scan } = els;
      if (id === 'k-cut') {
        const p = progress(t, ch.kick.start, ch.kick.end);
        this.show(win, p > 0);
        if (p <= 0) continue;
        const [ox, oy] = kickOffset(p);
        this.set(win, 'transform', `translate3d(${pct((ox / part.rect.w) * 100)}, ${pct((oy / part.rect.h) * 100)}, 0)`);
        const blur = this.filters ? 4 * (1 - ease.outExpo(p)) : 0;
        this.set(scan, 'filter', blur > 0.05 ? `blur(${f3(blur)}px)` : 'none');
        this.set(scan, 'opacity', f3(clamp(p * 5)));
        continue;
      }
      if (id === 'i-dot') {
        const p = progress(t, ch.dot.start, ch.dot.end);
        this.show(win, p > 0);
        if (p <= 0) continue;
        const [ox, oy] = dotFlight(p);
        this.set(win, 'transform', `translate3d(${pct((ox / part.rect.w) * 100)}, ${pct((oy / part.rect.h) * 100)}, 0)`);
        this.set(scan, 'opacity', f3(clamp(p * 8)));
        continue;
      }
      const beat = ch.scan[id];
      const p = beat ? progress(t, beat.start, beat.end) : 1;
      this.show(win, p > 0);
      if (p <= 0) continue;
      // Open from the letter's midline to its full window.
      const open = ease.outExpo(p);
      const mid = part.body.y + part.body.h / 2 - part.rect.y;
      const top = (mid * (1 - open) * 100) / part.rect.h;
      const bottom = ((part.rect.h - mid) * (1 - open) * 100) / part.rect.h;
      this.set(scan, 'clip-path', p >= 1 ? 'none' : `inset(${pct(top)} 0 ${pct(bottom)} 0)`);
      const blur = this.filters ? 6 * (1 - open) : 0;
      this.set(scan, 'filter', blur > 0.05 ? `blur(${f3(blur)}px)` : 'none');
    }
  }

  private strokes_(t: number, ch: Choreography, frameWidth: number): void {
    if (!this.svg || !this.strokes.size) return;
    // Stroke widths in lockup units that render as ~1.4 px / 6 px on screen.
    const unit = LOCKUP.w / Math.max(1, frameWidth);
    this.set(this.svg, '--core', f3(1.4 * unit));
    this.set(this.svg, '--glow', f3(6 * unit));
    for (const [id, els] of this.strokes) {
      const beat = ch.strokes[id];
      if (!beat) {
        this.set(els.core, 'opacity', '0');
        this.set(els.glow, 'opacity', '0');
        continue;
      }
      const p = progress(t, beat.start, beat.end);
      const landing =
        id === 'k-cut' ? ch.kick.end : id === 'i-dot' ? ch.dot.end : (ch.scan[id]?.end ?? ch.ignite);
      const fade = 1 - progress(t, landing - 0.05, landing + 0.3);
      const e = ease.inOutCubic(p);
      this.set(els.core, 'stroke-dashoffset', f3(1 - e));
      this.set(els.core, 'opacity', p > 0 ? f3(0.85 * fade) : '0');
      // a bright comet segment (dash 0.14, gap 1) riding just behind the drawing head
      this.set(els.glow, 'stroke-dashoffset', f3(1.28 - e));
      this.set(els.glow, 'opacity', p > 0 && p < 1 ? f3(0.9 * Math.sin(p * Math.PI) * fade) : '0');
    }
  }

  private tagline_(t: number, ch: Choreography, fade: number): void {
    if (!this.tagline) return;
    const glyphs = TAGLINE.glyphs;
    if (this.glyphBeat.start !== ch.tagline.start || this.glyphBeat.end !== ch.tagline.end) {
      // Reveal times: left to right with a little seeded irregularity, like typing.
      this.glyphBeat = { ...ch.tagline };
      this.glyphTimes.length = 0;
      const len = ch.tagline.end - ch.tagline.start;
      glyphs.forEach((_, i) => {
        const jitter = (hash(i, 11) - 0.5) * 0.6;
        this.glyphTimes.push(ch.tagline.start + ((i + 0.5 + jitter) / glyphs.length) * len * 0.92);
      });
    }
    let shown = 0;
    while (shown < glyphs.length && t >= (this.glyphTimes[shown] ?? Infinity)) shown++;
    const last = glyphs[shown - 1];
    const right = shown >= glyphs.length ? LOCKUP.w : last ? last.x + last.w + 6 : TAGLINE.x;
    const top = (LOGO.split / LOCKUP.h) * 100;
    this.show(this.tagline, shown > 0);
    this.set(this.tagline, 'clip-path', `inset(${pct(top)} ${pct(((LOCKUP.w - right) / LOCKUP.w) * 100)} 0 0)`);
    this.set(this.tagline, 'opacity', f3(1 - fade));

    // The caret sits on the next glyph slot, then blinks out.
    const next = glyphs[Math.min(shown, glyphs.length - 1)];
    const active = t >= ch.tagline.start && t < ch.tagline.end + 0.45;
    const blink = t > ch.tagline.end ? (Math.floor((t - ch.tagline.end) / 0.11) % 2 === 0 ? 1 : 0) : 1;
    if (!this.caret || !next) return;
    this.show(this.caret, active && blink > 0);
    if (!active) return;
    const cap = glyphs.reduce((m, g) => Math.max(m, g.h), 0);
    const capTop = glyphs.reduce((m, g) => Math.min(m, g.y), Infinity);
    const slotX = shown >= glyphs.length ? right + 4 : next.x;
    this.set(this.caret, 'left', pct((slotX / LOCKUP.w) * 100));
    this.set(this.caret, 'top', pct((capTop / LOCKUP.h) * 100));
    this.set(this.caret, 'width', pct((Math.max(10, next.w) / LOCKUP.w) * 100));
    this.set(this.caret, 'height', pct((cap / LOCKUP.h) * 100));
  }

  /** Transform that makes the rig land exactly on a page anchor. */
  static landing(frame: DOMRect, target: FlightTarget): RigTransform {
    const k = frame.width / LOCKUP.w;
    const frameCx = frame.left + frame.width / 2;
    const frameCy = frame.top + frame.height / 2;
    const anchorCx = target.rect.left + target.rect.width / 2;
    const anchorCy = target.rect.top + target.rect.height / 2;
    if (target.variant === 'lockup') {
      return { s: target.rect.width / frame.width, tx: anchorCx - frameCx, ty: anchorCy - frameCy };
    }
    const crop = WORDMARK.crop;
    const s = target.rect.width / (crop.w * k);
    const ox = (crop.x + crop.w / 2 - LOCKUP.w / 2) * k * s;
    const oy = (crop.y + crop.h / 2 - LOCKUP.h / 2) * k * s;
    return { s, tx: anchorCx - frameCx - ox, ty: anchorCy - frameCy - oy };
  }
}

