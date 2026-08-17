/** WebKit smoke test: serve dist, screenshot key screens to docs/smoke/. */
import { webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const OUT = new URL('../docs/smoke', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    p = p.replace(/^\/game-jinx-alley\//, '/'); // vite base path
    if (p === '/') p = '/index.html';
    let file = join(DIST, p);
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(DIST, 'index.html');
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });

const browser = await webkit.launch();
const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: join(OUT, name) });
const spinReady = () => page.waitForFunction(() => !document.querySelector('.spin-btn')?.disabled, { timeout: 15000 });

try {
  await page.goto(`${base}/?test=1`, { waitUntil: 'networkidle' });
  await shot('01-zone-select.png');

  // start a run on Zone 1 → loadout modal (shows board composition) → START RUN
  await page.getByRole('button', { name: /Zone 1: Neon Strip/ }).click();
  await page.waitForSelector('.board-comp');
  await shot('05-loadout.png');
  await page.getByRole('button', { name: /START RUN/ }).click();
  await page.waitForSelector('.board-ring');
  await page.getByRole('button', { name: /SPIN/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /STOP/ }).click();
  await spinReady();
  await shot('02-board-mid-run.png');

  // keep spinning until the run ends (bust or out of spins) → run-end overlay
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.overlay').count() > 0) break;
    const btn = page.getByRole('button', { name: /SPIN/ });
    if (await btn.isDisabled().catch(() => true)) break;
    await btn.click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /STOP/ }).click().catch(() => {});
    await spinReady().catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('.overlay', { timeout: 10000 });
  // let the end-of-run full-board reveal settle before screenshotting
  await page.waitForTimeout(1600);
  await shot('04-run-end.png');
  await page.getByRole('button', { name: /ZONES/ }).click();
  await page.waitForSelector('.zone-list');

  // shop
  await page.getByRole('button', { name: /Shop/ }).click();
  await page.waitForSelector('.shop-list');
  await shot('03-shop.png');

  console.log('SMOKE OK — screenshots in docs/smoke/');
} finally {
  await browser.close();
  server.close();
}
