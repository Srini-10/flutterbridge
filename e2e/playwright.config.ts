// Browser validation configuration.
//
// Two projects, because "it works" has two different meanings that have historically diverged:
//
//   * **production** — `next build` + `next start`. What a user deploys. Server-rendered HTML, hydration,
//     minified React (whose warnings are *shortened*, not removed).
//   * **development** — `next dev`. What a user iterates in. React's development build is where hydration
//     mismatches and key warnings are reported in full, and several classes of defect are only ever
//     visible here.
//
// Running only production would miss the diagnostics; running only development would miss build-time and
// prerender failures. The suite asserts on both.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Generated applications are built once by the global setup; the tests must not race each other for a
  // port or a `.next` directory.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['json', { outputFile: 'results.json' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: './tests/global-setup.ts',

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3311' },
      testIgnore: /dev-only/,
    },
    {
      name: 'development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3312' },
      testMatch: /(console|dev-only)/,
    },
  ],

  webServer: [
    {
      // `next start` — the production server, serving the output of `next build`.
      command: 'npx next start --port 3311',
      cwd: './.fixtures/counter/build/bridge',
      port: 3311,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3312',
      // A separate copy: `next dev` and `next start` both own `.next` and cannot share a directory.
      cwd: './.fixtures/counter-dev',
      port: 3312,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
