// M0-T5 SPIKE — capture the Flutter Web reference app.
//
// Serves `fixtures/apps/hello_bridge/build/web` and screenshots it through the SAME Playwright
// Chromium, viewport and DPR the React capture uses (see playwright.config.ts). Observational only:
// nothing here touches the fixture.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from '@playwright/test';

import {
  CONTEXT_OPTIONS,
  FLUTTER_PORT,
  SCREENSHOT_OPTIONS,
} from '../playwright.config.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(HERE, '../..');
export const FLUTTER_APP = join(REPO, 'fixtures/apps/hello_bridge');
export const FLUTTER_WEB_DIR = join(FLUTTER_APP, 'build/web');
export const FLUTTER_BASELINES = join(HERE, 'baselines/flutter');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.symbols': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** `flutter build web` — only if the output is missing, so repeat runs are cheap and identical. */
export function ensureFlutterBuild(): void {
  if (existsSync(join(FLUTTER_WEB_DIR, 'index.html'))) {
    console.log('flutter: build/web present, reusing');
    return;
  }
  console.log('flutter: building web…');
  const r = spawnSync('flutter', ['build', 'web', '--no-tree-shake-icons'], {
    cwd: FLUTTER_APP,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('flutter build web failed');
}

export function serveFlutter(port = FLUTTER_PORT): Promise<Server> {
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.replace(/^\/+/, ''));
    const file = join(FLUTTER_WEB_DIR, rel);
    if (!file.startsWith(FLUTTER_WEB_DIR) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

/**
 * Flutter renders to a canvas, so "the DOM is ready" tells us nothing about whether the frame is
 * painted. The only trustworthy readiness signal is the pixels themselves: shoot until two
 * consecutive frames are byte-identical. This is also what makes the capture repeatable.
 */
export async function waitUntilStable(page: Page, label: string, maxTries = 30): Promise<Buffer> {
  let previous = '';
  let shot: Buffer = Buffer.alloc(0);
  for (let i = 0; i < maxTries; i++) {
    shot = await page.screenshot(SCREENSHOT_OPTIONS);
    const hash = createHash('sha256').update(shot).digest('hex');
    if (hash === previous) {
      console.log(`  ${label}: stable after ${i} frame(s)`);
      return shot;
    }
    previous = hash;
    await page.waitForTimeout(250);
  }
  console.warn(`  ${label}: WARNING never stabilised in ${maxTries} frames`);
  return shot;
}

export async function captureFlutter(): Promise<{ login: string; home: string | null }> {
  ensureFlutterBuild();
  mkdirSync(FLUTTER_BASELINES, { recursive: true });

  const server = await serveFlutter();
  const browser = await chromium.launch();
  const context = await browser.newContext(CONTEXT_OPTIONS);
  const page = await context.newPage();

  try {
    await page.goto(`http://localhost:${FLUTTER_PORT}/`, { waitUntil: 'load' });
    // Flutter's view host exists only once the engine has bootstrapped.
    await page.waitForSelector('flt-glass-pane, flutter-view, canvas', { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);

    const loginPath = join(FLUTTER_BASELINES, 'login.png');
    const login = await waitUntilStable(page, 'flutter/login');
    await page.screenshot({ ...SCREENSHOT_OPTIONS, path: loginPath });
    void login;

    // ── Home (best effort, informational) ────────────────────────────────────────────────────
    // Flutter Web paints to a canvas: there are no DOM handles to click, so the login flow has to
    // be driven by coordinates. Home also fetches live data, which is why it is NOT diffed.
    let homePath: string | null = null;
    try {
      await page.mouse.click(600, 447); // Email
      await page.keyboard.type('a@b.co');
      await page.mouse.click(600, 507); // Password
      await page.keyboard.type('secret');
      await page.mouse.click(600, 572); // Sign in
      await page.waitForTimeout(1500); // the fixture's fake 400ms auth + the real GET
      const home = await waitUntilStable(page, 'flutter/home');
      const homeHash = createHash('sha256').update(home).digest('hex');
      const loginHash = createHash('sha256')
        .update(await page.screenshot({ ...SCREENSHOT_OPTIONS, clip: { x: 0, y: 0, width: 1, height: 1 } }))
        .digest('hex');
      void loginHash;
      homePath = join(FLUTTER_BASELINES, 'home.png');
      await page.screenshot({ ...SCREENSHOT_OPTIONS, path: homePath });
      console.log(`  flutter/home: captured (${homeHash.slice(0, 8)})`);
    } catch (err) {
      console.warn(`  flutter/home: NOT reachable — ${(err as Error).message}`);
      homePath = null;
    }

    return { login: loginPath, home: homePath };
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureFlutter()
    .then((r) => console.log('captured:', r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
