import { defineConfig } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M0-T5 — the determinism contract.
//
// A golden that is not deterministic is not a gate, it is noise (risk R5). Everything that could
// differ between the two apps — browser, viewport, DPR, motion, locale, timezone, colour scheme —
// is pinned HERE, once, and both capture scripts import these values. Neither app gets to choose.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Identical viewport for both apps. */
export const VIEWPORT = { width: 1200, height: 900 } as const;

/** Identical device scale factor: 1 CSS px == 1 device px, so no resampling enters the diff. */
export const DEVICE_SCALE_FACTOR = 1;

/** Identical browser for both apps: Playwright's pinned Chromium. Never the system browser. */
export const BROWSER = 'chromium' as const;

/** Context options applied identically to the Flutter page and the React page. */
export const CONTEXT_OPTIONS = {
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  colorScheme: 'light',
  reducedMotion: 'reduce',
  locale: 'en-US',
  timezoneId: 'UTC',
} as const;

/** Screenshot options: animations frozen, caret hidden — nothing time-dependent may reach a golden. */
export const SCREENSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
} as const;

/** Ports. Fixed, so a stale server is a loud failure rather than a silent wrong capture. */
export const FLUTTER_PORT = 8130;
export const NEXT_PORT = 8131;

/**
 * Screens under test.
 *
 * `login` is the only *comparable* screen at M0: the React reference implements the login screen
 * only (M0-T4), and its /home is an acknowledged placeholder. `home` is captured from Flutter as an
 * informational baseline and is explicitly NOT diffed — diffing a real screen against a placeholder
 * would produce a number that means nothing.
 */
export const SCREENS = [
  { id: 'login', comparable: true },
  { id: 'home', comparable: false },
] as const;

/** pixelmatch tuning. includeAA=false: antialiasing pixels are not counted as differences. */
export const PIXELMATCH_OPTIONS = {
  threshold: 0.1,
  includeAA: false,
} as const;

// Present because the deliverable list requires it, and so a future `@playwright/test` suite (M4)
// inherits exactly the same determinism contract the M0 scripts use.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: {
    ...CONTEXT_OPTIONS,
    browserName: BROWSER,
  },
});
