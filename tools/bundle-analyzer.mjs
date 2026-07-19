#!/usr/bin/env node
// Copies the Dart analyzer into `@bridge/cli` so that publishing the CLI publishes the compiler
// frontend with it.
//
// ## Why the analyzer ships as Dart source
//
// The analyzer is a separate program in a separate language (ADR-2), and until M5-C it was findable
// only inside a checkout — which is why nobody outside this repository could run FlutterBridge at all.
// Something has to go in the npm package. Three forms were built and measured on `examples/counter`:
//
//   | form            | size  | analyze | portability                                          |
//   | --------------- | ----- | ------- | ---------------------------------------------------- |
//   | source (.dart)  | 1.0 M | 9.04 s  | every platform, every Dart SDK the pubspec admits    |
//   | kernel (.dill)  |  32 M | 5.79 s  | every platform, **one** SDK version (format stamped) |
//   | AOT (exe)       |  17 M | 3.15 s  | **one** platform, no SDK needed to run               |
//
// All three produce byte-identical UIR — verified by sha256 over `uir.ndjson`, from three locations.
//
// Source wins on the axis that matters here. The AOT binary is the fastest and is a legitimate thing
// to want, but it is *per platform*: shipping it means five binaries (macos-arm64, macos-x64,
// linux-x64, linux-arm64, win-x64) of which this repository can build and honestly validate exactly
// one. Publishing four untested binaries to make an install faster is precisely the kind of
// unvalidated claim the project rules forbid, so the npm package ships the form that works
// everywhere, and `BRIDGE_ANALYZER` lets anyone who wants the 3× point at a binary they built
// themselves. `just analyzer-binary` builds one; docs/guide/installation.md measures it.
//
// The kernel snapshot loses on both axes at once: larger than the AOT binary, slower, and locked to
// the exact SDK that produced it. It is recorded here so the next person does not re-measure it.
//
// ## Why a copy rather than a reference
//
// npm's `files` is package-relative: a package cannot publish a path above its own directory. The
// copy lands in `packages/cli/vendor/dart/`, is git-ignored, and is rebuilt by `prepack`. The layout
// under `vendor/dart/` is preserved exactly, because `bridge_analyzer` depends on `bridge_uir`
// through `path: ../bridge_uir` — flattening the two would break the pubspec that makes them work.

import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'packages/cli/vendor/dart');

/** Never shipped: resolution state, build output, and the test suite. */
const EXCLUDED = new Set(['.dart_tool', 'build', 'test', '.packages']);

const packages = ['bridge_analyzer', 'bridge_uir'];

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const name of packages) {
  const from = join(root, 'dart', name);
  if (!existsSync(from)) {
    console.error(`bundle-analyzer: ${relative(root, from)} does not exist.`);
    process.exit(1);
  }
  cpSync(from, join(target, name), {
    recursive: true,
    filter: (source) => !EXCLUDED.has(source.split('/').pop() ?? ''),
  });
}

// `pubspec.lock` is what makes an install reproducible: it pins `analyzer` to the exact version
// ADR-14 requires, so a user's `dart pub get` resolves what this repository tested rather than
// whatever is newest. Shipping the source without it would make every install a fresh resolution.
for (const name of packages) {
  if (!existsSync(join(target, name, 'pubspec.lock'))) {
    console.error(`bundle-analyzer: ${name} has no pubspec.lock — refusing to ship an unpinned analyzer.`);
    process.exit(1);
  }
}

let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else {
      files += 1;
      bytes += stat.size;
    }
  }
};
walk(target);

console.log(
  `bundle-analyzer: ${files} file(s), ${(bytes / 1024).toFixed(0)} KiB → ${relative(root, target)}`,
);
