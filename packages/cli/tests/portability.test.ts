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
import { run } from '../src/internal/commands/project.js';
import { encodeArgument, encodeForShell, spawnPlan } from '../src/internal/spawn-plan.js';

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

  // A resolver stands in for `PATH`. `spawnPlan` takes one so the encoding stays a pure function; these
  // tests supply what Windows would have found.
  const asBatch = (name: string): string => `C:\\tools\\${name}.bat`;
  const asExe = (name: string): string => `C:\\tools\\${name}.exe`;

  it('uses a shell for a batch file, and not for a real executable', () => {
    // `dart`, `npx` and `flutter` are `.bat`/`.cmd` on Windows and `CreateProcess` refuses those — without
    // a shell, three of `bridge build`'s four stages die with ENOENT on a program plainly on PATH.
    //
    // But a shell is only needed for *those*. Sending a real `.exe` through `cmd.exe` was M5-E's mistake:
    // it re-parses every argument, and CI caught it with `node -e 'process.stdout.write("ok")'` — no
    // whitespace, so M5-E's whitespace-only quoting never fired, and `cmd.exe` split it into fragments.
    expect(spawnPlan('dart', ['--version'], 'win32', asBatch).shell).toBe(true);
    expect(spawnPlan('node', ['--version'], 'win32', asExe).shell).toBe(false);
    expect(spawnPlan('dart', ['--version'], 'darwin', asBatch).shell).toBe(false);
    expect(spawnPlan('dart', ['--version'], 'linux', asBatch).shell).toBe(false);
  });

  it('falls back to a shell when the program cannot be resolved', () => {
    // An unresolvable program should fail as ENOENT from the spawn, not as a different launch strategy
    // chosen here. A shell is M5-E's behaviour and is the one that launches batch files.
    expect(spawnPlan('mystery', [], 'win32', () => undefined).shell).toBe(true);
  });

  it('trusts an explicit non-batch extension without resolving', () => {
    expect(spawnPlan('C:\\tools\\node.exe', [], 'win32', () => undefined).shell).toBe(false);
    expect(spawnPlan('C:\\tools\\dart.bat', [], 'win32', () => undefined).shell).toBe(true);
  });

  it('leaves a real executable to libuv, which already applies the documented rules', () => {
    // libuv's `quote_cmd_arg` implements CommandLineToArgvW. Re-encoding here would escape the escapes.
    const plan = spawnPlan('node', ['-e', 'process.stdout.write("ok")'], 'win32', asExe);
    expect(plan.shell).toBe(false);
    expect(plan.args).toEqual(['-e', 'process.stdout.write("ok")']);
  });

  it('does not quote on POSIX, where spawn handles arguments itself', () => {
    const plan = spawnPlan('tool', ['--project', '/Users/me/My Projects/app'], 'darwin');
    expect(plan.args[1]).toBe('/Users/me/My Projects/app');
  });
});

describe('encoding an argument for CommandLineToArgvW', () => {
  // The rules, from
  // learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-commandlinetoargvw:
  //
  //   * a string in double quotes is one argument, whitespace included;
  //   * `\"` is a literal quote;
  //   * backslashes are literal unless they immediately precede a quote;
  //   * `2n` backslashes then `"` → n backslashes, and the quote delimits;
  //   * `2n+1` backslashes then `"` → n backslashes and a literal quote.
  //
  // Each case below is one of those clauses. They are asserted on the *encoding*, which is pure string
  // logic and therefore checkable on every platform — only the round-trip needs Windows, and CI does that.

  it('leaves an ordinary argument alone', () => {
    expect(encodeArgument('--version')).toBe('--version');
    expect(encodeArgument('C:\\tools\\dart.bat')).toBe('C:\\tools\\dart.bat');
  });

  it('quotes whitespace, which is the delimiter', () => {
    expect(encodeArgument('C:\\My Projects\\app')).toBe('"C:\\My Projects\\app"');
  });

  it('quotes the empty argument, which would otherwise vanish', () => {
    expect(encodeArgument('')).toBe('""');
  });

  it('escapes an embedded quote as \\"', () => {
    expect(encodeArgument('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('doubles backslashes that precede a quote, and only those', () => {
    // `a\b` has a backslash that precedes a letter: literal, left alone.
    expect(encodeArgument('a\\b c')).toBe('"a\\b c"');
    // `a\"` — one backslash before a quote is 2n+1 with n=0: emit `\\` then `\"`.
    expect(encodeArgument('a\\"')).toBe('"a\\\\\\""');
  });

  it('doubles trailing backslashes, which precede the closing quote', () => {
    // Without doubling, the final backslash escapes the closing quote and the parse runs into the next
    // argument — the classic failure this rule exists for.
    expect(encodeArgument('C:\\path with space\\')).toBe('"C:\\path with space\\\\"');
  });
});

describe('encoding an argument that cmd.exe reads first', () => {
  it('escapes cmd metacharacters, including the quotes the first pass added', () => {
    // Two parsers, two passes: CommandLineToArgvW so the program recovers the argument, then `^` so
    // cmd.exe passes the metacharacters through instead of acting on them.
    expect(encodeForShell('a&b')).toBe('a^&b');
    expect(encodeForShell('x|y')).toBe('x^|y');
    expect(encodeForShell('C:\\My Projects\\app')).toBe('^"C:\\My Projects\\app^"');
  });

  it('leaves an argument with nothing special in it untouched', () => {
    expect(encodeForShell('--version')).toBe('--version');
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
