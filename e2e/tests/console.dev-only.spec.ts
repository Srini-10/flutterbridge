// What the **development** build says.
//
// This file exists because production hides the diagnostics that matter most for generated code. React's
// production build strips warning text to a numbered URL and skips whole classes of check outright:
//
//   * **Hydration mismatches** are reported in full only in development, with the server and client text
//     side by side. In production you get a terse error, or a silent client re-render.
//   * **Key warnings** (`Each child in a list should have a unique "key" prop`) are development-only. The
//     generator emits keys from `ValueKey` and from list indices — exactly the code that produces them.
//   * **Rules-of-hooks violations** surface as a hook-order error, and the readable form is development's.
//     That class is not theoretical here: M5-D's fix hoisted `useSignal` out of JSX *because* an inline
//     hook inside a `ui.Cond` branch or a list template is a conditional hook call.
//
// A suite that only ran production would report green on all three.

import { expect, test } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, of, recordConsole } from './support.js';

test.describe('the development build', () => {
  test('hydrates without a mismatch', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Interact before asserting: hydration completing is what makes the handler live, so a click that
    // works is the proof the HTML was adopted rather than replaced.
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/1 times/);

    expectNoHydrationMismatch(transcript);
  });

  test('reports no key warnings for the emitted list', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const keyWarnings = transcript.messages.filter(
      (message) => message.text.includes('unique "key"') || message.text.includes('key prop'),
    );
    expect(keyWarnings.map((m) => m.text), 'React key warnings').toEqual([]);
  });

  test('reports no hook-order or rules-of-hooks violation', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Several renders, since a hook-order violation only shows on a render *after* the one that changed
    // the call sequence.
    const increment = page.getByRole('main').getByRole('button', { name: 'Increment' });
    for (let i = 0; i < 4; i += 1) await increment.click();
    await expect(page.getByText(/You have pushed the button/)).toHaveText(/4 times/);

    const hookProblems = transcript.messages.filter(
      (message) =>
        message.text.includes('Rendered more hooks') ||
        message.text.includes('Rendered fewer hooks') ||
        message.text.includes('order of Hooks') ||
        message.text.includes('Invalid hook call'),
    );
    expect(hookProblems.map((m) => m.text), 'hook violations').toEqual([]);
  });

  test('says nothing on the console but React’s own DevTools banner', async ({ page }) => {
    // The strictest assertion in the suite, and the one most likely to catch the next defect: development
    // React is loud, so near-silence here means the emitted code is doing nothing React objects to.
    const transcript = recordConsole(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('main').getByRole('button', { name: 'Increment' }).click();
    await page.waitForTimeout(400);

    expectClean(transcript);

    // The one tolerated message, named rather than filtered by a pattern.
    //
    // React's development build prints "Download the React DevTools…" on every mount of every React
    // application in existence. It comes from `react-dom`, not from anything the generator emitted, and it
    // does not appear in production. Allowing it by exact subject — rather than adding an "ignore info
    // messages" rule — keeps the next `info` the emitted code produces a failure.
    const REACT_DEVTOOLS_BANNER = 'Download the React DevTools';

    expect(
      of(transcript, 'error', 'warning', 'log', 'info')
        .filter((message) => !message.text.includes(REACT_DEVTOOLS_BANNER))
        .map((message) => `${message.type}: ${message.text}`),
      'development console output, excluding React’s own DevTools banner',
    ).toEqual([]);
  });
});
