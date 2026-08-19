// What the **development** build says about promoted-store consumption (M7-F).
//
// `promotion.spec.ts` runs against production, where React's hook-order diagnostics are stripped to a
// numbered URL. This file exists specifically to make the class of defect Phase 9 named unmissable: a
// conditional or reordered `useStore`/`useSignal` call. `declareStoreConsumption` (component.ts) hoists
// both unconditionally, before the tree that needs them is ever walked — this is the test that would
// catch it if a future change put either back inside a branch.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build, promoted store consumption', () => {
  test('hydrates without a mismatch', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/1 times/);

    expectNoHydrationMismatch(transcript);
  });

  test('reports no hook-order or rules-of-hooks violation across repeated renders', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Several renders — a hook-order violation only shows on a render *after* the one that changed the
    // call sequence — and via both widgets bound to the promoted action, so a violation specific to
    // either call site would still surface.
    const main = page.getByRole('main').getByRole('button', { name: 'Increment' });
    const fab = page.locator('button[aria-label="Increment"]');
    await main.click();
    await fab.click();
    await main.click();
    await fab.click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/4 times/);

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
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await page.waitForTimeout(400);

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
