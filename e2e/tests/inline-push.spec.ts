// The M7-G browser proof — an inline `Navigator.push` destination's arguments, resolved by the shared
// resolver `screenFor`/`screenKeyFor` extract, in a real browser. `inline_push_build.test.ts` proves the
// emitted project typechecks; it cannot prove the two screens are actually distinguishable at runtime,
// which is exactly the failure mode this milestone fixed — a first-caller-wins collapse would still
// typecheck (both destinations render *a* `<DetailScreen>`, just the same one), so only a real click
// through a real stack tells the two apart. `HomeScreen` pushes the same `DetailScreen` from two
// different buttons, each with different constant arguments (`title`/`enabled`) and the same
// component-scoped signal/action (`count`/`onIncrement`, promoted per M7-F).

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

test.describe('two pushes to the same component, distinct arguments', () => {
  test('pushing "Open Details" renders the destination with its own constants', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Details' }).click();

    // The AppBar title is `title`, a per-push constant — proof the wrapper this push resolved to is the
    // one carrying `'Details'`, not `'Other'` (a first-caller-wins collapse would show the wrong one, or
    // whichever push the generator happened to visit first).
    await expect(page.locator('header')).toContainText('Details');
    await expect(page.getByText('Enabled: true')).toBeVisible();
    await expect(page.getByText(/Count: \d+/)).toBeVisible();
  });

  test('pushing "Open Other" renders the destination with its own, different constants', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Other' }).click();

    await expect(page.locator('header')).toContainText('Other');
    await expect(page.getByText('Enabled: false')).toBeVisible();
  });

  test('the two destinations remain distinct across repeated navigation, in either order', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open Other' }).click();
    await expect(page.locator('header')).toContainText('Other');
    await expect(page.getByText('Enabled: false')).toBeVisible();
    await page.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Open Details' }).click();
    await expect(page.locator('header')).toContainText('Details');
    await expect(page.getByText('Enabled: true')).toBeVisible();
    await page.getByRole('button', { name: 'Go back' }).click();

    // A third round, reversed order again — nothing about which was visited first leaks into the other.
    await page.getByRole('button', { name: 'Open Other' }).click();
    await expect(page.locator('header')).toContainText('Other');
    await expect(page.getByText('Enabled: false')).toBeVisible();
  });
});

test.describe('the promoted signal and action cross the push boundary', () => {
  test('incrementing on the destination updates the store, visible after popping back home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Home count: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Open Details' }).click();
    await expect(page.getByText('Count: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('Count: 2')).toBeVisible();

    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText('Home count: 2')).toBeVisible();
  });
});

test.describe('back navigation', () => {
  test('popping returns to the home screen, and the stack keeps working afterwards', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Details' }).click();
    await expect(page.locator('header')).toContainText('Details');

    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText(/Home count:/)).toBeVisible();

    // The router is not left in a broken state by the pop — another push still resolves correctly.
    await page.getByRole('button', { name: 'Open Other' }).click();
    await expect(page.locator('header')).toContainText('Other');
  });
});

test.describe('assets and delivery', () => {
  test('every request succeeds, and the page reports nothing at all on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);

    await page.getByRole('button', { name: 'Open Details' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForTimeout(250);

    expect(
      transcript.messages.map((m) => `${m.type}: ${m.text}`),
      'console output',
    ).toEqual([]);
  });
});
