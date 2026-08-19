// What the **development** build says about inline-push destination resolution (M7-G).
//
// `inline-push.spec.ts` runs against production, where React's hook-order diagnostics are stripped to a
// numbered URL. This file makes the class of defect this milestone had to avoid unmissable: a wrapper
// function or the destination component itself calling a hook conditionally, or a stale closure from a
// shared/cached wrapper. `screenFor` builds one wrapper per boundary (`construction:${boundaryId}`,
// `module.ts`'s idempotent-by-owner naming) — this is the test that would catch two boundaries colliding
// onto the same wrapper, or a hook hoisted incorrectly when that wrapper was introduced.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build, inline push destination resolution', () => {
  test('hydrates without a mismatch', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Open Details' }).click();
    await expect(page.locator('header')).toContainText('Details');

    expectNoHydrationMismatch(transcript);
  });

  test('reports no hook-order or rules-of-hooks violation across repeated push/pop, either destination first', async ({
    page,
  }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Alternates which of the two destinations mounts, and pops back between each — a wrapper that
    // shared state across the two boundaries, or hoisted a hook inconsistently, would show it here rather
    // than on a single, unvarying path.
    await page.getByRole('button', { name: 'Open Details' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Open Other' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Open Details' }).click();
    await expect(page.getByText('Count: 2')).toBeVisible();

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
    await page.getByRole('button', { name: 'Open Other' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();
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
