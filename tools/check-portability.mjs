#!/usr/bin/env node
// Platform-difference checks that can be run from any host.
//
// ## Why this exists
//
// M5-E found that the CLI could not run on Windows at all — three POSIX-only calls that no test caught,
// because every test ran on macOS. The general lesson is not only "add Windows to CI"; it is that **some
// platform bugs are detectable from the wrong platform** if you test the property rather than the platform.
//
// **Case-exact imports.** macOS and Windows have case-insensitive filesystems by default; Linux does not.
// An import of `./Foo.dart` naming a file called `foo.dart` resolves on a developer's Mac and fails on
// every Linux machine, including CI. `existsSync` cannot detect it — it answers yes for the wrong case,
// which is the whole bug — so the specifier is compared against the real directory entry instead.
//
// ## What this actually adds, measured rather than assumed
//
// The first version of this file was written on the assumption that no tool catches this. That assumption
// was tested, and it is **wrong for TypeScript**:
//
// | Domain | Already caught? | By what |
// | --- | --- | --- |
// | TypeScript | **yes** | `tsc` — `TS1149: File name '…/Analyzer.ts' differs from … only in casing`, even when a module has exactly one wrong-cased importer |
// | **Dart** | **no** | `dart analyze` reports *"No issues found!"* for `import 'Helper.dart'` when the file is `helper.dart` |
// | `.mjs` (`tools/`, `e2e/src/`) | **no** | not in any `tsconfig` `include`, so `tsc` never sees them |
//
// So the value here is Dart and `.mjs`. The TypeScript pass is kept because it is nearly free and covers
// files outside a `tsconfig` — but it is belt-and-braces, and saying so is better than implying this tool
// is load-bearing where it is not.
//
// Also checked: **no literal path separators** in code that builds paths, which mismatch on one platform.
//
// None of this substitutes for running on Linux and Windows. It is what can be proven without them.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set([
  'node_modules', 'dist', '.git', '.turbo', 'build', '.dart_tool', 'coverage', '.next',
  '.fixtures', 'release', 'vendor', 'test-results', 'spikes',
]);

/** @param {string} dir @param {RegExp} pattern @returns {string[]} */
function walk(dir, pattern) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, pattern));
    else if (pattern.test(entry)) out.push(full);
  }
  return out;
}

const entriesCache = new Map();
/** The real directory entries of `dir`, or `null` when it does not exist. */
function entriesOf(dir) {
  if (!entriesCache.has(dir)) {
    try {
      entriesCache.set(dir, new Set(readdirSync(dir)));
    } catch {
      entriesCache.set(dir, null);
    }
  }
  return entriesCache.get(dir);
}

/**
 * Whether `path` exists with **exactly** this spelling.
 *
 * `existsSync` is useless for this on a case-insensitive filesystem: it answers yes for `./Foo.ts` when the
 * file is `foo.ts`, which is precisely the case that breaks on Linux. So the final segment is compared
 * against the real directory listing instead.
 */
function existsCaseExact(path) {
  const dir = dirname(path);
  const entries = entriesOf(dir);
  return entries !== null && entries.has(path.slice(dir.length + 1));
}

/**
 * Source with multi-line string literals blanked out.
 *
 * Necessary rather than fastidious: this repository is full of **source code inside strings**. Dart tests
 * embed whole Flutter programs in triple-quoted literals, and the React generator emits TypeScript from
 * template literals. A regex looking for `import '…'` finds those too, and every one is a path that does
 * not exist relative to the file it appears in — twelve false positives on this check's first run, and not
 * one true one.
 *
 * Blanking rather than deleting keeps reported line numbers honest.
 */
