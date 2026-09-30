'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LOCKUP, LOCKUP_SRCSET, LOGO_NAME } from '@/brand/logo';
import { siteMotion } from '@/config/motion';
import { sizesFor } from '@/motion/boot';
import {
  defaultMotionConfig,
  INTRO_FAILSAFE_MS,
  mergeMotionConfig,
  resolveTimeline,
  STORAGE_KEYS,
  type MotionConfigOverrides,
} from '@/motion/config';
import { IntroDirector, type IntroPhase } from '@/motion/intro/director';
import type { FlightTarget } from '@/motion/intro/rig';
import { getMotionRuntime } from '@/motion/runtime';
import { LogoReveal, type LogoRevealHandle } from './LogoReveal';
import styles from './LogoIntro.module.css';

export interface LogoIntroProps {
  /** Per-instance overrides on top of the site motion config. */
  config?: MotionConfigOverrides;
  /** Force the full intro's total length in seconds (scenes scale proportionally). */
  duration?: number;
}

type Status = 'idle' | 'loading' | 'playing' | 'done';

interface IntroQA {
  seek(t: number): void;
  pause(): void;
  play(): void;
  skip(): void;
  readonly time: number;
  readonly duration: number;
}

declare global {
  interface Window {
    __kmIntro?: IntroQA;
  }
}

function fontsReady(timeout: number): Promise<void> {
  return Promise.race([
    document.fonts?.ready.then(() => undefined) ?? Promise.resolve(),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);
}

/** Visible logo anchor in the page to land on: the hero lockup, else the header wordmark. */
function findAnchor(): FlightTarget | null {
  const onScreen = (sel: string): DOMRect | null => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight ? r : null;
  };
  const lockup = onScreen('[data-logo-anchor="lockup"]');
  if (lockup) return { variant: 'lockup', rect: lockup };
  const wordmark = onScreen('[data-logo-anchor="wordmark"]');
  return wordmark ? { variant: 'wordmark', rect: wordmark } : null;
}

function setPhase(phase: IntroPhase | 'done'): void {
  document.documentElement.dataset.introState = phase;
}

const noopSubscribe = () => () => {};

/** Crossfade from the intro's logo to the page's logo (must match the CSS). */
const LEAVE_MS = 260;

/** The intro the boot script queued for this page load, or 'none' (client only). */
function readBootMode(): 'full' | 'short' | 'none' {
  const { intro, introState } = document.documentElement.dataset;
  const pending = introState === 'pending' || introState === 'playing' || introState === 'handoff';
  return pending && (intro === 'full' || intro === 'short') ? intro : 'none';
}

function rememberVisit(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.lastIntro, String(Date.now()));
    sessionStorage.setItem(STORAGE_KEYS.sessionIntro, '1');
  } catch {
    /* storage unavailable: the intro may replay next time, which is harmless */
  }
}

/* ------------------------------------------------------------------------- */
/* Replay                                                                      */
/* ------------------------------------------------------------------------- */

let replayRun = 0;
const replayListeners = new Set<() => void>();
const subscribeReplay = (listener: () => void) => {
  replayListeners.add(listener);
  return () => replayListeners.delete(listener);
};

/** Play the intro again in place (no reload). */
export function replayIntro(mode: 'full' | 'short' = 'full'): void {
  const root = document.documentElement;
  root.dataset.intro = mode;
  root.dataset.introState = 'pending';
  replayRun += 1;
  replayListeners.forEach((listener) => listener());
}

/**
 * Full-screen brand intro. The inline boot script decides before first paint
 * whether it plays (first visit: full cut; returning: short cut; same session
 * or reduced motion: none). While assets load, a CSS-only loader line holds the
 * screen; the intro then grows out of that line and ends by landing the logo
 * exactly on its resting place in the page. `replayIntro()` plays it again.
 */
export function LogoIntro(props: LogoIntroProps) {
  const run = useSyncExternalStore(subscribeReplay, () => replayRun, () => 0);
  return <IntroPlayer key={run} replay={run > 0} {...props} />;
}

