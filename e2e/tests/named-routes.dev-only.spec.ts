// The development build of the named-route app: no hydration mismatch and nothing on the console through a by-name navigation.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('the development build', () => {
  test('navigates by name with nothing on the console', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByText('page: home')).toBeVisible();
    await page.getByRole('button', { name: 'go about by name' }).click();
    await expect(page.getByText('page: about')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});
