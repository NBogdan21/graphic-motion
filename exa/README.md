# EXA — Beyond the Expected

A 3:04 brand film for EXA, built from scratch in **Remotion** with hand-written
WebGL2 shaders. Every frame is computed: no stock footage, no templates, no
plugins, no pre-made assets. The music is the supplied reference track. It
drives the timing, but the film does not flash on every beat.

```
exa/
  tools/analyze_music.py   track -> src/data/music.json  (grid, structure, per-frame envelopes)
  tools/build_glyphs.py    EXA letterforms as vectors -> public/glyphs.png (SDF atlas)
  src/Root.tsx             Remotion composition (1920x1080, 30 fps, 5515 frames)
  src/film/                timeline, music data, overlays (tagline)
  src/gl/                  WebGL engine, post-processing, one shader per world
```

---

## 1. Logo analysis: the DNA

| Trait | What the mark does | How the film uses it |
|---|---|---|
| **Didone contrast** | The stems are about 0.20 of the cap height wide. The hairlines are about 0.011. That is roughly an 18 : 1 ratio. | There are only **two weights** in the film: the hairline and the stem. Every line, slab, ribbon and particle path is one or the other. |
| **The crossing** | The X's two thick strokes cross at a single point. The only red in the mark is born there. | **Red exists only where two things cross.** It might be two strokes, two solids passing through each other, two ink plumes, or a hairline meeting a stem. It never shows up as decoration. |
| **Velocity as light** | The X's left half is not drawn. It is fanned into 3–4 ribbons with red rims, like a long exposure of a moving stroke. | **Anything fast enough becomes red parallel hairlines** (chronophotography). |
| **Paper and ink** | The ink is a warm black `#100E0E` on paper white `#FEFEFE`. There is no grey. | The world is either **paper** or **ink**. The film switches between them only when the music goes silent. |
| **Interlock** | Negative kerning. The A's hairline leg stops in mid-air against the X. The E's arms end in blade-sharp tips. | Forms touch without merging. Tips are always sharp, and nothing is rounded off. |
| **Flag terminals** | The X strokes end in sweeping, pointed flags, and so does the A's foot. | The camera moves and the ribbon curves follow the same quadratic sweep. |

**Palette:** paper `#FEFEFE`, ink `#100E0E`, crimson `#C41E1D`, plus three tones
derived from them: oxblood `#3A0606` (red seen through ink), hot core
`#FF4A3A → #FFE6E0` (red at full energy), and fog (paper seen through distance).
No other hue appears.

## 2. Music analysis

The track is trap at **161.5 BPM**: beat = 0.3715 s, phrase = 32 beats = 11.89 s.
The first full 808 lands at **23.405 s**, which is beat 0 of the grid. Every
structural event falls on that grid. I checked this against band energies and
phrase self-similarity (`tools/analyze_music.py`).

```
0:00  intro      ambient, no drums ............................ stillness
0:11  pressure   808 drone enters, hat teases, almost no kick ...... mass
0:23  HOOK 1     full 808 + hats (A/A' half-phrase pattern) ........ the drop
0:47  VERSE 1    denser vocal; silences at 1:09.8 (1.2 s) and 1:21.8 (1.1 s)
1:11            the heaviest single hit of the song lands after the first silence
1:23  HOOK 2     same material as hook 1
1:47  BREAKDOWN  3 s with no 808 at all
1:50  VERSE 2    silences at 1:57.4, 2:21.0
2:22  HOOK 3     silence at 2:32.7
2:46  OUTRO      beat drops out, melody only, 808 drone returns 2:52–2:58, fade
```

**Choreography rules**
- **The 808 is mass, not light.** It pushes the camera and loads the geometry. It never flashes the frame.
- **Silences are the biggest events.** Each gap in the 808 freezes time. A red hairline is drawn across the still frame, and the world flips between paper and ink when the beat returns.
- **Hats are micro-detail.** They make glints that run along hairlines, and only where hairlines exist.
- **Half-phrases (5.9 s) change the camera axis.** Single beats are not used for cutting until Hook 3, when the film starts to cut faster.

## 3. Concept: *The Hot Point*

> Every image begins where two things cross.

The film starts with a hairline on paper, at a scale where a single fibre is
a landscape. It ends with that hairline grown into the EXA mark. In between,
the crossing at the heart of the X keeps changing scale: two lines, then two
solids, an architecture, a fluid, a landscape, a velocity, an infinite
recursion. The logo is the last thing you see in full, but you see its DNA
in every frame before that.

## 4. Scene-by-scene treatment

