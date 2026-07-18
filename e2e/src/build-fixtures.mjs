#!/usr/bin/env node
// Builds the applications the browser suite runs against — through the real pipeline, every time.
//
// ## Why this exists rather than a checked-in React app
//
// M5-A deferred the browser suite with a reason worth repeating: *"Building a Playwright suite against the
// build-proof fixture instead would test the fixture… it would add a browser, not a subject."* The same
// argument rules out a hand-written React app here. The subject has to be **what the compiler actually
// emits**, produced the way a user produces it:
//
//   Flutter source → bridge build (analyzer → UIR → N1–N11 → generator) → npm install → next build
//
// Every step is the real one. `bridge` is invoked through its own binary, not by importing the generator;
// `next build` is the real Next.js production build. Nothing here reimplements a stage, because a harness
// that reimplemented one would be testing the harness.
//
// ## Why the runtime kit comes from a packed tarball
//
// The emitted `package.json` depends on `@bridge/runtime-react@^0.1.0`, which is not on the public
// registry. Installing it from `just package`'s tarball is the closest honest thing: it is the exact
// artifact M5-C validated through a registry round-trip, installed by real `npm` into a real
// `node_modules`. A `file:` link or a pnpm workspace link would be a different resolution path from the
// one a user gets — and D4 in M5-C was precisely a workspace-only protocol that nobody noticed.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const workspace = join(here, '../.fixtures');

/**
 * The applications the suite runs against.
 *
 * `hello_bridge` is deliberately absent, and that absence is a finding rather than an omission: it reports
 * 30 generator errors and emits nothing, so there is no application to load. `docs/m5/m5d-*.md` §2 lists
 * every one of them by owner. Adding it here with its assertions skipped would turn a refusal the compiler
 * makes correctly into a suite that looks like it covers more than it does.
 */
export const APPS = [{ name: 'counter', source: 'examples/counter' }];

const run = (program, args, cwd, env = {}) =>
  execFileSync(program, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

/** The runtime kit tarball, built if it is not there. */
function kitTarball() {
  const tarball = join(repo, 'release/bridge-runtime-react-0.1.0.tgz');
  if (!existsSync(tarball)) {
    console.log('  packing release artifacts (tools/pack-release.mjs)…');
    run('node', ['tools/pack-release.mjs'], repo);
  }
  return tarball;
}

/** Builds one application end to end, and returns where it landed. */
export function buildApp(app, { production = true } = {}) {
  const target = join(workspace, app.name);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  // A copy, not the source tree: `bridge build` writes `.bridge/` and `build/` beside the project, and a
  // test suite must not mutate the repository it is validating.
  cpSync(join(repo, app.source, 'lib'), join(target, 'lib'), { recursive: true });
  cpSync(join(repo, app.source, 'pubspec.yaml'), join(target, 'pubspec.yaml'));

  const timings = {};
  const at = (name, fn) => {
    const started = Date.now();
    const result = fn();
    timings[name] = Date.now() - started;
    return result;
  };

  at('pubGet', () => run('flutter', ['pub', 'get'], target));
  at('bridgeInit', () => run('node', [join(repo, 'packages/cli/bin/bridge.mjs'), 'init'], target));

  // The whole compiler, through its public entry point. `--json` so the per-stage timings are the CLI's
  // own numbers rather than this script's guesses about them.
  const output = at('bridgeBuild', () =>
    run('node', [join(repo, 'packages/cli/bin/bridge.mjs'), 'build', '--json'], target),
  );
  const stages = JSON.parse(output);
  if (!stages.ok) {
    throw new Error(`bridge build failed for ${app.name}:\n${JSON.stringify(stages.stages, null, 2)}`);
  }
  for (const stage of stages.stages) timings[`bridge:${stage.name}`] = stage.ms;

  const emitted = join(target, 'build/bridge');
  at('npmInstall', () => {
    run('npm', ['install', kitTarball(), '--silent'], emitted);
    run('npm', ['install', '--silent'], emitted);
  });

  if (production) {
    at('nextBuild', () => run('npx', ['next', 'build'], emitted));
  }

  writeFileSync(join(target, 'timings.json'), `${JSON.stringify(timings, null, 2)}\n`);
  return { dir: emitted, timings };
}

/**
 * A second copy of an emitted application, for the development server.
 *
 * `next dev` and `next start` cannot share a project directory: both own `.next`, and running them
 * concurrently means one rewrites what the other is serving. The symptom is not a useful error — the dev
 * server simply never becomes reachable, and every development test fails with `ERR_CONNECTION_REFUSED`.
 *
 * A copy is the honest fix. Pointing `distDir` elsewhere would mean editing the generated `next.config.mjs`
 * — that is, testing a configuration the generator does not emit.
 *
 * `.next` is excluded: the dev server builds its own, and copying a production build into a development
 * project is asking for exactly the confusion this function exists to avoid.
 */
export function copyForDev(name) {
  const from = join(workspace, name, 'build/bridge');
  const to = join(workspace, `${name}-dev`);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, {
    recursive: true,
    filter: (source) => !source.endsWith('/.next') && !source.includes('/.next/'),
  });
  return to;
}

/** Where an already-built application lives, without rebuilding it. */
export function appDir(name) {
  return join(workspace, name, 'build/bridge');
}

/** The bundle sizes `next build` produced, read from its own build manifest. */
export function bundleReport(dir) {
  const path = join(dir, '.next/build-manifest.json');
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const app of APPS) {
    console.log(`building ${app.name}…`);
    const { dir, timings } = buildApp(app);
    const dev = copyForDev(app.name);
    console.log(`  → ${dir}`);
    console.log(`  → ${dev} (development server)`);
    for (const [stage, ms] of Object.entries(timings)) console.log(`     ${stage.padEnd(16)} ${ms}ms`);
  }
}