function IntroPlayer({ config, duration, replay }: LogoIntroProps & { replay: boolean }) {
  // null while server rendering / hydrating, then the mode the boot script chose.
  const bootMode = useSyncExternalStore(noopSubscribe, readBootMode, () => null);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const status: Status =
    ended || bootMode === 'none' ? 'done' : bootMode === null ? 'idle' : playing ? 'playing' : 'loading';
  const rigRef = useRef<LogoRevealHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const directorRef = useRef<IntroDirector | null>(null);
  const configKey = JSON.stringify(config ?? null);
  const merged = useMemo(
    () =>
      mergeMotionConfig(
        mergeMotionConfig(defaultMotionConfig, siteMotion),
        (JSON.parse(configKey) as MotionConfigOverrides | null) ?? undefined,
      ),
    [configKey],
  );
  const sizes = sizesFor(merged.logo.introWidth, merged);

  const finish = useCallback(() => {
    setPhase('done');
    setEnded(true);
  }, []);

  const onProbe = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const ready = () => setSrc(img.currentSrc || img.src);
      if (img.complete && img.naturalWidth) ready();
      else {
        img.addEventListener('load', ready, { once: true });
        img.addEventListener('error', finish, { once: true });
      }
    },
    [finish],
  );

  // Start once the rig is mounted with its image.
  useEffect(() => {
    if (!src) return;
    const handle = rigRef.current;
    const root = handle?.root;
    const frame = handle?.frame;
    if (!root || !frame) return;
    let cancelled = false;

    const run = async () => {
      const images = Array.from(root.querySelectorAll('img'));
      await Promise.all([...images.map((img) => img.decode().catch(() => undefined)), fontsReady(1500)]);
      if (cancelled) return;
      // Very slow first load: the CSS failsafe has already revealed the page — don't intrude.
      if (!replay && performance.now() > INTRO_FAILSAFE_MS - 250) {
        finish();
        return;
      }
      const runtime = getMotionRuntime();
      const mode = document.documentElement.dataset.intro === 'short' ? 'short' : 'full';
      const timeline = resolveTimeline(merged, runtime.device.composition, mode, duration);
      const params = new URLSearchParams(window.location.search);
      const qa = params.has('intro');
      const freeze = qa && params.has('t') ? Number(params.get('t')) : null;
      const rate = qa && params.has('rate') ? Number(params.get('rate')) : 1;

      window.scrollTo(0, 0);
      const director = new IntroDirector({
        runtime,
        timeline,
        root,
        frame,
        image: images[0] as HTMLImageElement,
        particleBudget: merged.particles[runtime.device.composition],
        findAnchor,
        onPhase: (phase) => {
          setPhase(phase);
          if (phase !== 'done') return;
          // The page's logo is now visible underneath: crossfade the rig away so
          // sub-pixel rounding between the two can never read as a pop.
          overlayRef.current?.setAttribute('data-leaving', '');
          window.setTimeout(() => setEnded(true), LEAVE_MS);
        },
        freezeAt: freeze,
        rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
      });
      directorRef.current = director;
      rememberVisit();
      director.start();
      setPlaying(true);
      if (qa) {
        window.__kmIntro = {
          seek: (t) => director.seek(t),
          pause: () => director.pause(),
          play: () => director.play(),
          skip: () => director.skip(),
          get time() {
            return director.time;
          },
          get duration() {
            return director.duration;
          },
        };
      }
    };
    void run();
    return () => {
      cancelled = true;
      directorRef.current?.dispose();
      directorRef.current = null;
    };
  }, [src, merged, duration, finish, replay]);

  // Esc skips.
  useEffect(() => {
    if (status !== 'playing' || !merged.intro.skippable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') directorRef.current?.skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, merged.intro.skippable]);

  if (status === 'done') return null;

  return (
    <div ref={overlayRef} className={styles.overlay} data-intro-overlay>
      <div className={styles.loader} data-state={status} aria-hidden>
        <span />
      </div>
      <p className={styles.srOnly} role="status">
        {status === 'playing' ? `${LOGO_NAME} intro` : `Loading ${LOGO_NAME}`}
      </p>
      {status !== 'idle' && !src && (
        // Lets the browser pick the lockup rendition (same srcset/sizes as the preload).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={onProbe}
          className={styles.probe}
          srcSet={LOCKUP_SRCSET}
          sizes={sizes}
          src={LOCKUP.src}
          alt=""
          fetchPriority="high"
        />
      )}
      {src && (
        <div className={styles.stage} aria-hidden>
          <LogoReveal ref={rigRef} src={src} width="var(--km-intro-logo-w)" />
        </div>
      )}
      {merged.intro.skippable && status === 'playing' && (
        <button type="button" className={styles.skip} onClick={() => directorRef.current?.skip()}>
          Skip intro <kbd>Esc</kbd>
        </button>
      )}
    </div>
  );
}
