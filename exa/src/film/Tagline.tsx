// "BEYOND THE EXPECTED" set in a monoline hairline cap alphabet drawn for EXA.
// The hairline is the logo's thinnest weight. Only one letter in the line has
// a true crossing, the X, so only the X carries the red point (rule: red only where lines cross).
import {interpolate, useCurrentFrame, useVideoConfig, Easing} from 'remotion';

type G = {w: number; d: string; cross?: [number, number]};
const GLYPHS: Record<string, G> = {
  B: {w: 9, d: 'M0 0V14M0 0H5.25A3.25 3.25 0 0 1 5.25 6.5H0M5.25 6.5H5.5A3.75 3.75 0 0 1 5.5 14H0'},
  E: {w: 8, d: 'M8 0H0V14H8M0 6.8H6.4'},
  Y: {w: 10, d: 'M0 0L5 7L10 0M5 7V14'},
  O: {w: 14, d: 'M7 0A7 7 0 1 1 6.99 0Z'},
  N: {w: 10, d: 'M0 14V0L10 14V0'},
  D: {w: 11, d: 'M0 0H4A7 7 0 0 1 4 14H0Z'},
  T: {w: 10, d: 'M0 0H10M5 0V14'},
  H: {w: 10, d: 'M0 0V14M10 0V14M0 7H10'},
  X: {w: 10, d: 'M0 0L10 14M10 0L0 14', cross: [5, 7]},
  P: {w: 9, d: 'M0 14V0H5.25A3.6 3.6 0 0 1 5.25 7.2H0'},
  C: {w: 12, d: 'M12.1 2.6A7 7 0 1 0 12.1 11.4'},
};
const TEXT = 'BEYOND THE EXPECTED';
const TRACK = 9;
const SPACE = 16;

export const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = frame / fps;

  let x = 0;
  const items: {ch: string; x: number; g: G}[] = [];
  for (const ch of TEXT) {
    if (ch === ' ') {
      x += SPACE;
      continue;
    }
    const g = GLYPHS[ch];
    items.push({ch, x, g});
    x += g.w + TRACK;
  }
  const total = x - TRACK;
  const scale = 1.12;
  const out = interpolate(t, [6.6, 8.2], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});

  return (
    <svg width={width} height={1080} style={{position: 'absolute', inset: 0}} viewBox={`0 0 ${width} 1080`}>
      <g transform={`translate(${width / 2 - (total * scale) / 2} 808) scale(${scale})`} opacity={out}>
        {items.map((it, i) => {
          const start = 0.25 + i * 0.07;
          const p = interpolate(t, [start, start + 0.9], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const crossOn = interpolate(t, [start + 0.8, start + 1.4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <g key={i} transform={`translate(${it.x} 0)`}>
              <path
                d={it.g.d}
                fill="none"
                stroke="#100E0E"
                strokeWidth={1.05}
                strokeLinecap="butt"
                strokeLinejoin="miter"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
                vectorEffect="non-scaling-stroke"
              />
              {it.g.cross ? (
                <circle cx={it.g.cross[0]} cy={it.g.cross[1]} r={1.15} fill="#C41E1D" opacity={crossOn} style={{filter: 'drop-shadow(0 0 3px rgba(196,30,29,0.9))'}} />
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
};
