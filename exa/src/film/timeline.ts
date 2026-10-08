// The choreography. Every shot and transition is placed on the track's beat grid
// (beat 0 = the drop at 23.405 s, 161.5 BPM). Silences freeze time; slams split
// the frame and flip paper <-> ink. The 808 is used as mass (camera surge, pressure),
// never as a flash.
import type {FrameState, SceneDraw} from '../gl/engine';
import {audioAt, beat, DROP, DURATION, FPS, PERIOD, subCum, subMass} from './music';

// ---------------------------------------------------------------- easing
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (x: number, a: number, b: number) => clamp((x - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x: number) => 1 - Math.pow(1 - x, 3);
const out5 = (x: number) => 1 - Math.pow(1 - x, 5);
const inn = (x: number) => x * x * x;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** piecewise keyframes [[t, v], ...] with ease-in-out between keys */
const keys = (t: number, k: [number, number][], e = io) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return mix(k[i - 1][1], k[i][1], e(lin(t, k[i - 1][0], k[i][0])));
  }
  return k[k.length - 1][1];
};

// ---------------------------------------------------------------- landmarks (seconds)
const T = {
  pressure: beat(-32), // 11.516  808 drone enters
  drop: DROP, // 23.405
  hook1End: beat(64), // 47.182
  sil1: 69.75,
  slam1: beat(128), // 70.959  the heaviest hit of the song
  sil2: 81.75,
  hook2: beat(160), // 82.848
  breakdown: beat(224), // 106.625
  verse2: beat(232), // 109.597
  sil3: 117.4,
  verse2b: beat(256), // 118.514
  mono: beat(288), // 130.405
  sil4: 141.0,
  hook3: beat(320), // 142.291
  sil5: 152.7,
  hook3b: beat(352), // 154.180
  outro: beat(384), // 166.068
  drone: beat(400), // 172.012
  end: DURATION,
};
const BAR = 4 * PERIOD;
const HALF = 16 * PERIOD; // half-phrase, 5.94 s

/** freeze time at tf; afterwards drift almost imperceptibly (suspended, not dead) */
const freeze = (g: number, tf: number, drift = 0.015) => (g < tf ? g : tf + (g - tf) * drift);

type Ctx = {frame: number; g: number; mass: number; kick: number; hat: number; snare: number; vox: number; sub: number};
type Shot = {
  id: string;
  scene: string;
  t0: number;
  t1: number;
  /** remap global time (freeze, slow motion) before computing local time */
  time?: (g: number) => number;
  draw: (lt: number, c: Ctx) => Partial<SceneDraw>;
  post?: Partial<FrameState['post']>;
};
type Trans = {from: string; to: string; t0: number; t1: number; type: number; params?: number[]};

