// What the **development** build says about the mounted-guarded, awaited push (M7-H/M7-J/M7-L), now
// awaiting a real `Future.delayed(Duration(...))` ahead of the guard rather than resolving synchronously
// underneath it.
//
// `async-push-guard.spec.ts` runs against production, where React's hook-order diagnostics are
// shortened to a numbered URL and Strict Mode's development-only mount→cleanup→remount replay never
// runs at all. This file exists specifically to make two classes of defect unmissable:
//
//   * `useMounted()` called conditionally, or somewhere other than the component's own top level — the
//     Rules-of-Hooks violation this hook is exactly as susceptible to as `useRouter()`/`useSignal()`.
//   * Strict Mode's replay leaving `mounted.current` incorrectly `false` after a component that is
//     genuinely still mounted — the bug `docs/m7/m7j-mounted-lifecycle-implementation.md` derives the
//     runtime primitive's shape specifically to avoid (setting `true` *inside* the effect, not only at
//     its initial value).

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build, mounted-guarded async push', () => {
  test('hydrates without a mismatch', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('header')).toContainText('Authenticated');

    expectNoHydrationMismatch(transcript);
  });

  test('navigates correctly after Strict Mode’s mount→cleanup→remount replay — mounted.current is not left false', async ({
    page,
  }) => {
    // The load-bearing case: if `useMounted()` only relied on `useRef(true)`'s initial value and never
    // re-set `true` inside the effect, Strict Mode's development-only replay would leave the ref `false`
    // for a component that is genuinely still mounted — and the guard would then refuse every push,
    // silently. Signing in here only succeeds if the ref reads `true` post-replay.
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('header')).toContainText('Authenticated');
  });

  test('reports no hook-order or rules-of-hooks violation across repeated sign-in/back', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Sign in' }).click();
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

  test('no state-update-after-unmount warning across a full sign-in/increment/back cycle', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForTimeout(200);

    const stateAfterUnmount = transcript.messages.filter((message) =>
      message.text.includes("Can't perform a React state update on an unmounted component"),
    );
    expect(stateAfterUnmount.map((m) => m.text)).toEqual([]);
  });

  test('says nothing on the console but React’s own DevTools banner', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign in' }).click();
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
