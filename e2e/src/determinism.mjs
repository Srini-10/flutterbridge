#!/usr/bin/env node
// Runs the complete pipeline repeatedly and checks what must be byte-identical actually is.
//
// `bridge validate` already checks determinism and the normalization fixed point *within* one run, over one
// document in memory. This checks something the CLI cannot: that **separate, complete runs** — a fresh
// `flutter pub get`, a fresh analyze from source, a fresh normalize, a fresh generate, into a fresh
// directory — agree byte for byte.
//
// That is the property a user relies on when they diff a regenerated project, and the one a cache would
// break first. It is checked here rather than in a unit test because only the whole pipeline can be wrong
// about it.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { APPS, appDir, buildApp } from './build-fixtures.mjs';

const RUNS = 3;

/** sha256 of every emitted file, by project-relative path. `node_modules` and `.next` are not our output. */
function fingerprint(dir) {
  const digests = new Map();
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      if (entry.name === 'package-lock.json') continue; // npm's, not ours
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (statSync(full).isFile()) {
        digests.set(relative(dir, full), createHash('sha256').update(readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(dir);
  return digests;
}

/** The UIR documents, which are the compiler's real output — the emitted project is downstream of them. */
function documents(app) {
  const work = join(appDir(app), '../../.bridge');
  return {
    uir: createHash('sha256').update(readFileSync(join(work, 'uir.ndjson'))).digest('hex'),
    normalized: createHash('sha256').update(readFileSync(join(work, 'normalized.ndjson'))).digest('hex'),
  };
}

let failures = 0;

for (const app of APPS) {
  console.log(`\n${app.name}: ${RUNS} complete pipeline runs`);
  const runs = [];

  for (let i = 0; i < RUNS; i += 1) {
    // A full rebuild: `buildApp` wipes the target directory first, so nothing carries over between runs —
    // not the analyzer's cache, not `.dart_tool`, not the previous emitted project.
    buildApp(app, { production: false });
    runs.push({ files: fingerprint(appDir(app.name)), docs: documents(app.name) });
    process.stdout.write(`  run ${i + 1}: ${runs[i].files.size} files\n`);
  }

  const first = runs[0];
  for (let i = 1; i < RUNS; i += 1) {
    const run = runs[i];

    for (const [what, digest] of Object.entries(first.docs)) {
      const ok = run.docs[what] === digest;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what.padEnd(12)} run 1 vs run ${i + 1}  ${digest.slice(0, 16)}`);
      if (!ok) failures += 1;
    }

    const differing = [];
    for (const [path, digest] of first.files) {
      if (run.files.get(path) !== digest) differing.push(path);
    }
    for (const path of run.files.keys()) if (!first.files.has(path)) differing.push(`${path} (new)`);

    const ok = differing.length === 0;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${'emitted files'.padEnd(12)} run 1 vs run ${i + 1}  ${first.files.size} files`);
    if (!ok) {
      failures += 1;
      for (const path of differing) console.log(`         differs: ${path}`);
    }
  }
}

console.log(failures === 0 ? '\nbyte-identical across every run.' : `\n${failures} determinism failure(s).`);
process.exit(failures === 0 ? 0 : 1);
