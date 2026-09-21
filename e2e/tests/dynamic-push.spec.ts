// An inline `Navigator.push` whose arguments are computed where the push happens (ADR-0077), in a real browser.
//
// Every argument here is something the page module cannot know: `owner` is `HomeScreen`'s own constructor parameter, `label` a
// local, `item` a live object, `header` a widget, `onPick` a closure that writes `HomeScreen`'s state. The compiler used to
// refuse all five (BRG2305, BRG2301) on the grounds that they could not cross a URL — but a pushed component has no URL.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test('the pushed screen receives the caller’s own values, evaluated at the push', async ({ page }) => {
  const transcript = recordConsole(page);
  await page.goto('/');
  await expect(page.getByText('Taps: 0')).toBeVisible();

  // The local `label` reads `_taps`, so the same button gives a different screen after a tap: nothing here is a constant.
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Open detail' }).click();

  await expect(page.locator('header:visible')).toContainText('Tap 2');
  await expect(page.getByText('Heading: Details')).toBeVisible(); // the one constant, bound by the page module
  await expect(page.getByText('Owner: Ada')).toBeVisible(); // the caller's own constructor parameter
  await expect(page.getByText('Item: Widget x3')).toBeVisible(); // a live object, `Item('Widget', _taps + 1)`
  await expect(page.getByText('Header for Tap 2')).toBeVisible(); // a widget
  expectNoHydrationMismatch(transcript);
  expectClean(transcript);
});

test('popping returns to the screen that pushed, with its state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Open detail' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  // Flutter keeps the route underneath alive, so a push and a pop leave the pushing screen exactly as it was.
  await expect(page.getByText('Taps: 3')).toBeVisible();
});

test('a closure the destination calls writes the pushing screen’s state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tap', exact: true }).click();
  await page.getByRole('button', { name: 'Open detail' }).click();
  await page.getByRole('button', { name: 'Pick' }).click();

  await expect(page.getByText('Picked: picked Widget')).toBeVisible();
  await expect(page.getByText('Taps: 1')).toBeVisible();
});
