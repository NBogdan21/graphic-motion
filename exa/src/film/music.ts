import music from '../data/music.json';

export const FPS = music.fps;
export const DURATION = music.duration;
export const TOTAL_FRAMES = Math.ceil(DURATION * FPS);
export const BPM = music.grid.bpm;
export const PERIOD = music.grid.period;
export const DROP = music.grid.drop;
export const SECTIONS = music.sections;

/** time (s) of beat n on the grid (beat 0 = the drop) */
export const beat = (n: number) => DROP + n * PERIOD;

const F = music.frames as Record<'sub' | 'kick' | 'hat' | 'snare' | 'vox', number[]>;
const at = (arr: number[], frame: number) => arr[Math.max(0, Math.min(arr.length - 1, frame))] ?? 0;

export const audioAt = (frame: number) => ({
  sub: at(F.sub, frame),
  kick: at(F.kick, frame),
  hat: at(F.hat, frame),
  snare: at(F.snare, frame),
  vox: at(F.vox, frame),
});

/** a slow, mass-like follower of the 808 (no instant flashes) */
export const subMass = (frame: number, span = 8) => {
  let s = 0;
  let w = 0;
  for (let i = 0; i < span; i++) {
    const k = 1 - i / span;
    s += at(F.sub, frame - i) * k;
    w += k;
  }
  return s / w;
};

/** integral of the 808 envelope (seconds-weighted) up to a frame: lets motion surge with the bass */
const cum: number[] = [];
{
  let acc = 0;
  for (let i = 0; i < F.sub.length; i++) {
    acc += F.sub[i] / music.fps;
    cum.push(acc);
  }
}
export const subCum = (frame: number) => at(cum, frame);