// ---------------------------------------------------------------- shots
const SHOTS: Shot[] = [
  // I — Hairline -------------------------------------------------------------
  {
    id: 'paper',
    scene: 'paper',
    t0: 0,
    t1: T.pressure + 0.6,
    draw: (lt, c) => ({
      p: [
        lin(lt, 0, 12.2),
        keys(lt, [[0, -0.075], [4, -0.042], [8.5, -0.016], [11.5, -0.0045]], out),
        keys(lt, [[4.2, -0.4], [7, -0.12], [11.5, -0.006]], out),
        0,
      ],
      q: [c.mass],
    }),
    post: {grain: 0.014, vignette: 0.18, bloom: 0.3},
  },
  // II — Pressure / ignition ---------------------------------------------------
  {
    id: 'pressure',
    scene: 'pressure',
    t0: T.pressure,
    t1: T.drop + 2.2,
    draw: (lt, c) => {
      const dropL = T.drop - T.pressure;
      const after = lt - dropL;
      const depth =
        after < 0
          ? keys(lt, [[0, 1.8], [dropL - 0.5, 0.158]], out)
          : mix(0.158, 0.0, out5(lin(after, 0, 0.32)));
      const ignite = after < 0 ? 0 : out(lin(after, 0, 0.18)) * (0.82 + 0.25 * c.mass);
      return {
        p: [lin(lt, 0, 13.6), depth, ignite, c.hat * (after < 0 ? 1 : 0.3)],
        q: [after < 0 ? 0 : -0.35 * c.mass, ((lt * 0.55) % 1.6) - 0.3],
      };
    },
    post: {grain: 0.012, vignette: 0.2, bloom: 0.8},
  },
  // III — Colonnade of crossings ------------------------------------------------
  {
    id: 'colonnade',
    scene: 'colonnade',
    t0: T.drop + 1.6,
    t1: T.hook1End + 0.8,
    draw: (lt, c) => {
      const g = c.g;
      const h1 = T.drop + HALF;
      const h2 = T.drop + 2 * HALF;
      const h3 = T.drop + 3 * HALF;
      const surge = subCum(c.frame) - subCum(Math.round((T.drop + 1.6) * FPS));
      return {
        p: [
          0.9 * lt + 0.75 * surge,
          keys(g, [[h1 - 0.4, 0.0], [h1 + 1.2, 0.35], [h2 - 0.4, 0.3], [h2 + 1.4, 0.0], [h3 - 0.3, 0.0], [h3 + 1.3, -0.25]]),
          keys(g, [[h2 - 0.2, 0], [h2 + 3.2, 1], [h3 + 0.2, 1], [h3 + 3.0, 0]]),
          keys(g, [[T.hook1End - 2.6, 0], [T.hook1End, 1]], (x) => x * x),
        ],
        q: [-0.16 * c.mass, keys(g, [[h1, 0.05], [h1 + 2, 0.16], [h3, 0.09]]), 0],
      };
    },
    post: {grain: 0.012, vignette: 0.22, bloom: 0.9},
  },
  // IV — Ink genesis ---------------------------------------------------------
  {
    id: 'ink',
    scene: 'ink',
    t0: T.hook1End - 0.2,
    t1: T.slam1 + 0.6,
    time: (g) => freeze(g, T.sil1),
    draw: (lt, c) => ({
      p: [
        smooth(lin(lt, 2.5, 20.5)),
        keys(lt, [[0, 0.32], [8, 0.6], [21, 1.4]]),
        keys(lt, [[0, -1.45], [21, -0.98]]),
        keys(lt, [[0, 0.22], [21, 0.0]]),
      ],
      q: [c.mass * 0.6, 0.25 + 0.75 * smooth(lin(lt, 5, 16))],
    }),
    post: {grain: 0.016, vignette: 0.18, bloom: 0.5},
  },
  // V — Letter landscape (ink world) -------------------------------------------
  {
    id: 'terrain',
    scene: 'terrain',
    t0: T.slam1,
    t1: T.hook2 + 0.1,
    time: (g) => freeze(g, T.sil2, 0.05),
    draw: (lt, c) => ({
      p: [
        0.0 + lt / 13.5 + 0.008 * c.mass,
        keys(lt, [[0, 1.0], [5, 0.75]]),
        keys(lt, [[5.7, 0], [9.6, 1]]),
        0.6 + lt * 0.05,
      ],
    }),
    post: {grain: 0.018, vignette: 0.3, bloom: 0.9},
  },
  // VI — Velocity + breakdown ----------------------------------------------------
  {
    id: 'velocity',
    scene: 'velocity',
    t0: T.hook2,
    t1: T.verse2 + 0.4,
    time: (g) => (g < T.breakdown ? g : T.breakdown + (g - T.breakdown) * 0.06),
    draw: (lt, c) => {
      const g = c.g;
      const h1 = T.hook2 + HALF;
      const h2 = T.hook2 + 2 * HALF;
      const h3 = T.hook2 + 3 * HALF;
      const base = keys(g, [[T.hook2 + 0.1, 0], [T.hook2 + 1.8, 0.42], [h3, 0.42], [h3 + 2, 0.55]], out);
      const inBreak = g >= T.breakdown;
      const snap = inBreak ? 0 : smooth(lin(c.kick, 0.55, 0.95)) * 0.8;
      return {
        p: [
          base * (1 - snap),
          keys(g, [[h1 - 0.5, 0.02], [h1 + 1.5, 0.07], [h2 - 0.5, 0.07], [h2 + 1.0, 0.0], [h3 - 0.3, 0.0], [h3 + 2.0, 0.2]]),
          keys(g, [
            [T.hook2, 0.12],
            [h1 - 0.6, 0.5],
            [h1 + 1.4, -0.72],
            [h2 - 0.4, -0.55],
            [h2 + 1.6, 1.5],
            [h3 - 0.4, 1.35],
            [h3 + 2.0, 0.6],
            [T.breakdown, 0.2],
            [T.verse2, 0.05],
          ]),
          keys(g, [[T.hook2, 1.6], [T.hook2 + 2, 2.6], [h1 + 1.4, 2.0], [h2 + 1.6, 2.8], [h3 + 2.0, 2.2], [T.verse2, 1.7]]),
        ],
        q: [inBreak ? out(lin(g, T.breakdown, T.breakdown + 0.6)) : 0, lt, keys(g, [[h1, 0.1], [h1 + 1.4, 0.35], [h2 + 1.6, 0.05]]), 1],
      };
    },
    post: {grain: 0.018, vignette: 0.28, bloom: 1.0},
  },
  // VII — Impossible architecture, paper ---------------------------------------
  {
    id: 'droste',
    scene: 'droste',
    t0: T.verse2 - 0.3,
    t1: T.verse2b + 0.6,
    time: (g) => freeze(g, T.sil3),
    draw: (lt, c) => ({
      p: [0.08 + lt * 0.3 + 0.04 * c.mass, mix(0.32, 0.5, lin(lt, 0, 8)), 2.45 + lt * 0.06, 0],
    }),
    post: {grain: 0.014, vignette: 0.2, bloom: 0.5},
  },
  // VII b — the same architecture, inverted into ink -----------------------------
  {
    id: 'drosteInk',
    scene: 'droste',
    t0: T.verse2b,
    t1: T.mono + 0.6,
    draw: (lt, c) => {
      const lt0 = T.sil3 - (T.verse2 - 0.3);
      return {p: [0.08 + (lt0 + lt) * 0.3 + 0.04 * c.mass, mix(0.5, 0.78, lin(lt, 0, 12)), 2.45 + (lt0 + lt) * 0.06 + 1.2, 1]};
    },
    post: {grain: 0.018, vignette: 0.3, bloom: 0.8},
  },
  // VII c — monoliths: through the counter of the A --------------------------------
  {
    id: 'mono',
    scene: 'sculpture',
    t0: T.mono,
    t1: T.hook3 + 0.5,
    time: (g) => freeze(g, T.sil4, 0.03),
    draw: (lt) => {
      const zt = keys(lt, [[0, 2.6], [8.0, -1.6], [10.6, -2.4]], (x) => x);
      return {
        k: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0, 1, 0],
        p: [keys(lt, [[7.2, 0], [10.6, 2.6]]), keys(lt, [[0, 0.05], [7, 0.0], [10.6, 0.3]]), 1.1, 0],
        q: [0.697, -0.05, zt, 1],
        r: [keys(lt, [[0, -0.12], [8, 0.1]]), 0, 0, 0.2],
      };
    },
    post: {grain: 0.018, vignette: 0.3, bloom: 0.9},
  },
  // VIII — Convergence montage (bars) -------------------------------------------
  {
    id: 'm1',
    scene: 'colonnade',
    t0: T.hook3 - 0.3,
    t1: T.hook3 + 2 * BAR + 0.2,
    draw: (lt, c) => ({p: [30 + lt * 2.4 + c.mass, 0.1 + lt * 0.05, 0, 0], q: [-0.22 * c.mass, 0.22, 1]}),
    post: {grain: 0.018, vignette: 0.28, bloom: 1.0},
  },
  {
    id: 'm2',
    scene: 'velocity',
    t0: T.hook3 + 2 * BAR - 0.3,
    t1: T.hook3 + 4 * BAR + 0.2,
    draw: (lt, c) => ({
      p: [0.5 * (1 - smooth(lin(c.kick, 0.55, 0.95)) * 0.8), 0.12, 0.35 + lt * 0.25, 2.2],
      q: [0, lt, 0.15, 0],
    }),
    post: {grain: 0.014, vignette: 0.2, bloom: 0.9},
  },
  {
    id: 'm3',
    scene: 'terrain',
    t0: T.hook3 + 4 * BAR - 0.3,
    t1: T.hook3 + 5 * BAR + 0.2,
    draw: (lt) => ({p: [0.45 + lt * 0.1, 0.6, 0, 1.3]}),
    post: {grain: 0.018, vignette: 0.3, bloom: 0.9},
  },
  {
    id: 'm4',
    scene: 'droste',
    t0: T.hook3 + 5 * BAR - 0.3,
    t1: T.hook3 + 6 * BAR + 0.2,
    draw: (lt) => ({p: [1.3 + lt * 0.9, 0.6, 3.4, 0]}),
    post: {grain: 0.014, vignette: 0.2, bloom: 0.5},
  },
  {
    id: 'm5',
    scene: 'ink',
    t0: T.hook3 + 6 * BAR - 0.3,
    t1: T.hook3b + 0.6,
    time: (g) => freeze(g, T.sil5),
    draw: (lt, c) => ({p: [0.82 + 0.1 * Math.sin(lt), 0.9, -1.02, 0.0], q: [c.mass, 1.0]}),
    post: {grain: 0.016, vignette: 0.2, bloom: 0.6},
  },
  // VIII b — assembly: the letters arrive; the X arrives last, in motion ------------
  {
    id: 'assembly',
    scene: 'sculpture',
    t0: T.hook3b,
    t1: T.outro + 4.6,
    draw: (lt, c) => {
      const g = c.g;
      const eE = out5(lin(lt, 0, 3 * BAR));
      const eA = out5(lin(lt, 0.4, 4 * BAR));
      const xt = lin(lt, 3.6 * BAR, 5 * BAR);
      const eX = out5(xt);
      const fly = 1 - eX;
      const trail = xt > 0 && xt < 1 ? Math.sin(Math.PI * Math.min(1, xt * 1.2)) : 0;
      const arrived = lt - 5 * BAR;
      const ortho = io(lin(g, T.outro, T.outro + 4.2));
      return {
        k: [
          -3.6 * (1 - eE), 0.25 * (1 - eE), -2.8 * (1 - eE),
          3.9 * (1 - eA), -0.2 * (1 - eA), -3.2 * (1 - eA),
          0.6961 * 4.2 * fly, 0.7179 * 4.2 * fly, 1.2 * fly,
          -0.6789 * 4.2 * fly, 0.7342 * 4.2 * fly, -1.2 * fly,
          0.085,
          trail,
          arrived < 0 ? 0 : out(lin(arrived, 0, 0.2)) * (0.85 + 0.2 * c.mass),
          0,
        ],
        p: [
          keys(g, [[T.hook3b, 0.95], [T.outro, 0.32], [T.outro + 4.2, 0]]),
          keys(g, [[T.hook3b, 0.22], [T.outro, 0.06], [T.outro + 4.2, 0]]),
          keys(g, [[T.hook3b, 4.6], [T.outro, 3.8], [T.outro + 4.2, 5.17]]),
          ortho,
        ],
        q: [0, 0.02, 0, 0],
        r: [keys(g, [[T.hook3b, -0.05], [T.outro + 4.2, 0]]), 1, 0, c.mass * 0.3],
      };
    },
    post: {grain: 0.012, vignette: 0.18, bloom: 0.8},
  },
  // IX — The mark --------------------------------------------------------------
  {
    id: 'mark',
    scene: 'mark',
    t0: T.outro + 4.0,
    t1: T.end + 1,
    draw: (lt, c) => {
      const g = c.g;
      return {
        p: [3.04, 0, 0.02, out(lin(g, T.drone - 0.2, T.drone + 2.4))],
        q: [
          g > T.drone && g < 179 ? c.mass * 0.9 : 0,
          io(lin(g, 178.8, 181.4)),
          io(lin(g, 181.8, 183.5)),
          1,
        ],
      };
    },
    post: {grain: 0.01, vignette: 0.1, bloom: 0.6},
  },
];

