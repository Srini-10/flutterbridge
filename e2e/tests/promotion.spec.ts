// The M7-F browser proof — a promoted signal and action, consumed by a real generated component, in a
// real browser. TypeScript passing (`promotion_build.test.ts`) is necessary and not sufficient: the M5-D
// history is exactly a case where every earlier gate was green while a signal read through an expression
// never subscribed, so the counter did not count — silently, with an empty console. This suite is that
// check, for `_count`/`_increment` after they cross a route boundary and are promoted into
// `app.Store{origin: "promoted"}` (docs/m7/m7f-promoted-store-consumption.md), rather than staying
// component-local the way `counter`'s own `_count` does.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('the page loads, server-renders the promoted count, and hydrates', async ({ page }) => {
    const transcript = recordConsole(page);

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);

    const html = (await response?.text()) ?? '';
    expect(html, 'the counter text must be server-rendered').toContain('You have pushed the button');
    expect(html, 'the app bar title must be server-rendered').toContain('FlutterBridge');

    await expect(page.getByText(/You have pushed the button 0 times/)).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('promoted state and signals', () => {
  test('the promoted signal increments — the store-consumption path, end to end', async ({ page }) => {
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

  test('two widgets, both bound to the promoted action, drive the same store', async ({ page }) => {
    // `ElevatedButton` and the FAB both name `onIncrement` — CounterScreen's own param before promotion,
    // now both a direct reference to the same store action (`promotedStore._increment`, not two separate
    // closures). A signal written from either has to re-render the same subscriber.
    await page.goto('/');
    const counter = page.getByText(/You have pushed the button/);

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(counter).toHaveText(/1 times/);

    await page.locator('button[aria-label="Increment"]').click();
    await expect(counter).toHaveText(/2 times/);
  });

  test('the promoted store is provider-scoped, not a module singleton — a reload resets it (ADR-15/INV-19)', async ({
    page,
  }) => {
    // The whole point of `instantiateStore` being called from a provider rather than held at module scope:
    // a promoted signal must have exactly the correctness properties any other store's does. If this ever
    // failed, the failure mode would be one browser session leaking count into a fresh one — a privacy
    // defect, not a cosmetic one, which is why ADR-15 treats it as load-bearing rather than incidental.
    await page.goto('/');
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/1 times/);

    await page.reload();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/0 times/);
  });
});

test.describe('assets and delivery', () => {
  test('every request succeeds, and the page reports nothing at all on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);

    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await page.waitForTimeout(250);

    // Not "no errors" — *nothing*, including a React hook-order/conditional-hook warning, which is the
    // specific class of defect hoisting `useStore`/`useSignal` unconditionally (component.ts,
    // `declareStoreConsumption`) exists to prevent. `promotion.dev-only.spec.ts` re-asserts this against
    // React's unminified development build, where such a warning is spelled out in full rather than
    // shortened.
    expect(
      transcript.messages.map((m) => `${m.type}: ${m.text}`),
      'console output',
    ).toEqual([]);
  });
});
