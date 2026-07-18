// Finding, preparing and running the Dart analyzer.
//
// ## The problem this solves
//
// The analyzer is a separate program in a separate language (ADR-2), and through M5-B it was findable
// only by looking for `dart/bridge_analyzer/` relative to a checkout. An `npm install` has no such
// directory, so **an installed `bridge` could not analyze anything** — the single blocker M5-B's
// report named between "works from a checkout" and "works from an install".
//
// Three things are needed to run it, and each is a separate question with a separate failure:
//
//   1. **Where is it?**            `locate()`  — packaged, checked out, or pointed at.
//   2. **Are its deps resolved?**  `prepare()` — a shipped source tree has no `.dart_tool/`.
//   3. **How is it invoked?**      `command()` — `dart run` for source, directly for a binary.
//
// Keeping them apart is what lets `doctor` say *which* one is wrong. "The analyzer was not found" is
// the wrong message for an analyzer that is present but unresolved, and M5-B's version said exactly
// that.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A located analyzer, and how to run it. */
export interface Analyzer {
  /** The entry point — a `.dart` file, or an executable built from one. */
  readonly entry: string;
  /** Where it came from. Reported by `doctor`, because "which analyzer" is a real question. */
  readonly origin: 'BRIDGE_ANALYZER' | 'packaged' | 'checkout';
  /** Whether it runs on the Dart VM (`dart run <entry>`) or directly (a compiled binary). */
  readonly form: 'source' | 'binary';
}

/**
 * The directory of the installed `@bridge/cli` package.
 *
 * `../` from the bundled entry point at `dist/index.js` is the package root — the same base
 * `VERSION` reads `package.json` from, so the two cannot drift if the bundle layout changes.
 *
 * `fileURLToPath`, never `URL.pathname`: on Windows the latter yields `/C:/…`, which is not a path,
 * and a percent-encoded space stays percent-encoded. This is a packaging module; it is the one place
 * where an install under `C:\Program Files\` has to work.
 */
export function packageRoot(): string {
  return fileURLToPath(new URL('../', import.meta.url));
}

/**
 * The tool's version.
 *
 * Read from the package manifest rather than restated, so `bridge version` and `npm ls` can never
 * disagree — a version stated twice is a version that will eventually be stated two different ways,
 * which is the same argument ADR-18 makes about widget metadata.
 *
 * It lives beside `packageRoot()` because both answer questions about the installed package, and it
 * is exported because two callers need it: `bridge version`, and the `buildVersion` stamped into
 * every manifest this tool writes.
 */
