import {Composition} from 'remotion';
import {Film} from './film/Film';
import {FPS, TOTAL_FRAMES} from './film/music';

export const Root: React.FC = () => (
  <Composition id="EXA" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
