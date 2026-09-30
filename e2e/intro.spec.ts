import { expect, test, type Page } from '@playwright/test';

type IntroState = { intro: string | null; state: string | null; motion: string | null };

const introState = (page: Page): Promise<IntroState> =>
  page.evaluate(() => ({
    intro: document.documentElement.dataset.intro ?? null,
    state: document.documentElement.dataset.introState ?? null,
    motion: document.documentElement.dataset.motion ?? null,
  }));

const waitForState = (page: Page, state: string, timeout = 25_000) =>
  page.waitForFunction((s) => document.documentElement.dataset.introState === s, state, { timeout });

/** Every console error/warning and uncaught exception, for "no console errors" checks. */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  return problems;
}

test('first visit plays the full intro and lands on the logo', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  expect((await introState(page)).intro).toBe('full');
  await waitForState(page, 'playing', 10_000);
  await expect(page.getByRole('button', { name: /skip intro/i })).toBeVisible();
  await waitForState(page, 'done');
  await expect(page.locator('[data-intro-overlay]')).toHaveCount(0);
  await expect(page.locator('[data-logo-anchor]')).toBeVisible();
  await expect(page.getByRole('button', { name: /replay intro/i })).toBeVisible();
  expect(problems).toEqual([]);
});

test('same session skips the intro; a returning visitor gets the short cut', async ({ page, context }) => {
  await page.goto('/?intro=full&rate=6');
  await waitForState(page, 'done');

  // Same tab, same session (no QA params this time).
  await page.goto('/');
  expect(await introState(page)).toMatchObject({ intro: 'none', state: null });
  await expect(page.locator('[data-intro-overlay]')).toHaveCount(0);
  await expect(page.locator('[data-logo-anchor]')).toBeVisible();

  // A new tab starts a new browser session but shares the visit history.
  const next = await context.newPage();
  await next.goto('/');
  expect((await introState(next)).intro).toBe('short');
  await waitForState(next, 'done', 10_000);
});

test('skip fast-forwards to the landing', async ({ page }) => {
  await page.goto('/');
  await waitForState(page, 'playing', 10_000);
  await page.getByRole('button', { name: /skip intro/i }).click();
  await waitForState(page, 'done', 4_000);
});

test('replay plays the intro again in place', async ({ page }) => {
  await page.goto('/?intro=full&rate=6');
  await waitForState(page, 'done');
  await page.getByRole('button', { name: /replay intro/i }).click();
  await waitForState(page, 'playing', 5_000);
  await waitForState(page, 'done');
  await expect(page.locator('[data-logo-anchor]')).toBeVisible();
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('shows the logo without the intro', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto('/');
    expect(await introState(page)).toMatchObject({ intro: 'none', state: null, motion: 'reduced' });
    await expect(page.locator('[data-intro-overlay]')).toHaveCount(0);
    await expect(page.locator('[data-logo-anchor]')).toBeVisible();
    await expect(page.getByRole('button', { name: /replay intro/i })).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test('the logo is rendered pixel-faithfully (native scale)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'measured once, at 1 device pixel per CSS pixel');
  await page.setViewportSize({ width: 2400, height: 1201 });
  await page.goto('/?intro=none');
  // Measurement setup: flat backdrop, no parallax/hover/animation, logo at its native 1496 px.
  await page.addStyleTag({
    content: `
      body > div:has(> canvas) { display: none !important; }
      html, body { background: rgb(7, 8, 10) !important; }
      main button, [data-logo-anchor]::after { display: none !important; }
      h1 > span { transform: none !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
      :root { --km-rest-logo-w: 1496px !important; }
    `,
  });
  await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('[data-logo-anchor] img');
    if (!img) throw new Error('logo missing');
    img.removeAttribute('srcset');
    img.src = '/brand/kickmath-lockup.webp';
    await img.decode();
  });
  const box = await page.locator('[data-logo-anchor]').boundingBox();
  if (!box) throw new Error('logo not laid out');
  const shot = await page.screenshot({
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
  });
  const result = await page.evaluate(async (b64) => {
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const [screen, art] = await Promise.all([load(`data:image/png;base64,${b64}`), load('/brand/kickmath-lockup.webp')]);
    const w = art.naturalWidth;
    const h = art.naturalHeight;
    const pixels = (img: HTMLImageElement, backdrop?: string) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      if (backdrop) {
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const a = pixels(screen);
    const b = pixels(art, 'rgb(7, 8, 10)');
    let over = 0;
    let max = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(
        Math.abs((a[i] ?? 0) - (b[i] ?? 0)),
        Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)),
        Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0)),
      );
      if (d > max) max = d;
      if (d > 3) over++;
    }
    return { w, h, over, max, total: a.length / 4 };
  }, shot.toString('base64'));
  expect(result).toMatchObject({ w: 1496, h: 357 });
  // Every pixel within 3/255 of the artwork (8-bit compositing rounding only).
  expect(result.over).toBe(0);
});
