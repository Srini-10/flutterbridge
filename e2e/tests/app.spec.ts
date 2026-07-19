// The browser validation suite.
//
// Everything asserted here is asserted about **a real generated application**: Flutter source → analyzer →
// UIR → N1–N11 → generator → `npm install` → `next build` → `next start` → this browser. `global-setup.ts`
// runs that pipeline before any test does.
//
// ## What each group is actually for
//
// The pipeline had five gates before this suite existed — extraction, normalization, generation, `tsc`, and
// (from M5-C) an install. Both defects M5-D found were green on all of them:
//
//   * emitted imports carried `.js`, which `tsc` resolves and webpack does not, so **no generated
//     application had ever built**;
//   * a signal read through an expression never subscribed, so **the counter did not count** — silently,
//     with an empty console.
//
// Neither is visible without running the thing. That is the entire argument for this file.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('startup', () => {
  test('the page loads, server-renders its content, and hydrates', async ({ page }) => {
    const transcript = recordConsole(page);

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);

    // Server-rendered, not client-painted: the text must be in the HTML the server sent, before any
    // JavaScript runs. Asserting on the response body rather than the DOM is the only way to tell those
    // apart — a client-only app would still show this text a moment later.
    const html = (await response?.text()) ?? '';
    expect(html, 'the counter text must be server-rendered').toContain('You have pushed the button');
    expect(html, 'the app bar title must be server-rendered').toContain('FlutterBridge');

    await expect(page.getByText(/You have pushed the button/)).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });

  test('the document has the structure the scaffolder promises', async ({ page }) => {
    await page.goto('/');

    // `Scaffold` lowers to landmark elements rather than a pile of divs — an AppBar is a `<header>` and the
    // body is `<main>`. This is a contract of the runtime kit, and it is what makes the emitted app
    // navigable by assistive technology at all.
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('header')).toContainText('FlutterBridge');
  });
});

test.describe('state and signals', () => {
  test('the counter increments — the reactivity model, end to end', async ({ page }) => {
    // The B2 regression, in the browser. Every stage before this one reported success while the page sat at
    // "0 times." for as many clicks as you cared to make.
    const transcript = recordConsole(page);
    await page.goto('/');

    const counter = page.getByText(/You have pushed the button/);
    await expect(counter).toHaveText(/0 times/);

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(counter).toHaveText(/1 times/);

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(counter).toHaveText(/3 times/);

    expectClean(transcript);
  });

  test('two widgets bound to one action both drive it', async ({ page }) => {
    // `ElevatedButton` and `FloatingActionButton` both name `_increment` in the Flutter source. They lower
    // to two elements sharing one closure, and a signal written from either has to re-render the same
    // subscriber — which is the property that broke when the subscription was inline at one read site.
    await page.goto('/');
    const counter = page.getByText(/You have pushed the button/);

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(counter).toHaveText(/1 times/);

    // The FAB carries `tooltip: 'Increment'`, which the kit maps to `title`/`aria-label`.
    await page.locator('button[aria-label="Increment"]').click();
    await expect(counter).toHaveText(/2 times/);
  });

  test('state survives a client-side re-render but not a reload', async ({ page }) => {
    // Component-local state is per-mount, exactly as Flutter's `State` is. A reload is a new mount, and the
    // count must start again — if it did not, the signal would be module-scope, which is INV-19 and the
    // defect ADR-15 exists to prevent: one user's state on another user's screen.
    await page.goto('/');
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/1 times/);

    await page.reload();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/0 times/);
  });
});

test.describe('theme', () => {
  test('colours come from the token set N10 derived, not from literals', async ({ page }) => {
    await page.goto('/');

    // ADR-13/INV-20: the compiler owns the palette. The Flutter source says only
    // `ColorScheme.fromSeed(seedColor: Colors.indigo)`, and N10 derives 46 Material roles from it. So the
    // background must be a *resolved* colour — never `transparent`, never a default, never empty.
    const scaffold = page.locator('main').locator('..');
    const background = await scaffold.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background, 'the scaffold must paint a resolved surface colour').toMatch(/^rgba?\(/);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');

    const header = page.locator('header > div').first();
    const headerColor = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(headerColor).toMatch(/^rgba?\(/);
    expect(headerColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('generated styles are applied, not merely present', async ({ page }) => {
    await page.goto('/');

    // The layout widgets lower to real CSS. A `Column` that is not `display: flex` means the styles were
    // emitted and never reached the element — the failure mode where the page looks like unstyled HTML.
    const column = page.locator('main div[style*="flex-direction"]').first();
    await expect(column).toHaveCount(1);
    const display = await column.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('flex');
  });
});

test.describe('layout', () => {
  test('the Scaffold fills the viewport and the FAB is positioned over it', async ({ page }) => {
    await page.goto('/');

    const fab = page.locator('button[aria-label="Increment"]');
    await expect(fab).toBeVisible();

    // A FAB is `position: absolute` inside the Scaffold, bottom-end — Flutter's own default placement.
    // Checking the computed box rather than the style string, because what matters is where it landed.
    const box = await fab.boundingBox();
    const viewport = page.viewportSize();
    expect(box, 'the FAB must have a box').not.toBeNull();
    expect(box!.y, 'the FAB sits in the lower half').toBeGreaterThan((viewport?.height ?? 0) / 2);
    expect(box!.x, 'the FAB sits toward the trailing edge').toBeGreaterThan((viewport?.width ?? 0) / 2);
  });

  test('a SizedBox occupies the space it declares', async ({ page }) => {
    await page.goto('/');
    // `SizedBox(height: 12)` between the text and the button. A spacer that collapses to zero is the most
    // common way a faithful-looking layout is quietly wrong.
    const spacer = page.locator('main div[style*="height:12px"], main div[style*="height: 12px"]').first();
    await expect(spacer).toHaveCount(1);
    const height = await spacer.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeCloseTo(12, 0);
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await page.goto('/');
    // Horizontal overflow is the visible symptom of a layout widget lowered with the wrong box model.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, 'the document must not overflow horizontally').toBe(false);
  });
});

test.describe('routing', () => {
  test('the root route renders the component the route table names', async ({ page }) => {
    await page.goto('/');
    // `MaterialApp(home: CounterScreen())` becomes the route at `/`. If the table and the emitted page
    // disagreed, this would render the wrong component or none.
    await expect(page.getByText(/You have pushed the button/)).toBeVisible();
  });

  test('an unknown route 404s rather than rendering the app', async ({ page }) => {
    const response = await page.goto('/no-such-route');
    expect(response?.status()).toBe(404);
    // The important half: it must not silently serve the root component at every path.
    await expect(page.getByText(/You have pushed the button/)).toHaveCount(0);
  });
});

test.describe('assets and delivery', () => {
  test('every request the page makes succeeds', async ({ page }) => {
    // Chunks, fonts, the asset manifest. A 404 here is a missing emitted file or a bad base path, and it is
    // invisible in the rendered output until the code that needed it runs.
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);
  });

  test('the page reports nothing at all on the console', async ({ page }) => {
    // Not "no errors" — *nothing*. A generated application has no reason to log, so any output is either a
    // framework complaint or a leak from the emitter, and both are worth seeing before they become normal.
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await page.waitForTimeout(250);

    expect(
      of(transcript, 'error', 'warning', 'info', 'log').map((m) => `${m.type}: ${m.text}`),
      'console output',
    ).toEqual([]);
  });
});