export const VERSION: string = ((): string => {
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as {
      readonly version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * Finds the analyzer, in the order a user would expect to win.
 *
 * 1. **`BRIDGE_ANALYZER`** — so anyone can point at a build of their own, including a native binary,
 *    which is ~3× faster than running from source. That is why the override accepts more than a
 *    `.dart` file.
 * 2. **A checkout**, when this package sits inside one.
 * 3. **The copy inside this package**, which is what an `npm install` gets.
 * 4. **The project's own `dart/`**, last, for a project vendoring its own frontend.
 *
 * ## Why the checkout outranks the packaged copy
 *
 * `vendor/dart/` is a **copy** of `dart/`, made by `tools/bundle-analyzer.mjs` at pack time. In a
 * checkout both exist the moment anybody runs `just package`, and if the copy won, a contributor
 * editing `dart/bridge_analyzer` would get their changes silently ignored — the worst possible
 * failure, because the analyzer *works*, it is just the wrong one. Source outranks a copy of source.
 *
 * The order costs an installed user nothing: no checkout candidate exists there, so the packaged copy
 * is reached either way.
 *
 * The path count in candidate 2 matters and was wrong: M5-B shipped `../../../../../` from
 * `packages/cli/dist/`, which resolves *two levels above* the repository —
 * `/Users/<me>/dart/bridge_analyzer/…` — and therefore never matched anything. It went unnoticed
 * because candidate 4 happens to hit when `bridge` is run from the repository root, which is where it
 * was always run from.
 */
export function locate(projectRoot: string): Analyzer | undefined {
  const override = process.env['BRIDGE_ANALYZER'];
  if (override !== undefined && override !== '' && existsSync(override)) {
    return { entry: override, origin: 'BRIDGE_ANALYZER', form: formOf(override) };
  }

  // `../../` from `packages/cli/` is the repository root.
  const checkout = join(packageRoot(), '../../dart/bridge_analyzer/bin/bridge_analyzer.dart');
  if (existsSync(checkout)) return { entry: checkout, origin: 'checkout', form: 'source' };

  const packaged = join(packageRoot(), 'vendor/dart/bridge_analyzer/bin/bridge_analyzer.dart');
  if (existsSync(packaged)) return { entry: packaged, origin: 'packaged', form: 'source' };

  const vendored = resolve(projectRoot, 'dart/bridge_analyzer/bin/bridge_analyzer.dart');
  return existsSync(vendored) ? { entry: vendored, origin: 'checkout', form: 'source' } : undefined;
}

/** Whether [entry] is Dart source or something already compiled. */
function formOf(entry: string): 'source' | 'binary' {
  return entry.endsWith('.dart') ? 'source' : 'binary';
}

/** The package directory holding [analyzer]'s `pubspec.yaml`, or `undefined` for a binary. */
export function packageOf(analyzer: Analyzer): string | undefined {
  if (analyzer.form === 'binary') return undefined;
  const pubspec = join(dirname(dirname(analyzer.entry)), 'pubspec.yaml');
  return existsSync(pubspec) ? dirname(pubspec) : undefined;
}

/**
 * Whether [analyzer]'s own dependencies are resolved.
 *
 * A shipped source tree deliberately carries no `.dart_tool/` — it is machine-specific, holding
 * absolute paths into a pub cache that does not exist on the machine that built the package. So the
 * first run on any new machine has to resolve, exactly as a cloned Dart project does.
 */
export function isResolved(analyzer: Analyzer): boolean {
  const pkg = packageOf(analyzer);
  if (pkg === undefined) return true; // a binary carries its dependencies inside it
  return existsSync(join(pkg, '.dart_tool', 'package_config.json'));
}

/**
 * Whether the analyzer's directory can be written to.
 *
 * A global `npm install -g` under a system prefix can land read-only, and `dart pub get` writes into
 * the package. Checking first turns an opaque EACCES from a subprocess into a sentence that names the
 * directory and the fix.
 */
export function isWritable(analyzer: Analyzer): boolean {
  const pkg = packageOf(analyzer);
  if (pkg === undefined) return true;
  try {
    // eslint-disable-next-line no-bitwise
    return (statSync(pkg).mode & 0o200) !== 0;
  } catch {
    return false;
  }
}

/**
 * The command that runs [analyzer] over a project, and the directory to run it from.
 *
 * Source runs on the Dart VM; a binary runs itself. Nothing else differs — the argument vector is the
 * analyzer's own CLI either way, which is what makes `BRIDGE_ANALYZER` a real substitution rather
 * than a special case.
 *
 * ## Why source is invoked from its own directory, with a relative path
 *
 * **`dart run` splits its argument at `@`.** `dart run foo@1.2.3` is package-and-version syntax, and
 * the parse is unconditional: given an absolute path containing an `@`, it takes everything before the
 * `@` as a package name and everything after as a version, then fails while writing a synthetic
 * pubspec:
 *
 * ```text
 * Error on line 7 of …/helperPackage/pubspec.yaml: Not a valid package name.
 *   "/…/lib/node_modules/": "bridge/cli/vendor/dart/bridge_analyzer/bin/bridge_analyzer.dart"
 * ```
 *
 * Every npm scoped package contains an `@` in its path — `@bridge/cli` always installs under
 * `node_modules/@bridge/`. So `dart run <absolute path to the packaged analyzer>` can *never* work,
 * on any machine, for as long as the package is scoped. It worked throughout M5-B only because a
 * checkout path has no `@` in it.
 *
 * Running from the analyzer's own directory with a relative entry point sidesteps the parse entirely.
 * The working directory is not otherwise load-bearing: `--project` and `--out` are both absolute by
 * the time they get here, so nothing about the analysis depends on where it was launched from.
 */
export function command(
  analyzer: Analyzer,
  argv: readonly string[],
  fallbackCwd: string,
): { program: string; args: readonly string[]; cwd: string } {
  if (analyzer.form === 'binary') {
    return { program: analyzer.entry, args: argv, cwd: fallbackCwd };
  }

  const pkg = packageOf(analyzer);
  if (pkg === undefined) {
    // No pubspec above it, so there is no package directory to run from and the entry point has to be
    // named in full. Only reachable via a hand-set BRIDGE_ANALYZER pointing at a loose file.
    return { program: 'dart', args: ['run', analyzer.entry, ...argv], cwd: fallbackCwd };
  }

  return {
    program: 'dart',
    args: ['run', relative(pkg, analyzer.entry), ...argv],
    cwd: pkg,
  };
}
