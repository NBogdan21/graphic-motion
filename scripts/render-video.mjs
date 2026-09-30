#!/usr/bin/env node
/**
 * Export the intro as a high-quality MP4, rendered frame by frame from the
 * live web build (not screen-recorded): every frame is exact and evenly spaced.
 *
 *   npm run build && npm start            # in another terminal
 *   npm run render:video                  # desktop 4K + 1080p, 60 fps
 *   npm run render:video -- --preset mobile
 *
 * Options: --preset desktop|mobile  --url http://localhost:3000  --out video
 *          --fps 60  --tail 2.5 (seconds held on the logo at the end)
 * Needs ffmpeg with libx264 on PATH (or FFMPEG_PATH). Set
 * PLAYWRIGHT_CHROMIUM_PATH to use an existing Chromium.
 *
 * How it stays exact: the page is opened with `?intro=full&render=1`, which
 * switches the motion engine to a manual clock (window.__kmRender.step) and
 * pins quality to the top tier; CSS animations are paused and advanced on the
 * same clock through the Web Animations API. Frames are captured at 3840 px
 * on the long edge: 4K is encoded as is, while 1080p and the portrait cut are
 * 2x supersampled (Lanczos) for clean anti-aliasing. Everything is encoded as
 * BT.709 H.264 so the brand orange is reproduced accurately.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values: args } = parseArgs({
  options: {
    preset: { type: 'string', default: 'desktop' },
    url: { type: 'string', default: 'http://localhost:3000' },
    out: { type: 'string', default: 'video' },
    fps: { type: 'string', default: '60' },
    tail: { type: 'string', default: '2.5' },
  },
});

const PRESETS = {
  // 1440x810 CSS px (the desktop composition) rendered at 3840x2160.
  desktop: {
    viewport: { width: 1440, height: 810 },
    scale: 8 / 3,
    mobile: false,
    outputs: [
      { name: 'kickmath-intro-4k.mp4', size: '3840:2160', crf: 15, level: '5.2' },
      { name: 'kickmath-intro-1080p.mp4', size: '1920:1080', crf: 12, level: '4.2' },
    ],
  },
  // 360x640 CSS px (the dedicated mobile composition) rendered at 2160x3840.
  mobile: {
    viewport: { width: 360, height: 640 },
    scale: 6,
    mobile: true,
    outputs: [{ name: 'kickmath-intro-mobile-1080x1920.mp4', size: '1080:1920', crf: 12, level: '4.2' }],
  },
};

const preset = PRESETS[args.preset];
if (!preset) throw new Error(`Unknown preset "${args.preset}" (use desktop or mobile)`);
const fps = Number(args.fps);
const tail = Number(args.tail);
mkdirSync(args.out, { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: preset.viewport,
  deviceScaleFactor: preset.scale,
  isMobile: preset.mobile,
  hasTouch: preset.mobile,
});
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));

await page.goto(`${args.url}/?intro=full&render=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__kmRender && window.__kmIntro, null, { timeout: 30_000 });
// A brand film, not a UI capture: hide the Skip / Replay controls.
await page.addStyleTag({ content: '[data-intro-overlay] button, main button { display: none !important; }' });
// CSS animations and transitions follow the same virtual clock as the canvas.
await page.evaluate(() => {
  const seen = new WeakMap();
  window.__kmAdvanceCss = (ms) => {
    for (const anim of document.getAnimations()) {
      const t = seen.get(anim) ?? 0;
      anim.pause();
      anim.currentTime = t;
      seen.set(anim, t + ms);
    }
  };
});

const duration = await page.evaluate(() => window.__kmIntro.duration);
const total = Math.round((duration + tail) * fps);
const cdp = await context.newCDPSession(page);

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const color = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const split = preset.outputs.map((_, i) => `[s${i}]`).join('');
const chains = preset.outputs
  .map((o, i) => `[s${i}]scale=${o.size}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p[v${i}]`)
  .join(';');
const encoderArgs = preset.outputs.flatMap((o, i) => [
  '-map', `[v${i}]`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(o.crf), '-tune', 'film',
  '-profile:v', 'high', '-level:v', o.level, ...color,
  '-movflags', '+faststart', join(args.out, o.name),
]);
const proc = spawn(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-filter_complex', `[0:v]split=${preset.outputs.length}${split};${chains}`,
    ...encoderArgs,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);

const started = Date.now();
for (let i = 0; i < total; i++) {
  const dt = i === 0 ? 0 : 1 / fps;
  await page.evaluate((dt) => {
    window.__kmRender.step(dt);
    window.__kmAdvanceCss(dt * 1000);
  }, dt);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  if (!proc.stdin.write(Buffer.from(data, 'base64'))) await once(proc.stdin, 'drain');
  if (i % fps === 0) {
    const s = ((Date.now() - started) / 1000).toFixed(0);
    process.stdout.write(`\r${args.preset}: frame ${i + 1}/${total} (${s}s)   `);
  }
}
proc.stdin.end();
const [code] = await once(proc, 'close');
await browser.close();
process.stdout.write('\n');
if (problems.length) console.warn('Page reported problems:\n' + problems.join('\n'));
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
console.log(`Wrote ${preset.outputs.map((o) => join(args.out, o.name)).join(', ')} (${total} frames at ${fps} fps)`);
