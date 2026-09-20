// What the **development** build says about the M11 lifecycle and collection lowering.
//
// Production hides two things this file exists to show: React's full hook-order and key diagnostics, and StrictMode's
// mount → cleanup → mount replay, which is exactly where an `initState` that is not paired with its `dispose` would show
// (ADR-0052). Whether the replay happens depends on how the route is mounted — in this application the route component is
// mounted after hydration and React does not replay it, and `lifecycle_execution.test.ts` (a StrictMode root in jsdom) shows
// `init,dispose,init` — so the property asserted here is the one that holds either way: init and dispose are PAIRED, the log
// ends in `init` while mounted, and a real unmount adds exactly one `dispose`.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('the development build', () => {
  test('hydrates without a mismatch and says nothing on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText('probe n=42')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });

  test('init and dispose are paired while mounted: the log is `init`, or `init,dispose,init` if React replays it', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'show log' }).click();
    await expect(page.getByText(/^log: init(,dispose,init)?$/)).toBeVisible();
  });

  test('a real unmount adds exactly one dispose', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'toggle probe' }).click();
    await page.getByRole('button', { name: 'show log' }).click();
    await expect(page.getByText(/^log: init(,dispose,init)?,dispose$/)).toBeVisible();
  });

  test('collections and integers behave as in production', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'add', exact: true }).click();
    await expect(page.getByText('parent: 3,1,2,3 adds=1')).toBeVisible();
    await page.getByRole('button', { name: 'child add' }).click();
    await expect(page.getByText('child items: 3,1,2,3,104')).toBeVisible();
    await page.getByRole('button', { name: 'shift' }).click();
    await expect(page.getByText('int n=1048576')).toBeVisible();
  });
});
