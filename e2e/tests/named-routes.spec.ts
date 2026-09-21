// The M13 browser proof for navigation by route name (`fixtures/apps/named_routes`, ADR-0072): go_router's `goNamed`,
// `pushNamed` and `pushReplacementNamed`, resolved against the routes' declared names — including a nested route
// (`/settings/profile`) — in the production build, with the same destinations as the by-path `go('/about')`.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('server-renders the home route, hydrates and says nothing', async ({ page }) => {
    const transcript = recordConsole(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect((await response?.text()) ?? '').toContain('page: home');
    await expect(page.getByText('page: home')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('navigation by route name (ADR-0072)', () => {
  test('goNamed reaches the route the name declares, and goNamed back returns home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'go about by name' }).click();
    await expect(page.getByText('page: about')).toBeVisible();
    await page.getByRole('button', { name: 'back home by name' }).click();
    await expect(page.getByText('page: home')).toBeVisible();
  });

  test('a by-name and a by-path navigation to the same route land on the same page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'go about by path' }).click();
    await expect(page.getByText('page: about')).toBeVisible();
    const byPath = await page.locator('body').innerText();
    await page.getByRole('button', { name: 'back home by name' }).click();
    await page.getByRole('button', { name: 'go about by name' }).click();
    await expect(page.getByText('page: about')).toBeVisible();
    expect(await page.locator('body').innerText()).toBe(byPath);
  });

  test('a nested route is reached by its own name, (`/settings/profile`)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'go nested profile by name' }).click();
    await expect(page.getByText('page: profile')).toBeVisible();
  });

  test('pushNamed pushes (pop returns), pushReplacementNamed replaces', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'push settings by name' }).click();
    await expect(page.getByText('page: settings')).toBeVisible();
    await page.getByRole('button', { name: 'replace with about' }).click();
    await expect(page.getByText('page: about')).toBeVisible();
    await page.goto('/');
    await page.getByRole('button', { name: 'push settings by name' }).click();
    await page.getByRole('button', { name: 'pop' }).click();
    await expect(page.getByText('page: home')).toBeVisible();
  });
});
