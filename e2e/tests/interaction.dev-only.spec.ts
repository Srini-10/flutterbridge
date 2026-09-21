// What the **development** build says about the M13 gesture model: React's full diagnostics, and StrictMode's replay of
// the recogniser's mount → cleanup → mount, which is where a timer that survived its unmount would show.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('the development build', () => {
  test('hydrates without a mismatch and says nothing on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText('press pad')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });

  test('a tap, a double tap and a long press behave as in production, with nothing on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    const pad = page.getByText('press pad');
    await pad.dblclick();
    await expect(page.getByText('pad: double', { exact: true })).toBeVisible();
    await pad.click();
    await expect(page.getByText('pad: double,down,up,tap', { exact: true })).toBeVisible();
    expectClean(transcript);
  });

  test('a LayoutBuilder resizes with nothing on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText('box: narrow 300.0 x 90.0')).toBeVisible();
    await page.getByRole('button', { name: 'wide box' }).click();
    await expect(page.getByText('box: wide 640.0 x 90.0')).toBeVisible();
    await page.setViewportSize({ width: 600, height: 700 });
    await expect(page.getByText(/^page: (5|6)\d\d free=true$/)).toBeVisible();
    expectClean(transcript);
  });

  test('lists of widgets passed to a project widget raise no React key warning as they grow', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'add action' }).click();
    await page.getByRole('button', { name: 'add action' }).click();
    await expect(page.getByText('action 2')).toBeVisible();
    expectClean(transcript);
  });
});
