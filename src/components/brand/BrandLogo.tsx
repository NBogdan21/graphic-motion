import type { CSSProperties } from 'react';
import { LOCKUP, LOCKUP_SRCSET, LOGO_ALT, LOGO_NAME, WORDMARK } from '@/brand/logo';
import styles from './BrandLogo.module.css';

export interface BrandLogoProps {
  /** 'lockup' = wordmark + tagline (hero); 'wordmark' = small sizes (header, footer). */
  variant?: 'lockup' | 'wordmark';
  /** CSS width. */
  width?: string;
  /** `sizes` for the lockup's responsive renditions. */
  sizes?: string;
  /** The intro lands here (`data-logo-anchor`). */
  anchor?: boolean;
  /** Load eagerly with high priority (above the fold). */
  priority?: boolean;
  /** Hover/focus light sweep. */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The logo as the untouched artwork (lossless crops of the master file, never
 * re-encoded by an image optimiser), with a light sweep on hover/focus.
 */
export function BrandLogo({
  variant = 'wordmark',
  width,
  sizes,
  anchor = false,
  priority = false,
  interactive = true,
  className,
  style,
}: BrandLogoProps) {
  const lockup = variant === 'lockup';
  const w = lockup ? LOCKUP.w : WORDMARK.crop.w;
  const h = lockup ? LOCKUP.h : WORDMARK.crop.h;
  const src = lockup ? LOCKUP.src : WORDMARK.src;
  const maskSrc = lockup ? (LOCKUP.renditions[0]?.src ?? LOCKUP.src) : WORDMARK.src;

  return (
    <span
      className={[styles.logo, interactive && styles.interactive, className].filter(Boolean).join(' ')}
      data-logo-anchor={anchor ? variant : undefined}
      data-variant={variant}
      style={
        {
          ...style,
          '--logo-w': width,
          '--mask': `url("${maskSrc}")`,
          aspectRatio: `${w} / ${h}`,
        } as CSSProperties
      }
    >
      {/* Exact brand pixels: served as-is, never re-encoded by an image optimiser. */}
      <img
        src={src}
        srcSet={lockup ? LOCKUP_SRCSET : undefined}
        sizes={lockup ? sizes : undefined}
        width={w}
        height={h}
        alt={lockup ? LOGO_ALT : LOGO_NAME}
        decoding={priority ? 'sync' : 'async'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        draggable={false}
      />
      {interactive && <span className={styles.sweep} aria-hidden />}
    </span>
  );
}
