// M0-T5 SPIKE — capture the hand-written React reference app (M0-T4).
//
// Builds if needed, serves the PRODUCTION build (never `next dev`: dev injects overlays and
// hot-reload sockets that would land in a golden), and screenshots through the same Chromium,
// viewport and DPR as the Flutter capture. Observational only: nothing here touches the reference.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { CONTEXT_OPTIONS, NEXT_PORT, SCREENSHOT_OPTIONS } from '../playwright.config.js';
import { waitUntilStable } from './capture_flutter.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(HERE, '../..');
export const REACT_APP = join(REPO, 'spikes/m0-react-reference');
export const REACT_BASELINES = join(HERE, 'baselines/react');

export function ensureReactBuild(): void {
  if (!existsSync(join(REACT_APP, 'node_modules'))) {
    console.log('react: installing…');
    const i = spawnSync('pnpm', ['install', '--ignore-workspace'], { cwd: REACT_APP, stdio: 'inherit' });
    if (i.status !== 0) throw new Error('pnpm install failed');
  }
  if (existsSync(join(REACT_APP, '.next/BUILD_ID'))) {
    console.log('react: .next present, reusing');
    return;
  }
  console.log('react: building…');
  const b = spawnSync('pnpm', ['build'], { cwd: REACT_APP, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('next build failed');
}

async function waitForHttp(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server never became ready: ${url}`);
}

export function serveNext(port = NEXT_PORT): ChildProcess {
  return spawn('pnpm', ['start', '-p', String(port)], {
    cwd: REACT_APP,
    stdio: 'ignore',
    detached: false,
  });
}

export async function captureNext(): Promise<{ login: string }> {
  ensureReactBuild();
  mkdirSync(REACT_BASELINES, { recursive: true });

  const server = serveNext();
  const browser = await chromium.launch();

  try {
    await waitForHttp(`http://localhost:${NEXT_PORT}/`);
    const context = await browser.newContext(CONTEXT_OPTIONS);
    const page = await context.newPage();

    await page.goto(`http://localhost:${NEXT_PORT}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const loginPath = join(REACT_BASELINES, 'login.png');
    await waitUntilStable(page, 'react/login');
    await page.screenshot({ ...SCREENSHOT_OPTIONS, path: loginPath });

    // NOTE: /home in the reference is an acknowledged placeholder (M0-T4), not a conversion of
    // HomeScreen. It is deliberately NOT captured: a golden of a placeholder would invite a diff
    // whose number means nothing.
    return { login: loginPath };
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  captureNext()
    .then((r) => console.log('captured:', r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
