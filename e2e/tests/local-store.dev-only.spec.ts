// What the **development** build says about two locally-owned store instances (ADR-27, M7-N).
//
// `local-store.spec.ts` runs against production, where React's hook-order diagnostics are shortened and
// Strict Mode's development-only mount→cleanup→remount replay never runs at all. This file exists
// specifically to make two classes of defect unmissable:
//
//   * `useLocalStore()` called conditionally, or somewhere other than the component's own top level — the
//     Rules-of-Hooks violation this hook is exactly as susceptible to as `useStore()`/`useSignal()`.
//   * Strict Mode's replay leaving an instance disposed-and-not-rebuilt, or leaving `left`/`right` sharing
//     one instance after the remount — the same class of bug `StoreProvider`'s own Strict Mode test guards
//     against, now for the no-provider acquisition path.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build, two locally-owned store instances', () => {
  test('hydrates without a mismatch', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText('Left: 0 (doubled: 0)')).toBeVisible();
    await expect(page.getByText('Right: 0 (doubled: 0)')).toBeVisible();

    expectNoHydrationMismatch(transcript);
  });

  test('both instances still mutate independently after Strict Mode’s mount→cleanup→remount replay', async ({
    page,
  }) => {
    // The load-bearing case: if the two `useLocalStore()` calls shared an instance after Strict Mode's
    // development-only replay, or the replay left one disposed, this would either update both counters
    // together or throw on the first dispatch.
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Left +1' }).click();
    await expect(page.getByText('Left: 1 (doubled: 2)')).toBeVisible();
    await expect(page.getByText('Right: 0 (doubled: 0)')).toBeVisible();

    await page.getByRole('button', { name: 'Right +5' }).click();
    await expect(page.getByText('Right: 5 (doubled: 10)')).toBeVisible();
    await expect(page.getByText('Left: 1 (doubled: 2)')).toBeVisible();
  });

  test('reports no hook-order or rules-of-hooks violation', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Left +1' }).click();
    await page.getByRole('button', { name: 'Right +5' }).click();
    await page.getByRole('button', { name: 'Left +5' }).click();

    const hookProblems = transcript.messages.filter(
      (message) =>
        message.text.includes('Rendered more hooks') ||
        message.text.includes('Rendered fewer hooks') ||
        message.text.includes('order of Hooks') ||
        message.text.includes('Invalid hook call'),
    );
    expect(hookProblems.map((m) => m.text), 'hook violations').toEqual([]);
  });

  test('says nothing on the console but React’s own DevTools banner', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Left +1' }).click();
    await page.getByRole('button', { name: 'Right +5' }).click();
    await page.waitForTimeout(200);

    expectClean(transcript);

    const REACT_DEVTOOLS_BANNER = 'Download the React DevTools';
    expect(
      of(transcript, 'error', 'warning', 'log', 'info')
        .filter((message) => !message.text.includes(REACT_DEVTOOLS_BANNER))
        .map((message) => `${message.type}: ${message.text}`),
      'development console output, excluding React’s own DevTools banner',
    ).toEqual([]);
  });
});