// ---------------------------------------------------------------- transitions
const TRANS: Trans[] = [
  // the ink hairline dissolves into the razor tip of a monolith as the 808 arrives
  {from: 'paper', to: 'pressure', t0: T.pressure - 0.15, t1: T.pressure + 0.55, type: 1},
  // the ignited core opens into the architecture
  {from: 'pressure', to: 'colonnade', t0: T.drop + 1.6, t1: T.drop + 2.2, type: 4, params: [0, 0]},
  // falling into a crimson core, emerging in ink and water
  {from: 'colonnade', to: 'ink', t0: T.hook1End - 0.2, t1: T.hook1End + 0.75, type: 4, params: [0, 0]},
  // silence 1: frozen frame, a red hairline is drawn; the slam splits the frame into ink
  {from: 'ink', to: 'ink', t0: T.sil1, t1: T.slam1, type: 6},
  {from: 'ink', to: 'terrain', t0: T.slam1, t1: T.slam1 + 0.6, type: 3, params: [0, 1]},
  // hook 2 is born from the lone hot point (handled by post) — open from the core
  {from: 'terrain', to: 'velocity', t0: T.hook2, t1: T.hook2 + 0.1, type: 4, params: [0, 0]},
  // the beat returns after the breakdown: a hairline cuts back to paper
  {from: 'velocity', to: 'droste', t0: T.verse2 - 0.3, t1: T.verse2 + 0.05, type: 5, params: [1]},
  {from: 'droste', to: 'droste', t0: T.sil3, t1: T.verse2b, type: 6},
  {from: 'droste', to: 'drosteInk', t0: T.verse2b, t1: T.verse2b + 0.6, type: 3, params: [0, 1]},
  {from: 'drosteInk', to: 'mono', t0: T.mono - 0.25, t1: T.mono + 0.35, type: 2, params: [0]},
  {from: 'mono', to: 'mono', t0: T.sil4, t1: T.hook3, type: 6},
  {from: 'mono', to: 'm1', t0: T.hook3, t1: T.hook3 + 0.45, type: 3, params: [0, 1]},
  {from: 'm1', to: 'm2', t0: T.hook3 + 2 * BAR - 0.3, t1: T.hook3 + 2 * BAR + 0.12, type: 2, params: [1]},
  {from: 'm2', to: 'm3', t0: T.hook3 + 4 * BAR - 0.3, t1: T.hook3 + 4 * BAR + 0.12, type: 2, params: [0]},
  {from: 'm3', to: 'm4', t0: T.hook3 + 5 * BAR - 0.3, t1: T.hook3 + 5 * BAR + 0.12, type: 2, params: [1]},
  {from: 'm4', to: 'm5', t0: T.hook3 + 6 * BAR - 0.3, t1: T.hook3 + 6 * BAR + 0.12, type: 2, params: [1]},
  {from: 'm5', to: 'm5', t0: T.sil5, t1: T.hook3b, type: 6},
  {from: 'm5', to: 'assembly', t0: T.hook3b, t1: T.hook3b + 0.5, type: 3, params: [0, 1]},
  // the sculpture, now flat and frontal, becomes print
  {from: 'assembly', to: 'mark', t0: T.outro + 4.0, t1: T.outro + 4.6, type: 1},
];

