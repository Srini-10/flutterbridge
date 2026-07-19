#!/usr/bin/env node
// Packs every publishable package into `release/`, and checks that what came out is installable.
//
// ## Why packing needs checking at all
//
// A package that builds is not a package that installs. Everything that makes this workspace
// convenient — `workspace:*` protocols, pnpm's linked `node_modules`, files resolved by walking up to
// the repository root — is absent from a tarball, and each of those was a real defect found in M5-C
// rather than a hypothetical:
//
//   * `@bridge/cli` shipped no analyzer, so an installed `bridge` could not analyze anything.
//   * The React generator emitted `"@bridge/runtime-react": "workspace:*"` into every application it
//     generated, and `workspace:` is a pnpm protocol. `npm install` in a generated app fails with
//     `EUNSUPPORTEDPROTOCOL` — so every emitted project was uninstallable outside this monorepo.
//
// Both were invisible from inside the workspace and obvious from outside it. So this asserts the
// properties a tarball must have, on the tarball, after packing.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release');

/**
 * Every package that is published. Order is irrelevant; `pnpm pack` resolves each independently.
 *
 * `@bridge/verification` is **absent, on purpose**. Its source is `export {}` behind an M2 stub tag, and
 * nothing imports it. It stays in the workspace because Spec §1.2's dependency rules are enforced against
 * its directory — that is what it has been for since M0 — but publishing an empty package under a name
 * that promises "verifier host, first-party verifiers, reference-build manager, report renderer" is a
 * capability claim with nothing behind it. It ships when it does something.
 */
const PACKAGES = [
  'packages/uir',
  'packages/plugin-sdk',
  'packages/core',
  'packages/compiler',
  'packages/adapters/widgets-material',
  'packages/generators/react',
  'packages/runtimes/react',
  'packages/cli',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });


/**
 * `pnpm` is `pnpm.cmd` on Windows, and `execFileSync` refuses a `.cmd` without a shell — Node blocks
 * batch files outright (the CVE-2024-27980 mitigation), so the spawn fails with `ENOENT` on a program
 * plainly on `PATH`.
 *
 * The same defect the CLI had with `dart.bat` (M5-E) and the build proof had with `tsc` — third time,
 * third file. The pattern worth remembering: **anything invoked by name that is a launcher rather than
 * an executable needs a shell on Windows**, and Node will not tell you until it fails.
 *
 * A shell means the command line is re-parsed, so the one argument that can contain a space — the
 * destination directory — is quoted. `"` is a reserved character in a Windows path, so simple quoting is
 * sufficient here and there is no escaping to get wrong.
 */
const WINDOWS = process.platform === 'win32';
const shellArg = (value) => (WINDOWS && /\s/.test(value) ? `"${value}"` : value);

const problems = [];
const packed = [];

for (const dir of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));

  execFileSync(WINDOWS ? 'pnpm.cmd' : 'pnpm', ['pack', '--pack-destination', shellArg(out)], {
    cwd: join(root, dir),
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: WINDOWS,
  });

  const tarball = readdirSync(out).find(
    (f) => f.startsWith(`${manifest.name.replace('@', '').replace('/', '-')}-`) && f.endsWith('.tgz'),
  );
  if (tarball === undefined) {
    problems.push(`${manifest.name}: pnpm pack produced no tarball`);
    continue;
  }

  const listing = execFileSync('tar', ['-tzf', join(out, tarball)], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ''));

  // ── the tarball must carry a manifest with no workspace-only protocols ──
  const shipped = JSON.parse(
    execFileSync('tar', ['-xzOf', join(out, tarball), 'package/package.json'], { encoding: 'utf8' }),
  );
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(shipped[field] ?? {})) {
      if (/^(workspace|link|file|portal):/.test(range)) {
        problems.push(`${manifest.name}: ${field}.${name} is "${range}" — a registry cannot resolve that`);
      }
      if (range === 'catalog:') {
        problems.push(`${manifest.name}: ${field}.${name} is "catalog:" — pnpm did not substitute it`);
      }
    }
  }

  // ── the entry points the manifest promises must actually be inside ──
  for (const promised of [shipped.main, shipped.types].filter(Boolean)) {
    const path = promised.replace(/^\.\//, '');
    if (!listing.includes(path)) {
      problems.push(`${manifest.name}: declares "${promised}" and the tarball does not contain it`);
    }
  }

  // ── the CLI has to carry the analyzer, or an install cannot analyze ──
  if (manifest.name === '@bridge/cli') {
    const entry = 'vendor/dart/bridge_analyzer/bin/bridge_analyzer.dart';
    if (!listing.includes(entry)) {
      problems.push(`@bridge/cli: does not contain ${entry} — run tools/bundle-analyzer.mjs (prepack)`);
    }
    if (!listing.includes('vendor/dart/bridge_analyzer/pubspec.lock')) {
      problems.push('@bridge/cli: ships the analyzer without pubspec.lock — the install would be unpinned');
    }
    if (!listing.some((f) => f.startsWith('vendor/dart/bridge_uir/lib/'))) {
      problems.push('@bridge/cli: ships bridge_analyzer without bridge_uir, which it depends on by path');
    }
  }

  packed.push({ name: manifest.name, tarball, bytes: statSync(join(out, tarball)).size, files: listing.length });
}

const width = Math.max(...packed.map((p) => p.name.length));
for (const p of packed) {
  console.log(`  ${p.name.padEnd(width)}  ${String(p.files).padStart(4)} files  ${(p.bytes / 1024).toFixed(0).padStart(5)} KiB`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} packaging problem(s):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`\n${packed.length} package(s) → release/`);
