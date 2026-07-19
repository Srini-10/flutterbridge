// Platform portability of the process layer.
//
// M5-E found that the CLI could not work on Windows **at all** — three separate POSIX-only assumptions,
// each of which alone would have stopped a stage:
//
//   1. `which` was `/usr/bin/env which <program>`. Neither exists on Windows.
//   2. `spawn` ran without a shell, and `dart`/`npx`/`flutter` are `.bat`/`.cmd` there — `CreateProcess`
//      refuses those, so a program plainly on `PATH` fails with `ENOENT`.
//   3. The typecheck stage invoked `/usr/bin/env npx`.
//
// None was caught by any test, because every test ran on macOS and the code paths are only wrong on a
// platform nobody had. These tests assert the *decisions* rather than the outcomes, so they are
// meaningful on any host: what a Windows run would do is checked by simulating `process.platform`.

import { describe, expect, it } from 'vitest';

import { parseArgs, value } from '../src/internal/args.js';
import { run, spawnPlan } from '../src/internal/commands/project.js';

describe('running a subprocess', () => {
  it('works on this machine, for a program that exists', async () => {
    // The baseline the rest of the file simulates around: no shell, no quoting, real exit code.
    const result = await run('node', ['-e', 'process.stdout.write("ok")'], process.cwd());
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('reports a missing program as a non-zero code rather than throwing', async () => {
    // `doctor` depends on this: a missing `dart` must become a diagnostic, not an unhandled rejection.
    const result = await run('definitely-not-a-real-program-xyz', [], process.cwd());
    expect(result.code).not.toBe(0);
  });

  it('captures stderr separately from stdout', async () => {
    const result = await run('node', ['-e', 'process.stderr.write("bad")'], process.cwd());
    expect(result.stderr).toContain('bad');
    expect(result.stdout).toBe('');
  });

  it('survives a path containing a space', async () => {
    // Not decorative: `C:\Program Files\` and `~/Library/Application Support/` both contain one, and the
    // Windows path enables a shell, which re-splits arguments on whitespace unless they are quoted.
    const result = await run('node', ['-e', 'process.stdout.write(process.argv[1] ?? "")', 'a b c'], process.cwd());
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('a b c');
  });
});

describe('Windows process invocation', () => {
  // `run` spawns, and vitest cannot spy on an ESM namespace export (`node:child_process`.spawn is not
  // configurable). So the platform decision is exposed as a pure function and asserted directly — which is
  // better anyway: it states the rule rather than observing one consequence of it.

  it('enables a shell on win32 and not elsewhere', () => {
    // `dart`, `npx` and `flutter` are `.bat`/`.cmd` on Windows, and `CreateProcess` refuses those. Without
    // a shell the CLI cannot analyze, resolve dependencies, or typecheck — three of its four stages.
    expect(spawnPlan('dart', ['--version'], 'win32').shell).toBe(true);
    expect(spawnPlan('dart', ['--version'], 'darwin').shell).toBe(false);
    expect(spawnPlan('dart', ['--version'], 'linux').shell).toBe(false);
  });

  it('quotes arguments containing whitespace when a shell is in play', () => {
    // `cmd.exe` re-splits on spaces even from an argv array. Unquoted, the analyzer would be pointed at
    // `C:\\Users\\me\\My` — a directory that does not exist.
    const plan = spawnPlan('tool', ['--project', 'C:\\Users\\me\\My Projects\\app'], 'win32');
    expect(plan.args[1]).toBe('"C:\\Users\\me\\My Projects\\app"');
  });

  it('leaves ordinary arguments untouched, on every platform', () => {
    expect(spawnPlan('tool', ['--format', 'json'], 'win32').args).toEqual(['--format', 'json']);
    expect(spawnPlan('tool', ['--format', 'json'], 'darwin').args).toEqual(['--format', 'json']);
  });

  it('does not quote on POSIX, where spawn handles arguments itself', () => {
    const plan = spawnPlan('tool', ['--project', '/Users/me/My Projects/app'], 'darwin');
    expect(plan.args[1]).toBe('/Users/me/My Projects/app');
  });
});

describe('flags that take a value', () => {
  // `--config` was added with the production commands, documented in docs/guide/cli.md as
  // `--config <path>`, and never added to the parser's VALUED set — so it parsed as a boolean and the
  // **documented** form failed with "--config needs a value." while only `--config=<path>` worked.
  //
  // A flag can be read as a value in one file and declared as a boolean in another, and nothing connects
  // the two. This asserts both spellings for every flag the CLI reads as a value.
  const VALUE_FLAGS = ['config', 'manifest', 'plugin', 'out'];

  for (const name of VALUE_FLAGS) {
    it(`accepts --${name} <value> and --${name}=<value> alike`, () => {
      const spaced = parseArgs(['doctor', `--${name}`, 'some/path']);
      const equals = parseArgs(['doctor', `--${name}=some/path`]);

      expect(value(spaced, name), `--${name} <value>`).toBe('some/path');
      expect(value(equals, name), `--${name}=<value>`).toBe('some/path');
      // The value must not have been swallowed as a positional either.
      expect(spaced.positionals).toEqual([]);
    });
  }

  it('still treats an unknown flag as boolean, so it cannot eat a positional', () => {
    // The reason VALUED is an allow-list rather than "anything followed by a non-flag": `bridge inspect
    // --json doc.ndjson` must not read `doc.ndjson` as the value of `--json`.
    const args = parseArgs(['inspect', '--json', 'doc.ndjson']);
    expect(args.flags.get('json')).toBe(true);
    expect(args.positionals).toEqual(['doc.ndjson']);
  });
});
