// Render a set of stills (bundle once) for review.
// node tools/preview.mjs out/prev 0.5 12.5 23.6 40 ...   (times in seconds)
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const [outDir, scaleArg, ...times] = process.argv.slice(2);
fs.mkdirSync(outDir, {recursive: true});
const browserExecutable = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const chromiumOptions = {gl: 'angle'};
const composition = await selectComposition({serveUrl, id: 'EXA', browserExecutable, chromiumOptions});
for (const t of times) {
  const frame = Math.round(parseFloat(t) * composition.fps);
  const t0 = Date.now();
  await renderStill({
    composition,
    serveUrl,
    frame,
    output: path.join(outDir, `f${String(frame).padStart(5, '0')}.png`),
    scale: parseFloat(scaleArg),
    browserExecutable,
    chromiumOptions,
    timeoutInMilliseconds: 120000,
  });
  console.log(`t=${t}s frame ${frame}: ${Date.now() - t0} ms`);
}
