// Finding and invoking the Dart analyzer.
//
// These are the properties that differ between a checkout and an install, which is exactly the set
// that no test before M5-C covered — the CLI was only ever exercised from inside this repository, and
// every defect below was invisible from there.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { command, locate, packageOf } from '../src/internal/analyzer.js';

/** A throwaway analyzer package on disk, at a path the caller chooses. */
function analyzerAt(root: string): string {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(root, 'pubspec.yaml'), 'name: bridge_analyzer\n');
  const entry = join(bin, 'bridge_analyzer.dart');
  writeFileSync(entry, 'void main() {}\n');
  return entry;
}

describe('invoking the analyzer', () => {
  it('never passes `dart run` a path containing "@"', () => {
    // The defect: `dart run` parses its argument as `<package>@<version>`, unconditionally. An npm
    // scoped package always installs under `node_modules/@bridge/`, so passing the packaged
    // analyzer's absolute path made `dart run` fail while writing a synthetic pubspec —
    // "Not a valid package name" — on every machine, for every user, 100% of the time.
    //
    // It survived M5-B because a checkout path has no `@` in it.
    const base = mkdtempSync(join(tmpdir(), 'bridge-at-'));
    const scoped = join(base, 'node_modules', '@bridge', 'cli', 'vendor', 'dart', 'bridge_analyzer');
    const entry = analyzerAt(scoped);

    const invocation = command({ entry, origin: 'packaged', form: 'source' }, ['--help'], base);

    expect(invocation.program).toBe('dart');
    const runArgument = invocation.args[1];
    expect(runArgument, 'the entry point `dart run` is given').not.toContain('@');
    // …because it is relative to the package it runs from.
    expect(invocation.cwd).toBe(scoped);
    expect(runArgument).toBe(join('bin', 'bridge_analyzer.dart'));
  });

  it('runs a compiled binary directly, with no Dart VM', () => {
    const base = mkdtempSync(join(tmpdir(), 'bridge-bin-'));
    const binary = join(base, 'bridge_analyzer');
    writeFileSync(binary, '');

    const invocation = command({ entry: binary, origin: 'BRIDGE_ANALYZER', form: 'binary' }, ['--help'], base);

    expect(invocation.program).toBe(binary);
    expect(invocation.args).toEqual(['--help']);
  });

  it('passes the analyzer arguments through unchanged, in both forms', () => {
    const base = mkdtempSync(join(tmpdir(), 'bridge-args-'));
    const entry = analyzerAt(join(base, 'analyzer'));
    const argv = ['--project', '/abs/project', '--out', '/abs/out.ndjson'];

    const source = command({ entry, origin: 'packaged', form: 'source' }, argv, base);
    const binary = command({ entry: '/some/binary', origin: 'BRIDGE_ANALYZER', form: 'binary' }, argv, base);

    // The analyzer's own CLI is the contract; neither form may rewrite it. This is what makes
    // BRIDGE_ANALYZER a substitution rather than a special case.
    expect(source.args.slice(2)).toEqual(argv);
    expect(binary.args).toEqual(argv);
  });
});

describe('locating the analyzer', () => {
  it('prefers BRIDGE_ANALYZER, and reports a binary as one', () => {
    const base = mkdtempSync(join(tmpdir(), 'bridge-loc-'));
    const binary = join(base, 'my-analyzer');
    writeFileSync(binary, '');

    const previous = process.env['BRIDGE_ANALYZER'];
    process.env['BRIDGE_ANALYZER'] = binary;
    try {
      const found = locate(base);
      expect(found?.origin).toBe('BRIDGE_ANALYZER');
      expect(found?.form).toBe('binary');
    } finally {
      if (previous === undefined) delete process.env['BRIDGE_ANALYZER'];
      else process.env['BRIDGE_ANALYZER'] = previous;
    }
  });

  it('ignores a BRIDGE_ANALYZER that does not exist rather than failing on it', () => {
    // A stale override in a shell profile should fall through to something that works, not break
    // every command with a path error.
    const base = mkdtempSync(join(tmpdir(), 'bridge-stale-'));
    const previous = process.env['BRIDGE_ANALYZER'];
    process.env['BRIDGE_ANALYZER'] = join(base, 'not-here.dart');
    try {
      expect(locate(base)?.origin).not.toBe('BRIDGE_ANALYZER');
    } finally {
      if (previous === undefined) delete process.env['BRIDGE_ANALYZER'];
      else process.env['BRIDGE_ANALYZER'] = previous;
    }
  });

  it('finds the package directory of a source analyzer, and none for a binary', () => {
    const base = mkdtempSync(join(tmpdir(), 'bridge-pkg-'));
    const pkg = join(base, 'bridge_analyzer');
    const entry = analyzerAt(pkg);

    expect(packageOf({ entry, origin: 'packaged', form: 'source' })).toBe(pkg);
    expect(packageOf({ entry: '/some/binary', origin: 'BRIDGE_ANALYZER', form: 'binary' })).toBeUndefined();
  });
});
