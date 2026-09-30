# KickMath — brand intro

A premium, web-native logo intro for the KickMath sportsbook: dark atmosphere → sports data → speed → the logo assembling from light → reveal → sports momentum → the logo coming to rest over a living background. It is built from real web animation (Canvas 2D, CSS and DOM), not a video. Everything is time-driven and seekable, and it is tuned for 60 fps.

Your uploaded logo is the only brand asset used. Every letter on screen is a pixel of the original artwork (see [Logo fidelity](#logo-fidelity)).

```bash
npm install
npm run dev              # http://localhost:3000
npm run build && npm start
```

Stack: Next.js 16 (App Router) · React 19 · TypeScript. No animation libraries.

## The sequence

| Time (desktop) | Scene | What happens |
| --- | --- | --- |
| 0 – 1.5 s | **01 Atmosphere** | The loading line stretches into a horizon; construction lines draw themselves; match-minute rulers tick past; data dust drifts. |
| 1.5 – 3 s | **02 Sports data** | Odds, model probabilities (P(HOME) 0.542), Poisson goal distributions, drift lines and form guides decode in; a scan pass brightens what it touches. |
| 3 – 4.5 s | **03 Speed** | The data is pulled into motion and stretches into streaks; orange diagonals and two angular slab wipes cut through; everything converges into a band of light. |
| 4.5 – 6 s | **04 Construction** | ~1,400 particles, sampled from the logo image itself, stream in and lock into the letterforms. Light strokes trace each outline, and each letter scans open from its midline. The K's cut fragment "kicks" shut along its own diagonal, and the i-dot arrives on a tracked ball-flight arc. |
| 6 – 7.5 s | **05 Reveal** | White-hot ignition cooling to the true colours, blur-to-sharp, scale overshoot, chromatic split, specular light sweep, tagline decoding behind a caret, HUD brackets locking on. |
| 7.5 – 9 s | **06 Momentum** | Trajectory arcs with tracked probability points, a perspective "centre circle" orbiting the logo, velocity curves, chevrons, pitch geometry rushing beneath. |
| 9 – 10 s | **07 Settle** | Momentum clears and the logo lands on the page's own logo (a sub-pixel-exact FLIP plus a 240 ms crossfade). Ambient data, trajectories and a cursor-following light take over the background; **Replay intro** appears. |

**Mobile** plays its own 7.5 s portrait composition rather than a scaled-down desktop. It uses a two-column market feed, vertical speed streaks, particles rising from below, a round momentum ring and a tall trajectory. It also has fewer particles, a capped canvas resolution and no blur filters. **Tablet** gets a 9 s cut with reduced counts.

## Who sees what

A tiny inline script runs before first paint (no flash of the wrong state) and picks the mode:

| Visitor | Intro |
| --- | --- |
| First visit | Full intro |
| Returning (last seen < 30 days) | Short 2.9 s cut: speed burst, assembly, reveal, settle |
| Same browser session | None: the logo reveals itself with a scan and light sweep |
| `prefers-reduced-motion` | None: static composition, no loops, no parallax, no Replay |

- **Skip:** the button or `Esc` fast-forwards (a ~0.5 s time-warp, not a jump cut).
- **Replay:** the Replay button (or `replayIntro()`) plays it again in place.
- **Failsafe:** if JavaScript never arrives, CSS reveals the page after 6 s.

**QA URL parameters:** `?intro=full|short|none` forces a mode. With `?intro=…`, add `&t=5.2` to freeze at a moment, or `&rate=0.5` to slow it down. `window.__kmIntro` then exposes `seek(t)`, `pause()`, `play()` and `skip()`.

## Configuration

Everything is driven by one config. Override it in `src/config/motion.ts`; the defaults and documentation live in `src/motion/config.ts`.

```ts
export const siteMotion: MotionConfigOverrides = {
  intensity: 0.8,                                // global effect level (0.5 calm … 1.3 loud)
  intro: {
    duration: 8,                                 // total seconds for the full intro (scenes scale)
    speed: 1,                                    // or a time scale instead of a duration
    autoplay: true,                              // play on first visit
    returning: 'short',                          // 'short' | 'none' for returning visitors
    returningAfterDays: 30,
    sameSession: 'none',                         // 'none' | 'short'
    skippable: true,
    timing: { mobile: { construct: 1.1 } },      // per-scene seconds, per composition
  },
  particles: { desktop: 1400, tablet: 950, mobile: 520 },
  colors: { brand: '#FC4D00', brandHot: '#FF7A38', ink: '#FDFDFD', background: '#07080A' },
  logo: { introWidth: { desktop: 'min(62vw, 920px)', tablet: '74vw', mobile: '86vw' } },
  layout: { mobileBreakpoint: 768, tabletBreakpoint: 1100, maxDpr: { mobile: 1.5 } },
  reducedMotion: 'user',                         // 'user' | 'always' | 'never'
  interactive: true,                             // cursor light + parallax
};
```

Colours and logo sizes also become CSS variables (`--km-brand`, `--km-intro-logo-w`, …), so the canvas, CSS and DOM always agree. `<LogoIntro duration={8} />` also overrides the duration per instance.

## Components

| Component | Role |
| --- | --- |
| `<LogoIntro />` | Full-screen intro and the pre-hydration loader. It decides nothing itself (the boot script does) and ends by landing on the page's logo anchor. `replayIntro()` plays it again. |
| `<MotionBackground />` | The single fixed canvas plus cheap CSS atmosphere (gradient, dot grid, drifting lights, cursor light, vignette, grain). Mount once. |
| `<SportsDataBackground />` | Ambient odds, probabilities and distributions, plus occasional trajectory arcs, drawn into the shared canvas while mounted. Props: `density`, `intensity`, `arcs`, `clear`. |
| `<LogoReveal />` | The logo rig: letter windows onto the original image, light strokes, flash, chroma, sweep, caret, brackets. Driven by the intro director. |
| `<BrandLogo />` | The logo as static artwork with a hover/focus light sweep. `anchor` marks where the intro lands (`variant="lockup"` or `"wordmark"`). |
| `useStageWindow(ref)` / `usePointerParallax(ref)` | Render the canvas only while a transparent section shows it; add a subtle, pixel-snapped cursor parallax. |

**Dropping the intro into a full site:** put `<BrandLogo variant="lockup" anchor />` in your hero, or `<BrandLogo variant="wordmark" anchor />` in the header. The intro lands on whichever is on screen, flying and shrinking into a header if needed. Wrap page content in `<div className="km-site">` (hidden while the intro plays), and mark elements with `data-enter` (plus `--enter` for stagger order) so they build in at the settle.

## Logo fidelity

`scripts/build_brand_assets.py` (`npm run brand:assets`) derives every raster from the untouched master in `brand-source/`:

- `public/brand/kickmath-lockup.webp` and 1024/640-px renditions: exact lossless crops (served via `srcset`, never re-encoded by an image optimiser). The only change is clearing isolated alpha = 1/255 specks. The script asserts this alters no composited pixel by more than one 8-bit level.
- **Letter parts** are clip-path windows onto that same image, found by partitioning the artwork around each letter body. The script asserts they tile the letter bodies exactly, so the intro downloads no extra logo bytes.
- `src/brand/logo-geometry.json`: part windows, traced outlines (for light strokes only), the K's diagonal cut, and tagline glyph boxes.

**Measured in Chromium:** at native scale, 100 % of logo pixels are within 2/255 of the original upload (mean 0.49; residual is 8-bit compositing rounding). The e2e suite checks the rendered logo against the served artwork on every run, and the asset script guarantees the served artwork matches the original. The intro's final frame matches the page's logo in size and position to within a sub-pixel.

> Tip: the master is a 2000 × 667 raster (logo area 1496 px wide). Supplying an SVG or 2× master would make the large desktop logo razor-sharp on retina screens. Re-run the script with the new file in `brand-source/`.

## Performance

- **One canvas, one rAF loop.** Every layer draws into the same stage. It only renders while a transparent "stage window" is on screen, and pauses in hidden tabs.
- **Time-driven, allocation-free drawing.** Pre-rendered glow and streak sprites, batched particle paths, cached style writes on the DOM rig, and transform/opacity-first animation.
- **Adaptive quality.** Device tier (cores, memory, Save-Data) and composition set density and DPR caps. Sustained slow frames step density down and pause decorative CSS loops.
- **Measured** in a GPU-less headless Chromium (a pessimistic proxy): desktop 1440 × 900 at 53–59 fps per scene with a 16.7 ms median, and mobile 390 × 844 @3× at a steady 60 fps. Script cost is about 1.3 ms per frame.

## Tests

```bash
npm run build
npm run test:e2e        # desktop + mobile projects
```

The suite covers:
- first visit → full intro → landing, with zero console errors or warnings
- same-session reload → no intro, and new tab → short cut
- skip
- in-place replay
- reduced motion
- pixel fidelity of the logo

Static checks: `npm run check` (TypeScript + ESLint).

## Structure

```
brand-source/                 untouched master logo
scripts/build_brand_assets.py asset pipeline (exact crops, part windows, geometry, icons)
public/brand/                 generated logo rasters
src/
  app/                        layout (fonts, boot script, CSS vars), page, icons
  brand/                      logo geometry + typed accessors
  config/motion.ts            ← your overrides
  components/
    motion/                   LogoIntro, LogoReveal, MotionBackground, SportsDataBackground, hooks
    brand/BrandLogo.tsx
    intro/IntroLanding.tsx    the page: logo at rest + Replay
  motion/                     framework-agnostic engine
    config.ts boot.ts runtime.ts ticker.ts device.ts pointer.ts math.ts random.ts color.ts
    stage/                    canvas stage, sprites, drawing helpers
    data/                     sports-data vocabulary (odds, probabilities, distributions…)
    ambient/                  post-intro background layers
    intro/                    director, choreography, logo rig, scene + fx (atmosphere, data, speed,
                              particles, accents, momentum)
e2e/                          Playwright tests
```