| # | Time | Music | World | What happens |
|---|---|---|---|---|
| I | 0:00–0:11 | intro | **Hairline**, paper | Extreme macro on paper fibres under grazing light. A single ink hairline wicks across the paper by capillary action, its edges feathering into the fibres. A second hairline arrives at the X's angle. They approach but never touch, so there is no red. |
| II | 0:11–0:23 | 808 drone | **Pressure**, paper fog | Pull back: the hairline was the edge of a monumental black stem. The two X strokes slide in as polished black monoliths, heavy and slow, through white fog. Each hat tease sends a glint along an edge. Just before the drop the strokes hang a hair apart in total stillness. |
| ⚡ | 0:23.4 | **drop** | **Ignition** | The solids pass through each other. Their shared volume, the literal intersection of the two forms, ignites crimson. That is the first red of the film. |
| III | 0:23–0:47 | hook 1 | **Colonnade of crossings** | An infinite architecture of crossing slabs, lit only by the red cores where they intersect. The camera flies through it, changing axis every half-phrase. It rises until the lattice reads as a woven X-pattern, then dives into one red core. |
| IV | 0:47–1:10 | verse 1 | **Ink genesis** | We come out of the core into ink diffusing in water. The turbulence slowly organises into the E: its stem, its bracketed serifs, its blade-thin arms. Where two plumes cross, a red filament appears. |
| ◼ | 1:09.8 | silence | **Freeze** | Time stops. One red hairline is drawn corner to corner across the frozen image. |
| V | 1:11–1:22 | heaviest hit | **Letter landscape**, ink | The frame splits along the red line and the world inverts to ink. The camera flies low over a vast terrain carved from the letterforms, under one raking light. Hairlines stand as razor walls. Red burns where hairline meets stem. |
| ◼ | 1:21.8 | silence | **Black** | Only the hot point remains. |
| VI | 1:23–1:47 | hook 2 | **Velocity** (chronophotography) | The X stroke travels at impossible speed and leaves its own exposures behind: glossy sheets with red rims, fanned like the logo's ribbons. The 808 accents snap the echoes back into a single solid. |
| ◼ | 1:47–1:50 | breakdown | **Suspension** | The ribbons freeze into glass filaments, and time slows to almost nothing. |
| VII | 1:50–2:21 | verse 2 | **Impossible architecture**, paper | A paper-cut architecture of the lockup under raking light. Its shadows are cast from the letterforms. The camera zooms through the counter of the A into another EXA, then another (a recursion). The A's crossbar becomes the horizon. |
| VIII | 2:22–2:46 | hook 3 | **Convergence** | Every world returns in fragments. Shot lengths shrink to bars and then beats, joined by X-wipes: two blades sweep across and cross, with a red spark where they meet. After the last silence the letters assemble in 3D, flying in at speed and trailing their red exposures. |
| IX | 2:46–3:04 | outro | **The mark** | The beat falls away. The 3D sculpture rotates to face us and the perspective collapses to flat print. What remains is the logo exactly as drawn, the X's left half still in motion. When the drone returns, the hot point breathes once. Hairline type reads BEYOND THE EXPECTED. Everything recedes except the crimson point, and then that is gone too. |

## 5. Production

- **Remotion** owns time. `useCurrentFrame()` drives a single WebGL2 canvas,
  the typography overlay (SVG) and the `<Audio>` track, so preview and render
  are frame-identical.
- **One engine, many worlds.** Each world is a fragment shader that renders
  into a float buffer. A composite pass applies the brand transitions
  (X-wipe, freeze-line inversion, dive through the core). A post pass adds
  bloom from a mip pyramid, grain and a filmic tone curve.
- **Letterforms are geometry, not pixels.** `build_glyphs.py` rebuilds E, the
  two X strokes and A as polygons measured from the master logo. It bakes each
  one into its own SDF channel, so the scenes can extrude, split, light and
  re-assemble them.
- **Audio data is precomputed** per frame (sub / kick / hat / snare / vox) and
  is not computed by live FFT, so the result is deterministic.

### Run

```bash
cd exa
npm install
# put the track at public/track.mp3 (not committed)
python3 tools/analyze_music.py public/track.mp3 src/data/music.json   # optional, data is committed
python3 tools/build_glyphs.py                                       # optional, atlas is committed
npm run studio        # interactive preview
npm run render        # -> out/EXA_Beyond_The_Expected.mp4
```

Without a GPU, Chrome renders WebGL in software (ANGLE/SwiftShader). That
is slow but exact.
