#!/usr/bin/env node
// Measures the pipeline and the browser. **Measurement only** — nothing here optimizes anything.
//
// The rule this follows is the one every milestone since M5-A has: measure first, and optimize only a
// bottleneck that a measurement demonstrates. What it records is what the M5-D report quotes.
//
// Browser numbers come from the page's own `PerformanceNavigationTiming` and paint entries, not from a
// stopwatch around `page.goto` — a stopwatch would be measuring Playwright.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { appDir } from './build-fixtures.mjs';

const APP = 'counter';
const dir = appDir(APP);
const PORT = 3399;

/** Total bytes of the JavaScript the browser actually loads for `/`. */
function bundleBytes() {
  const chunks = join(dir, '.next/static/chunks');
  let total = 0;
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) total += statSync(full).size;
    }
  };
  walk(chunks);
  return total;
}

const pipeline = JSON.parse(readFileSync(join(dir, '../../timings.json'), 'utf8'));

const server = execFileSync('sh', ['-c', `cd ${dir} && (npx next start --port ${PORT} > /tmp/measure-server.log 2>&1 &) && echo started`], {
  encoding: 'utf8',
});
void server;

// Wait for readiness by polling, so the number below is the server's, not a fixed sleep.
const startedAt = Date.now();
let ready = false;
for (let i = 0; i < 120 && !ready; i += 1) {
  try {
    execFileSync('curl', ['-sf', '-o', '/dev/null', `http://127.0.0.1:${PORT}/`]);
    ready = true;
  } catch {
    execFileSync('sleep', ['0.25']);
  }
}
const serverReadyMs = Date.now() - startedAt;

const browser = await chromium.launch();
const page = await browser.newPage();

const samples = [];
for (let run = 0; run < 5; run += 1) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((entry) => entry.name === 'first-contentful-paint');
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
      firstContentfulPaint: fcp === undefined ? null : Math.round(fcp.startTime),
      transferred: nav.transferSize,
    };
  });
  samples.push(metrics);
  await page.reload({ waitUntil: 'networkidle' });
}

// Time to interactive, measured the only honest way: click until the DOM actually changes.
await page.goto(`http://127.0.0.1:${PORT}/`);
const hydrationMs = await page.evaluate(async () => {
  const started = performance.now();
  const text = () => document.body.innerText.match(/pushed the button (\d+)/)?.[1];
  const before = text();
  for (let i = 0; i < 400; i += 1) {
    const button = [...document.querySelectorAll('main button')][0];
    button?.click();
    if (text() !== before) return Math.round(performance.now() - started);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return -1;
});

await browser.close();
execFileSync('sh', ['-c', `lsof -ti tcp:${PORT} | xargs kill -9 2>/dev/null || true`]);

const median = (key) => {
  const values = samples.map((sample) => sample[key]).filter((value) => value !== null).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};

console.log('\n── pipeline (ms) ──');
for (const [stage, ms] of Object.entries(pipeline)) console.log(`  ${stage.padEnd(18)} ${String(ms).padStart(7)}`);

console.log('\n── browser (median of 5) ──');
console.log(`  server ready       ${String(serverReadyMs).padStart(7)} ms`);
console.log(`  TTFB               ${String(median('ttfb')).padStart(7)} ms`);
console.log(`  first paint        ${String(median('firstContentfulPaint')).padStart(7)} ms`);
console.log(`  DOMContentLoaded   ${String(median('domContentLoaded')).padStart(7)} ms`);
console.log(`  load               ${String(median('load')).padStart(7)} ms`);
console.log(`  interactive after  ${String(hydrationMs).padStart(7)} ms   (first click that changes the DOM)`);

console.log('\n── size ──');
console.log(`  JS chunks total    ${(bundleBytes() / 1024).toFixed(1)} KiB`);
console.log(`  HTML transferred   ${(median('transferred') / 1024).toFixed(1)} KiB`);
