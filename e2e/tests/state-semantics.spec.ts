// The M11 browser proof — one generated application (`fixtures/apps/state_semantics_e2e`), the production build:
//
//   ADR-0051  a `List`/`Map` held in State, mutated in place, shared with a child by prop and mutated by the child;
//   ADR-0052  `initState` (a pure part on the first frame, a logging part after commit) and `dispose`;
//   ADR-0053  a constructor default (`title = 'items'`) and an omitted nullable callback;
//   ADR-0050  checked integer arithmetic (`n << 20`, `(n - 5) % 7`) against values from real Dart.
//
// The unit and jsdom suites prove each rule against Flutter; only a real browser proves the generated Next.js application
// does the same, server-rendered and hydrated.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('server-renders, hydrates, and the first frame already has the pure part of initState', async ({ page }) => {
    const transcript = recordConsole(page);
    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);
    const html = (await response?.text()) ?? '';
    expect(html, 'a pure initState is on the server-rendered frame').toContain('probe n=42');
    expect(html).toContain('parent: 3,1,2 adds=0');
    expect(html, 'the constructor default reached the first render').toContain('child items: 3,1,2');
    await expect(page.getByText('probe n=42')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('a State-held list, mutated in place (ADR-0051)', () => {
  test('add / sort / removeAt re-render, and the child sees the same list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'add', exact: true }).click();
    await expect(page.getByText('parent: 3,1,2,3 adds=1')).toBeVisible();
    await expect(page.getByText('child items: 3,1,2,3')).toBeVisible();
    await page.getByRole('button', { name: 'sort' }).click();
    await expect(page.getByText('parent: 1,2,3,3 adds=1')).toBeVisible();
    await page.getByRole('button', { name: 'remove first' }).click();
    await expect(page.getByText('parent: 2,3,3 adds=1')).toBeVisible();
    await expect(page.getByText('child items: 2,3,3')).toBeVisible();
  });

  test('the child mutates the parent’s list through a prop, and both show it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'child add' }).click();
    await expect(page.getByText('parent: 3,1,2,103 adds=0')).toBeVisible();
    await expect(page.getByText('child items: 3,1,2,103')).toBeVisible();
  });
});

test.describe('initState / dispose (ADR-0052)', () => {
  test('init once, dispose exactly once per real unmount, init again on remount', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'show log' }).click();
    await expect(page.getByText('log: init', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'toggle probe' }).click();
    await expect(page.getByText('probe n=42')).toHaveCount(0);
    await page.getByRole('button', { name: 'show log' }).click();
    await expect(page.getByText('log: init,dispose', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'toggle probe' }).click();
    await expect(page.getByText('probe n=42')).toBeVisible();
    await page.getByRole('button', { name: 'show log' }).click();
    await expect(page.getByText('log: init,dispose,init', { exact: true })).toBeVisible();
  });
});

test.describe('checked integers (ADR-0050)', () => {
  test('a shift past 2^31 and a modulo match real Dart: 1<<20 = 1048576, (n-5)%7 = 6', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'shift' }).click();
    await expect(page.getByText('int n=1048576')).toBeVisible();
    await page.getByRole('button', { name: 'mod' }).click();
    await expect(page.getByText('int n=6')).toBeVisible();
    await page.getByRole('button', { name: 'shift' }).click();
    await expect(page.getByText('int n=6291456')).toBeVisible();
    await page.getByRole('button', { name: 'mod' }).click();
    await expect(page.getByText('int n=5')).toBeVisible();
  });
});
