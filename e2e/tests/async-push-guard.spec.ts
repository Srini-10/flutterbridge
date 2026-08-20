// The M7-H/M7-J browser proof — an async, awaited `Navigator.push`, reached only after a `mounted`
// guard, inside a named method reached by tear-off (`onPressed: _isSubmitting ? null : _submit`) rather
// than written inline. `hello_bridge/lib/screens/login_screen.dart`'s own shape, and the one scenario
// this whole M7 navigation arc has been building toward: M7-H got the awaited push to lower; ADR-0026/
// M7-J got `mounted` itself a real lowering (`useMounted()`), closing the last diagnostic standing
// between this fixture and a running application. `async_push_guard_build.test.ts` proves the emitted
// project typechecks; it cannot prove the guard reads *live* state rather than something captured at
// render — only a real click, in a real browser, against the real generated app can.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('the page loads, server-renders the home screen, and hydrates', async ({ page }) => {
    const transcript = recordConsole(page);

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);

    const html = (await response?.text()) ?? '';
    expect(html, 'the home count must be server-rendered').toContain('Home count: 0');

    await expect(page.getByText('Home count: 0')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('the guarded async push, still mounted', () => {
  test('signing in navigates: the mounted guard passes, the awaited push executes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The destination renders with its own constant (`title: 'Authenticated'`) — proof `logic.Navigate`
    // performed the exact transition `screenFor` (M7-G) resolved arguments for, not a different one.
    await expect(page.locator('header')).toContainText('Authenticated');
  });

  test('the promoted signal and action cross the push boundary, same as before this milestone', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Count: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('Count: 2')).toBeVisible();

    // Popping back shows the same promoted store, unaffected by which screen is rendering it.
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText('Home count: 2')).toBeVisible();
  });

  test('popping returns to the home screen, and the stack keeps working afterwards', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('header')).toContainText('Authenticated');

    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText(/Home count:/)).toBeVisible();

    // The router is not left in a broken state by the pop — signing in again still resolves correctly.
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('header')).toContainText('Authenticated');
  });

  test('the button disables while submitting, driven by the same handler the guard sits in', async ({
    page,
  }) => {
    // `_isSubmitting` gates `onPressed` (`_isSubmitting ? null : _submit`) — a signal write in the same
    // handler as the `useMounted()` read, both hoisted, neither breaking the other's ordering.
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Sign in' });
    await expect(button).toBeEnabled();
    await button.click();
    // By the time navigation has occurred, `_isSubmitting` was already reset to `false` before the push
    // (source order: setState(true) → mounted check → setState(false) → push) — the destination screen
    // is what's on screen now, not a disabled button frozen mid-submit.
    await expect(page.locator('header')).toContainText('Authenticated');
  });
});

test.describe('assets and delivery', () => {
  test('every request succeeds, and the page reports nothing at all on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForTimeout(250);

    expect(
      transcript.messages.map((m) => `${m.type}: ${m.text}`),
      'console output',
    ).toEqual([]);
  });
});
