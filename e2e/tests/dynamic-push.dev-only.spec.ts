// The development build of the dynamic-push app: React's own diagnostics (hook order, keys, hydration) are not stripped here.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test('push, pick and pop leave the console clean', async ({ page }) => {
  const transcript = recordConsole(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Open detail' }).click();
  await expect(page.getByText('Owner: Ada')).toBeVisible();
  await page.getByRole('button', { name: 'Pick' }).click();
  await expect(page.getByText('Picked: picked Widget')).toBeVisible();
  await page.getByRole('button', { name: 'Open detail' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  expectNoHydrationMismatch(transcript);
  expectClean(transcript);
});
