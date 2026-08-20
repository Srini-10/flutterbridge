// The M7-N browser proof — a component-owned instance of a declared store (ADR-27):
// `final CounterStore _left = CounterStore(); final CounterStore _right = CounterStore();`, each with a
// signal, a derived value, a parameterless action (also read as a tear-off), and a parameterized action.
// `local_store_build.test.ts` proves the emitted project typechecks; it cannot prove two locally-owned
// instances stay genuinely isolated at runtime — only a real click, in a real browser, against the real
// generated app can.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('the page loads, server-renders both counters, and hydrates', async ({ page }) => {
    const transcript = recordConsole(page);

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);

    const html = (await response?.text()) ?? '';
    expect(html, 'both counters must be server-rendered at their initial value').toContain('Left: 0 (doubled: 0)');
    expect(html).toContain('Right: 0 (doubled: 0)');

    await expect(page.getByText('Left: 0 (doubled: 0)')).toBeVisible();
    await expect(page.getByText('Right: 0 (doubled: 0)')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('two locally-owned instances of the same store stay isolated', () => {
  test('an action tear-off updates only its own instance', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Left +1' }).click();

    await expect(page.getByText('Left: 1 (doubled: 2)')).toBeVisible();
    // The whole point of ADR-27: mutating `_left` must never touch `_right`.
    await expect(page.getByText('Right: 0 (doubled: 0)')).toBeVisible();
  });

  test('a parameterized action call updates only its own instance', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Right +5' }).click();

    await expect(page.getByText('Right: 5 (doubled: 10)')).toBeVisible();
    await expect(page.getByText('Left: 0 (doubled: 0)')).toBeVisible();
  });

  test('both instances accumulate independently across repeated interaction', async ({ page }) => {
    await page.goto('/');
    const leftInc = page.getByRole('button', { name: 'Left +1' });
    const rightAdd = page.getByRole('button', { name: 'Right +5' });

    await leftInc.click();
    await leftInc.click();
    await leftInc.click();
    await rightAdd.click();

    await expect(page.getByText('Left: 3 (doubled: 6)')).toBeVisible();
    await expect(page.getByText('Right: 5 (doubled: 10)')).toBeVisible();

    await rightAdd.click();
    await expect(page.getByText('Right: 10 (doubled: 20)')).toBeVisible();
    // Left is untouched by every one of the right-side clicks above.
    await expect(page.getByText('Left: 3 (doubled: 6)')).toBeVisible();
  });

  test('the derived value tracks the signal on every update, for both instances', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Left +5' }).click();
    await expect(page.getByText('Left: 5 (doubled: 10)')).toBeVisible();
    await page.getByRole('button', { name: 'Left +1' }).click();
    await expect(page.getByText('Left: 6 (doubled: 12)')).toBeVisible();
  });
});

test.describe('assets and delivery', () => {
  test('every request succeeds, and the page reports nothing at all on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);

    await page.getByRole('button', { name: 'Left +1' }).click();
    await page.getByRole('button', { name: 'Right +5' }).click();
    await page.waitForTimeout(200);

    expect(
      transcript.messages.map((m) => `${m.type}: ${m.text}`),
      'console output',
    ).toEqual([]);
  });
});
