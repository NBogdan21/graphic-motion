import { LOCKUP_SRCSET, LOGO } from '@/brand/logo';
import { restWidthOf, STORAGE_KEYS, type Composition, type MotionConfig } from './config';

/**
 * Server-side helpers that turn the motion config into the two things the page
 * needs before first paint: CSS variables, and a tiny inline script that picks
 * the intro mode (full / short / none) from visit history and motion
 * preferences — so there is never a flash of the wrong state.
 */

/** `sizes` attribute matching a set of per-composition CSS widths. */
export function sizesFor(widths: Record<Composition, string>, config: MotionConfig): string {
  const { mobileBreakpoint, tabletBreakpoint } = config.layout;
  return `(max-width: ${mobileBreakpoint - 0.02}px) ${widths.mobile}, (max-width: ${
    tabletBreakpoint - 0.02
  }px) ${widths.tablet}, ${widths.desktop}`;
}

export function motionStyleVars(config: MotionConfig): string {
  const { colors, logo, layout } = config;
  const rest = restWidthOf(config);
  const vars = (c: Composition) => `--km-intro-logo-w:${logo.introWidth[c]};--km-rest-logo-w:${rest[c]}`;
  return [
    `:root{--km-brand:${colors.brand};--km-brand-hot:${colors.brandHot};--km-ink:${colors.ink};`,
    `--km-bg:${colors.background};--km-surface:${colors.surface};${vars('desktop')}}`,
    `@media (max-width:${layout.tabletBreakpoint - 0.02}px){:root{${vars('tablet')}}}`,
    `@media (max-width:${layout.mobileBreakpoint - 0.02}px){:root{${vars('mobile')}}}`,
  ].join('');
}

export function bootScript(config: MotionConfig): string {
  const settings = {
    autoplay: config.intro.autoplay,
    returning: config.intro.returning,
    session: config.intro.sameSession,
    days: config.intro.returningAfterDays,
    reduced: config.reducedMotion,
    keys: STORAGE_KEYS,
    srcset: LOCKUP_SRCSET,
    sizes: sizesFor(config.logo.introWidth, config),
    glow: LOGO.glow.src,
  };
  // ES5 on purpose: this runs before any bundle, in every browser.
  return `(function(){var d=document.documentElement,m='none',C=${JSON.stringify(settings)};
try{var q=new URLSearchParams(location.search).get('intro'),ls=localStorage,ss=sessionStorage,
p=ls.getItem(C.keys.motion),rm=C.reduced==='always'||(C.reduced==='user'&&(p==='reduced'||(p!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches)));
if(rm)d.setAttribute('data-motion','reduced');
if(q==='full'||q==='short'||q==='none')m=q;
else if(!C.autoplay||rm)m='none';
else if(ss.getItem(C.keys.sessionIntro))m=C.session;
else{var l=+ls.getItem(C.keys.lastIntro)||0;m=l&&Date.now()-l<C.days*864e5?C.returning:'full';}
}catch(e){m='none';}
d.setAttribute('data-intro',m);
if(m!=='none'){d.setAttribute('data-intro-state','pending');
var h=document.head,a=document.createElement('link');a.rel='preload';a.as='image';
a.setAttribute('imagesrcset',C.srcset);a.setAttribute('imagesizes',C.sizes);a.setAttribute('fetchpriority','high');h.appendChild(a);
var g=document.createElement('link');g.rel='preload';g.as='image';g.href=C.glow;h.appendChild(g);}
})();`;
}