function withoutEmbeddedSource(text, kind) {
  const fence = kind === 'dart' ? /'''|"""/g : /`/g;
  let out = '';
  let index = 0;
  let open = null;
  for (const match of text.matchAll(fence)) {
    if (open === null) {
      out += text.slice(index, match.index + match[0].length);
      open = match[0];
    } else if (match[0] === open) {
      out += text.slice(index, match.index).replace(/[^\n]/g, ' ') + match[0];
      open = null;
    } else {
      continue;
    }
    index = match.index + match[0].length;
  }
  out += open === null ? text.slice(index) : text.slice(index).replace(/[^\n]/g, ' ');
  return out;
}

const problems = [];

// ── 1. every relative import in TypeScript must resolve case-exactly ──
//
// TypeScript source imports `./x.js` and means `./x.ts`; the emitted `.js` is what runs. So each candidate
// spelling is tried, and the import is fine if any one resolves case-exactly.
const tsFiles = [
  ...walk(join(ROOT, 'packages'), /\.(ts|tsx|mjs)$/),
  ...walk(join(ROOT, 'tools'), /\.mjs$/),
  ...walk(join(ROOT, 'e2e'), /\.(ts|mjs)$/),
];
for (const file of tsFiles) {
  const source = withoutEmbeddedSource(readFileSync(file, 'utf8'), 'ts');
  // A **statement**, not a mention. A real import begins its line; `"import { X } from './x';"` inside an
  // array of emitted source lines does not. The specifier is then the next relative string literal, which
  // handles a multi-line `import {\n  a,\n} from './x.js';` without a second pattern.
  for (const statement of source.matchAll(/^[ \t]*(?:import|export)\b[^;\n]*(?:\n[^;]*)?;/gm)) {
    // From a `from` clause, a side-effect `import './x'`, or a dynamic `import('./x')` — never from an
    // arbitrary string in the statement. `export const CONFIG_FILES = ['.bridge']` is an export statement
    // whose value merely looks relative.
    const specifier =
      /\bfrom\s*['"](\.[^'"]+)['"]/.exec(statement[0]) ??
      /\bimport\s*\(?\s*['"](\.[^'"]+)['"]/.exec(statement[0]);
    if (specifier === null) continue;
    const base = resolve(dirname(file), specifier[1]);
    const candidates = [
      base,
      base.replace(/\.js$/, '.ts'),
      base.replace(/\.js$/, '.tsx'),
      base.replace(/\.js$/, '.mjs'),
      join(base, 'index.ts'),
      join(base, 'index.js'),
    ];
    if (!candidates.some(existsCaseExact)) {
      problems.push(
        `${relative(ROOT, file)}: import '${specifier[1]}' does not resolve case-exactly — ` +
          'works on macOS/Windows, fails on Linux',
      );
    }
  }
}

// ── 2. Dart imports, same rule ──
//
// Only `lib/` and `bin/`: `test/` is where the embedded-fixture imports live, and blanking triple-quoted
// strings does not catch the ones built by interpolation.
for (const file of [
  ...walk(join(ROOT, 'dart/bridge_analyzer/lib'), /\.dart$/),
  ...walk(join(ROOT, 'dart/bridge_analyzer/bin'), /\.dart$/),
  ...walk(join(ROOT, 'dart/bridge_uir/lib'), /\.dart$/),
]) {
  const source = withoutEmbeddedSource(readFileSync(file, 'utf8'), 'dart');
  for (const match of source.matchAll(/^import\s+['"](?!package:|dart:)([^'"]+)['"]/gm)) {
    if (!existsCaseExact(resolve(dirname(file), match[1]))) {
      problems.push(`${relative(ROOT, file)}: import '${match[1]}' does not resolve case-exactly`);
    }
  }
}

// ── 3. no literal Windows separator inside a path call ──
for (const file of walk(join(ROOT, 'packages'), /\.ts$/)) {
  const source = withoutEmbeddedSource(readFileSync(file, 'utf8'), 'ts');
  source.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    if (/\b(join|resolve)\([^)]*\\\\/.test(line)) {
      problems.push(`${relative(ROOT, file)}:${index + 1}: backslash separator inside a path call`);
    }
  });
}


// ── 4. no CRLF in any tracked text file ──
//
// Measured in M5-F: the same Flutter source with CRLF endings produces **different UIR** — `span.length`
// counts the extra `\r` per line. `line`, `column` and node ids are unaffected, so this is not a
// correctness bug, but it means a checkout setting changes compiler output:
//
//     LF   sha256 7dae021ec9c4e694   span.length 297
//     CRLF sha256 1ed8ccf5e0728d0d   span.length 307
//
// Git's `core.autocrlf` defaults to `true` on Windows, so without `.gitattributes` a Windows contributor
// checks out CRLF fixtures and `build_proof_test.dart` — which byte-compares a committed golden — fails.
// `.gitattributes` now pins `eol=lf`; this is the check that it is working.
const crlf = [];
for (const file of [
  ...walk(join(ROOT, 'packages'), /\.(ts|tsx|mjs|json)$/),
  ...walk(join(ROOT, 'dart'), /\.(dart|yaml)$/),
  ...walk(join(ROOT, 'fixtures'), /\.(dart|ndjson|json|yaml)$/),
  ...walk(join(ROOT, 'examples'), /\.(dart|json|yaml)$/),
  ...walk(join(ROOT, 'tools'), /\.mjs$/),
]) {
  if (readFileSync(file, 'utf8').includes('\r\n')) crlf.push(relative(ROOT, file));
}
for (const file of crlf) {
  problems.push(`${file}: contains CRLF — analyzer spans would differ from every other platform`);
}

if (problems.length > 0) {
  console.error(`portability: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log(
  `portability: ${tsFiles.length} TS files + Dart lib/bin — imports resolve case-exactly, ` +
    'no literal path separators, no CRLF. OK',
);
