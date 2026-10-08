import {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {Engine} from '../gl/engine';
import {SCENES} from '../gl/scenes';
import {frameState} from './timeline';
import {Tagline} from './Tagline';
import {DURATION, FPS, beat} from './music';

const GLStage: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [handle] = useState(() => delayRender('compile shaders + load glyph atlas'));
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    (async () => {
      const blob = await (await fetch(staticFile('glyphs.png'))).blob();
      const bmp = await createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
      if (cancelled) return;
      const e = new Engine(canvas.current!, SCENES);
      e.setGlyphs(bmp);
      engine.current = e;
      setReady(true);
      continueRender(handle);
    })().catch((err) => {
      console.error(err);
      throw err;
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useLayoutEffect(() => {
    if (!ready || !engine.current) return;
    engine.current.render(frameState(frame));
  }, [frame, ready]);

  return <canvas ref={canvas} width={width} height={height} style={{width: '100%', height: '100%'}} />;
};

export const Film: React.FC = () => {
  const end = Math.round(DURATION * FPS);
  const tagFrom = Math.round(beat(400) * FPS);
  return (
    <AbsoluteFill style={{backgroundColor: '#100E0E'}}>
      <GLStage />
      <Sequence from={tagFrom} durationInFrames={end - tagFrom} name="Tagline">
        <Tagline />
      </Sequence>
      <Audio src={staticFile('track.mp3')} />
    </AbsoluteFill>
  );
};
