// What the **development** build says about statement-bodied builders whose leading local is a `ref.watch`.
//
// The hoisted `useWatch` calls must run unconditionally and in the same order on every render; a violation
// only shows on a render *after* the one that changed the call sequence, so this drives several writes.
// React's development build reports hydration mismatches and hook-order violations in full.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build, statement-bodied builders', () => {
  test('hydrates without a mismatch and follows the provider', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('count: 1')).toBeVisible();
    await expect(page.getByText('doubled: 2')).toBeVisible();

    expectNoHydrationMismatch(transcript);
  });

  test('reports no hook-order violation and no key warning across repeated renders', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: 'Increment' }).click();
    }
    await expect(page.getByText('count: 4')).toBeVisible();
    await expect(page.getByText('doubled: 8')).toBeVisible();

    const problems = transcript.messages.filter(
      (message) =>
        message.text.includes('Rendered more hooks') ||
        message.text.includes('Rendered fewer hooks') ||
        message.text.includes('order of Hooks') ||
        message.text.includes('Invalid hook call') ||
        message.text.includes('unique "key"'),
    );
    expect(problems.map((m) => m.text), 'hook or key violations').toEqual([]);
  });

  test('says nothing on the console but React’s own DevTools banner', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.waitForTimeout(400);

    expectClean(transcript);

    const REACT_DEVTOOLS_BANNER = 'Download the React DevTools';
    expect(
      of(transcript, 'error', 'warning', 'log', 'info')
        .filter((message) => !message.text.includes(REACT_DEVTOOLS_BANNER))
        .map((message) => `${message.type}: ${message.text}`),
      'console output beyond the DevTools banner',
    ).toEqual([]);
  });
});
