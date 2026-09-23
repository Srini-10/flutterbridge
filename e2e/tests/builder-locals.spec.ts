// The statement-bodied builder browser proof — `Builder`/`Consumer`/`ListView.builder` whose block body is
// leading locals then one `return` (`_bindLeadingLocalsAndReturn`), in a real browser.
//
// The generator's build-proof tests (`riverpod_builder_body_locals_build.test.ts`, real `tsc --strict`) are
// necessary and not sufficient here. What inlining a
// local could break silently is the *subscription*: the only `ref.watch(countProvider)` in the app lives in a
// local's initializer, so if the hoisted `useWatch` were dropped (or turned into a one-shot read) the page
// would still typecheck, still render `count: 0`, and simply never change. This suite clicks the button and
// requires both reads of the local — and the second local derived from it — to follow the provider.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('server-renders every inlined local, then hydrates', async ({ page }) => {
    const transcript = recordConsole(page);

    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);

    const html = (await response?.text()) ?? '';
    expect(html, 'a plain Builder local, read once').toContain('status');
    expect(html, 'a chained local through toUpperCase').toContain('STATUS');
    expect(html, 'a ref.watch local, read').toContain('count: 0');
    expect(html, 'a local derived from a ref.watch local').toContain('doubled: 0');
    expect(html, 'an itemBuilder local').toContain('alpha');

    await expect(page.getByText('count: 0')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('inlined locals', () => {
  test('a chain of two Builder locals renders both reads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('status', { exact: true })).toBeVisible();
    await expect(page.getByText('STATUS', { exact: true })).toBeVisible();
  });

  test('an itemBuilder reading its item through a local renders every item, top to bottom in source order', async ({ page }) => {
    await page.goto('/');
    const ys: number[] = [];
    for (const name of ['alpha', 'beta', 'gamma']) {
      const row = page.getByText(name, { exact: true });
      await expect(row).toBeVisible();
      const box = await row.boundingBox();
      expect(box, `${name} has a box`).not.toBeNull();
      ys.push(box?.y ?? -1);
    }
    expect([...ys].sort((a, b) => a - b), 'rows are laid out in source order').toEqual(ys);
    expect(new Set(ys).size, 'three distinct rows').toBe(3);
  });
});

test.describe('the ref.watch that lives only in a local initializer', () => {
  test('follows the provider: both reads and the derived local update on every write', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/');

    await expect(page.getByText('count: 0')).toBeVisible();
    await expect(page.getByText('doubled: 0')).toBeVisible();

    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('count: 1')).toBeVisible();
    await expect(page.getByText('doubled: 2')).toBeVisible();

    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('count: 3')).toBeVisible();
    await expect(page.getByText('doubled: 6')).toBeVisible();

    // The previous values are gone — the text was replaced, not appended to.
    await expect(page.getByText('count: 0')).toHaveCount(0);
    expectClean(transcript);
  });
});
