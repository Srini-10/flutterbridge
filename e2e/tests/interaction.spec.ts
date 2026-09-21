// The M13 browser proof — one generated application (`fixtures/apps/interaction_e2e`), the production build, a real mouse
// and keyboard:
//
//   ADR-0071  LayoutBuilder: the box size on offer, rebuilt when a button resizes the box and when the window resizes.
//   ADR-0070  GestureDetector / InkWell: tap, tap down/up/cancel, double tap, long press, hover, keyboard focus and
//             activation, the disabled state.
//
// `gestures_execution.test.ts` compares the same rules with Flutter step by step in jsdom; this proves the generated Next.js
// application receives real pointer and key events the same way, server-rendered and hydrated.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('startup', () => {
  test('server-renders, hydrates and says nothing', async ({ page }) => {
    const transcript = recordConsole(page);
    const response = await page.goto('/');
    expect(response?.status(), 'HTTP status').toBe(200);
    expect((await response?.text()) ?? '').toContain('pad: ');
    await expect(page.getByText('press pad')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });
});

test.describe('the tap family on a GestureDetector (ADR-0070)', () => {
  test('a double tap is one double — never the tap, the down or the up of its first press', async ({ page }) => {
    await page.goto('/');
    await page.getByText('press pad').dblclick();
    await expect(page.getByText('pad: double', { exact: true })).toBeVisible();
    // The first tap's window is closed by the second press; nothing arrives late.
    await page.waitForTimeout(450);
    await expect(page.getByText('pad: double', { exact: true })).toBeVisible();
  });

  test('a single tap waits out the double-tap window, then reports down, up, tap together', async ({ page }) => {
    await page.goto('/');
    await page.getByText('press pad').click();
    await expect(page.getByText('pad: ', { exact: true })).toBeVisible();
    await expect(page.getByText('pad: down,up,tap', { exact: true })).toBeVisible();
  });

  test('a long press cancels the tap, then long; the release adds nothing', async ({ page }) => {
    await page.goto('/');
    const pad = page.getByText('press pad');
    await pad.hover();
    await page.mouse.down();
    await expect(page.getByText('pad: down,cancel,long', { exact: true })).toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(450);
    await expect(page.getByText('pad: down,cancel,long', { exact: true })).toBeVisible();
  });

  test('a press dragged past the slop is a cancel, and its release is not a tap', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByText('press pad').boundingBox();
    if (box === null) throw new Error('press pad has no box');
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await expect(page.getByText('pad: down', { exact: true })).toBeVisible();
    await page.mouse.move(box.x + 60, box.y + 5, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByText('pad: down,cancel', { exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await expect(page.getByText('pad: down,cancel', { exact: true })).toBeVisible();
  });

  test('TapDownDetails.localPosition is relative to the detector', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByText('press pad').boundingBox();
    if (box === null) throw new Error('press pad has no box');
    await page.mouse.move(box.x + 30, box.y + 5);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByText('local x: 30')).toBeVisible();
  });
});

test.describe('an InkWell (ADR-0070)', () => {
  test('hover in and out, tap, and a click does not focus it', async ({ page }) => {
    await page.goto('/');
    const ink = page.getByText('ink well');
    await ink.hover();
    await expect(page.getByText('ink: in enabled=true', { exact: true })).toBeVisible();
    await ink.click();
    await expect(page.getByText('ink: in,tap enabled=true', { exact: true })).toBeVisible();
    // The browser focused the element on the click; Flutter did not (so no `focus`), and an Enter now must not activate it.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await expect(page.getByText('ink: in,tap enabled=true', { exact: true })).toBeVisible();
    await page.getByText('press pad').hover();
    await expect(page.getByText('ink: in,tap,out enabled=true', { exact: true })).toBeVisible();
  });

  test('keyboard focus is reported, Enter and Space activate it, blur is reported', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByText('ink: focus enabled=true', { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page.getByText('ink: focus,tap,tap enabled=true', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByText('ink: focus,tap,tap,blur enabled=true', { exact: true })).toBeVisible();
  });

  test('a null onTap disables it: no tap, no focus stop, and it is exposed as disabled', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'toggle ink' }).click();
    await expect(page.getByText('enabled=false')).toBeVisible();
    await page.getByText('ink well').click({ force: true });
    await expect(page.getByText('ink:  enabled=false', { exact: true })).toBeVisible();
    await expect(page.locator('[role="button"][aria-disabled="true"]')).toHaveCount(1);
    await expect(page.locator('[role="button"][tabindex="0"]')).toHaveCount(0);
  });
});

test.describe('a LayoutBuilder (ADR-0071)', () => {
  test('the builder sees the box on offer, and is rebuilt when a button resizes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('box: narrow 300.0 x 90.0')).toBeVisible();
    await page.getByRole('button', { name: 'wide box' }).click();
    await expect(page.getByText('box: wide 640.0 x 90.0')).toBeVisible();
    await page.getByRole('button', { name: 'narrow box' }).click();
    await expect(page.getByText('box: narrow 300.0 x 90.0')).toBeVisible();
  });

  test('a builder in a Column has no height limit; one under a SizedBox has', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/^page: \d+ free=true$/)).toBeVisible();
    await expect(page.getByText('box: narrow 300.0 x 90.0')).toBeVisible();
  });

  test('a window resize rebuilds it', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('/');
    await expect(page.getByText(/^page: (\d+) free=true$/)).toBeVisible();
    const before = Number((await page.getByText(/^page: \d+ free=true$/).textContent())?.match(/\d+/)?.[0]);
    expect(before, 'the page builder sees roughly the viewport width').toBeGreaterThan(900);
    await page.setViewportSize({ width: 500, height: 700 });
    await expect(page.getByText(/^page: \d+ free=true$/)).toHaveText(/^page: (4\d\d|500) free=true$/);
    const after = Number((await page.getByText(/^page: \d+ free=true$/).textContent())?.match(/\d+/)?.[0]);
    expect(after).toBeLessThan(before);
  });

  test('a shrink-wrapped, padded parent still offers the page width less its padding', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    const number = async (pattern: RegExp): Promise<number> =>
      Number((await page.getByText(pattern).textContent())?.match(/\d+/)?.[0]);
    await expect(page.getByText(/^padded: \d+$/)).toBeVisible();
    const pageWidth = await number(/^page: \d+ free=true$/);
    expect(await number(/^padded: \d+$/)).toBe(pageWidth - 40);
    await page.setViewportSize({ width: 700, height: 700 });
    await expect.poll(() => number(/^page: \d+ free=true$/)).toBeLessThan(pageWidth);
    await expect.poll(async () => (await number(/^page: \d+ free=true$/)) - (await number(/^padded: \d+$/))).toBe(40);
  });

  test('a nested builder sees the space left after the padding around it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('nested: 350')).toBeVisible();
  });

  test('server-rendered HTML holds the empty wrapper; the content arrives in the first layout effect', async ({ page }) => {
    const response = await page.goto('/');
    const html = (await response?.text()) ?? '';
    expect(html).not.toContain('box: narrow');
    await expect(page.getByText('box: narrow 300.0 x 90.0')).toBeVisible();
  });
});

test.describe('widgets and lists of widgets as named parameters of a project widget (ADR-0074)', () => {
  test('a header, a leading list and a growing actions list all arrive, in order — none dropped', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('div', { has: page.getByText('row header', { exact: true }) }).last();
    await expect(row).toContainText('row headerlead oneaction 0');
    await page.getByRole('button', { name: 'add action' }).click();
    await expect(row).toContainText('row headerlead oneaction 0action 1');
  });
});
