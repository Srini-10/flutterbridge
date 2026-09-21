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
//
// `async-push-guard.spec.ts` gets its own pair (3317/3318): `async_push_guard` (M7-H/M7-J) is a fourth.
//
// `local-store.spec.ts` gets its own pair (3319/3320): `local_store` (M7-N, ADR-27) is a fifth, distinct
// generated application.
//
// `state-semantics.spec.ts` gets its own pair (3321/3322): `state_semantics_e2e` (M11) is a sixth.
//
// `interaction.spec.ts` gets its own pair (3323/3324): `interaction_e2e` (M13) is a seventh.
//
// `named-routes.spec.ts` gets its own pair (3325/3326): `named_routes` (M13) is an eighth.
//
// `dio-client.spec.ts` gets its own pair (3327/3328): `dio_client` (M14) is a ninth.

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
    {
      name: 'async-push-guard-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3317' },
      testMatch: /async-push-guard\.spec/,
    },
    {
      name: 'async-push-guard-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3318' },
      testMatch: /async-push-guard\.dev-only\.spec/,
    },
    {
      name: 'local-store-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3319' },
      testMatch: /local-store\.spec/,
    },
    {
      name: 'local-store-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3320' },
      testMatch: /local-store\.dev-only\.spec/,
    },
    {
      name: 'state-semantics-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3321' },
      testMatch: /state-semantics\.spec/,
    },
    {
      name: 'state-semantics-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3322' },
      testMatch: /state-semantics\.dev-only\.spec/,
    },
    {
      name: 'interaction-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3323' },
      testMatch: /interaction\.spec/,
    },
    {
      name: 'interaction-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3324' },
      testMatch: /interaction\.dev-only\.spec/,
    },
    {
      name: 'named-routes-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3325' },
      testMatch: /named-routes\.spec/,
    },
    {
      name: 'named-routes-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3326' },
      testMatch: /named-routes\.dev-only\.spec/,
    },
    {
      name: 'dio-client-production',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3327' },
      testMatch: /dio-client\.spec/,
    },
    {
      name: 'dio-client-development',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3328' },
      testMatch: /dio-client\.dev-only\.spec/,
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
    {
      command: 'npx next start --port 3317',
      cwd: './.fixtures/async-push-guard/build/bridge',
      port: 3317,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3318',
      cwd: './.fixtures/async-push-guard-dev',
      port: 3318,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3319',
      cwd: './.fixtures/local-store/build/bridge',
      port: 3319,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3320',
      cwd: './.fixtures/local-store-dev',
      port: 3320,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3321',
      cwd: './.fixtures/state-semantics/build/bridge',
      port: 3321,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3322',
      cwd: './.fixtures/state-semantics-dev',
      port: 3322,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3323',
      cwd: './.fixtures/interaction/build/bridge',
      port: 3323,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3324',
      cwd: './.fixtures/interaction-dev',
      port: 3324,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3325',
      cwd: './.fixtures/named-routes/build/bridge',
      port: 3325,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3326',
      cwd: './.fixtures/named-routes-dev',
      port: 3326,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next start --port 3327',
      cwd: './.fixtures/dio-client/build/bridge',
      port: 3327,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx next dev --port 3328',
      cwd: './.fixtures/dio-client-dev',
      port: 3328,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