const byId = new Map(SHOTS.map((s) => [s.id, s]));
const POST_DEFAULT: FrameState['post'] = {exposure: 1, grain: 0.012, vignette: 0.2, bloom: 0.7, fade: 0, fadeColor: 1};

const ctxAt = (frame: number): Ctx => {
  const a = audioAt(frame);
  return {frame, g: frame / FPS, mass: subMass(frame, 10), kick: a.kick, hat: a.hat, snare: a.snare, vox: a.vox, sub: a.sub};
};

const drawShot = (s: Shot, c: Ctx): SceneDraw => {
  const g = s.time ? s.time(c.g) : c.g;
  const lt = g - s.t0;
  return {scene: s.scene, time: lt, dur: s.t1 - s.t0, ...s.draw(lt, c)};
};

export const shotAt = (g: number) => {
  let cur = SHOTS[0];
  for (const s of SHOTS) if (g >= s.t0 && g < s.t1) cur = s;
  return cur;
};

export const frameState = (frame: number): FrameState => {
  const c = ctxAt(frame);
  const g = c.g;
  const tr = TRANS.find((t) => g >= t.t0 && g < t.t1);
  let aShot: Shot;
  let bShot: Shot | undefined;
  if (tr) {
    aShot = byId.get(tr.from)!;
    bShot = tr.from === tr.to ? undefined : byId.get(tr.to)!;
  } else {
    aShot = shotAt(g);
  }
  // single-shot transitions (6 = freeze line) still go through the compositor
  const post = {...POST_DEFAULT, ...(bShot && tr && (g - tr.t0) / (tr.t1 - tr.t0) > 0.5 ? bShot.post : aShot.post)};

  // silence 2: everything falls to black except the hot point
  if (g >= T.sil2 && g < T.hook2 + 0.5) {
    const k = g < T.hook2 ? out(lin(g, T.sil2, T.sil2 + 0.5)) : 1 - out(lin(g, T.hook2, T.hook2 + 0.5));
    post.fade = k;
    post.fadeColor = 0.004;
    post.hot = [0, 0, g < T.hook2 ? k : 1 - lin(g, T.hook2, T.hook2 + 0.5)];
  }
  // the last breath: the screen returns to paper
  if (g > T.end - 0.25) {
    post.fade = lin(g, T.end - 0.25, T.end);
    post.fadeColor = 1;
  }

  const a = drawShot(aShot, c);
  const fs: FrameState = {
    g,
    frame,
    beat: (g - DROP) / PERIOD,
    audio: [c.sub, c.kick, c.hat, c.snare],
    vox: c.vox,
    a,
    post,
  };
  if (tr) {
    fs.transition = {type: tr.type, progress: lin(g, tr.t0, tr.t1), params: tr.params};
    if (bShot) fs.b = drawShot(bShot, c);
  }
  return fs;
};

export const LANDMARKS = T;
