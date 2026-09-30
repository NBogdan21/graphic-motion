'use client';

import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { LOCKUP, LOGO, LOGO_ALT, PARTS, pctX, pctY } from '@/brand/logo';
import styles from './LogoReveal.module.css';

export interface LogoRevealHandle {
  /** The element whose layout box is the untransformed logo. */
  frame: HTMLDivElement | null;
  root: HTMLDivElement | null;
}

export interface LogoRevealProps {
  /** Resolved image URL (the lockup rendition the browser picked). */
  src: string;
  /** CSS width of the logo. */
  width?: string;
  className?: string;
}

const split = (LOGO.split / LOCKUP.h) * 100;
const polygon = (clip: [number, number][]) => `polygon(${clip.map(([x, y]) => `${x}% ${y}%`).join(',')})`;

/**
 * The logo rig: the untouched lockup image, split into letter windows for the
 * construction, plus the light layers used by the reveal (strokes, flash,
 * chromatic split, specular sweep, tagline caret, HUD brackets). Every visible
 * letter pixel comes from the original artwork. Driven frame-by-frame by the
 * IntroDirector (see src/motion/intro/rig.ts).
 */
export const LogoReveal = forwardRef<LogoRevealHandle, LogoRevealProps>(function LogoReveal(
  { src, width, className },
  ref,
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ frame: frameRef.current, root: rootRef.current }), []);

  const vars = {
    '--logo-w': width,
    '--logo-mask': `url("${src}")`,
    aspectRatio: `${LOCKUP.w} / ${LOCKUP.h}`,
  } as CSSProperties;

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      <div ref={frameRef} className={styles.frame} style={vars} data-rig-frame>
        <div className={styles.rig} data-rig>
          <div
            className={styles.glow}
            data-rig-glow
            style={{
              left: pctX(LOGO.glow.x),
              top: pctY(LOGO.glow.y),
              width: pctX(LOGO.glow.w),
              height: pctY(LOGO.glow.h),
            }}
          />
          <div className={styles.parts} aria-hidden>
            {PARTS.map((part) => (
              <div
                key={part.id}
                className={styles.part}
                data-part={part.id}
                style={{
                  left: pctX(part.rect.x),
                  top: pctY(part.rect.y),
                  width: pctX(part.rect.w),
                  height: pctY(part.rect.h),
                  clipPath: polygon(part.clip),
                }}
              >
                <div className={styles.scan}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- exact brand pixels */}
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    className={styles.partImg}
                    style={{
                      width: `${(LOCKUP.w / part.rect.w) * 100}%`,
                      left: `${(-part.rect.x / part.rect.w) * 100}%`,
                      top: `${(-part.rect.y / part.rect.h) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <svg
            className={styles.strokes}
            viewBox={`0 0 ${LOCKUP.w} ${LOCKUP.h}`}
            preserveAspectRatio="none"
            aria-hidden
            data-rig-strokes
          >
            {PARTS.map((part) => (
              <g key={part.id} data-tone={part.tone}>
                <path d={part.path} pathLength={1} data-stroke={part.id} data-kind="glow" />
                <path d={part.path} pathLength={1} data-stroke={part.id} data-kind="core" />
              </g>
            ))}
          </svg>
          <div className={styles.final}>
            {/* eslint-disable-next-line @next/next/no-img-element -- exact brand pixels */}
            <img
              src={src}
              alt={LOGO_ALT}
              draggable={false}
              className={styles.wordmark}
              style={{ clipPath: `inset(0 0 ${100 - split}% 0)` }}
              data-rig-wordmark
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- exact brand pixels */}
            <img src={src} alt="" draggable={false} className={styles.tagline} data-rig-tagline />
            <span className={styles.caret} data-rig-caret />
          </div>
          <div className={styles.flash} data-rig-flash style={{ clipPath: `inset(0 0 ${100 - split}% 0)` }} />
          <div className={`${styles.chroma} ${styles.chromaBrand}`} data-rig-chroma="brand" style={{ clipPath: `inset(0 0 ${100 - split}% 0)` }} />
          <div className={`${styles.chroma} ${styles.chromaInk}`} data-rig-chroma="ink" style={{ clipPath: `inset(0 0 ${100 - split}% 0)` }} />
          <div className={styles.sweep} data-rig-sweep>
            <i />
          </div>
        </div>
        <div className={styles.brackets} data-rig-brackets aria-hidden>
          <i data-corner="tl" />
          <i data-corner="tr" />
          <i data-corner="bl" />
          <i data-corner="br" />
        </div>
      </div>
    </div>
  );
});
