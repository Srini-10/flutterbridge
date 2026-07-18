// Verifies the applications exist before any browser starts — it does **not** build them.
//
// ## Why building here would be wrong
//
// Playwright starts `webServer` *before* `globalSetup`. So a setup that rebuilt the fixtures would wipe
// `build/bridge` underneath a `next start` that had already booted against the previous build — and the
// tests would then pass, against stale output. That is worse than failing: the suite's whole purpose is to
// assert on what the generator emits *now*.
//
// It showed up exactly that way: the production server came up serving an earlier build while setup
// rebuilt the directory, and the run reported 14 green.
//
// So `pnpm run e2e` builds first (`build-fixtures`) and runs Playwright second, and this only checks the
// result is there and says what to do when it is not.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { APPS, appDir } from '../src/build-fixtures.mjs';

export default async function globalSetup(): Promise<void> {
  const missing: string[] = [];

  for (const app of APPS) {
    const production = appDir(app.name);
    if (!existsSync(join(production, '.next'))) missing.push(`${app.name}: no production build at ${production}`);
    const development = join(production, '../../..', `${app.name}-dev`);
    if (!existsSync(development)) missing.push(`${app.name}: no development copy at ${development}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `the browser suite has nothing to run against:\n  ${missing.join('\n  ')}\n\n` +
        'Run `pnpm run build-fixtures` in e2e/ first — it drives the real pipeline (bridge build → ' +
        'npm install → next build). `pnpm run e2e` does both in the right order.',
    );
  }
}
