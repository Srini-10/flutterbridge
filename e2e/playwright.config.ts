// Browser validation configuration.
//
// Two projects per application, because "it works" has two different meanings that have historically
// diverged:
//
//   * **production** — `next build` + `next start`. What a user deploys. Server-rendered HTML, hydration,
//     minified React (whose warnings are *shortened*, not removed).
//   * **development** — `next dev`. What a user iterates in. React's development build is where hydration
//     mismatches and key warnings are reported in full, and several classes of defect are only ever
//     visible here — including a conditional/reordered hook, which is exactly the failure mode M7-F's
//     store consumption must not reintroduce (Phase 9's own requirement: prove it where a violation would
//     actually be visible).
//
// Running only production would miss the diagnostics; running only development would miss build-time and
// prerender failures. The suite asserts on both, per application.
//
// `promotion.spec.ts` gets its own pair of projects/ports (3313/3314) rather than sharing `counter`'s —
// each spec file must resolve to exactly one `baseURL`, and `promoted_counter` (M7-F) is a different
// generated application from `counter`, at a different `.fixtures/` path.
//
// `inline-push.spec.ts` gets its own pair (3315/3316) for the same reason: `inline_push_props` (M7-G) is
// a third, distinct generated application.

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
      testMatch: /app\.spec/,
    },
    {
      name: 'development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3312' },
      // Precisely `console.dev-only.spec.ts` — a bare `/dev-only/` would also match
      // `promotion.dev-only.spec.ts` below, which needs the *other* app's port.
      testMatch: /console\.dev-only\.spec/,
    },
    {
      name: 'promotion-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3313' },
      testMatch: /promotion\.spec/,
    },
    {
      name: 'promotion-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3314' },
      testMatch: /promotion\.dev-only\.spec/,
    },
    {
      name: 'inline-push-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3315' },
      testMatch: /inline-push\.spec/,
    },
    {
      name: 'inline-push-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3316' },
      testMatch: /inline-push\.dev-only\.spec/,
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
    {
      command: 'npx next start --port 3313',
      cwd: './.fixtures/promoted-counter/build/bridge',
      port: 3313,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3314',
      cwd: './.fixtures/promoted-counter-dev',
      port: 3314,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3315',
      cwd: './.fixtures/inline-push-props/build/bridge',
      port: 3315,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3316',
      cwd: './.fixtures/inline-push-props-dev',
      port: 3316,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
