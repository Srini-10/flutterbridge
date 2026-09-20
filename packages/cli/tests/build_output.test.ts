import { describe, expect, it } from 'vitest';

import type { Args } from '../src/internal/args.js';
import { finish, type Stage } from '../src/internal/commands/build.js';

// `bridge build` printed `build succeeded.` over a program the generator had warned it dropped parts of.
// `finish` showed only the *last line* of a successful stage's detail (`wrote N file(s)`) and nothing at all
// for `analyze`, so every warning from a stage that went on to succeed was invisible — while
// `bridge generate`, the same stage run alone, printed them. This is the unit under test: a pure function of
// the stages it is handed, so no analyzer, no Flutter and no filesystem are needed.

const plain = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');
const stage = (name: string, ok: boolean, detail: string): Stage => ({ name, ok, ms: 1, detail });
const args: Args = { command: 'build', positionals: [], flags: new Map() };
const render = (stages: Stage[]): string => plain(finish('.', stages, args, 0).output);

describe('bridge build shows what a successful stage warned about', () => {
  it('prints every generator warning, not just the closing `wrote` line', () => {
    const output = render([
      stage(
        'generate',
        true,
        [
          "warning [BRG3001] `Widget.prop` has no equivalent on the runtime's `Widget` and is dropped.",
          'warning [BRG3002] the program declares no routes.',
          '',
          'wrote 10 file(s) to build/bridge',
        ].join('\n'),
      ),
    ]);
    expect(output).toContain('BRG3001');
    expect(output).toContain('is dropped');
    expect(output).toContain('BRG3002');
    expect(output).toContain('wrote 10 file(s) to build/bridge');
    expect(output).toContain('build succeeded.');
  });

  it('a stage with nothing to warn about prints exactly its one line, as before', () => {
    const output = render([stage('generate', true, 'wrote 3 file(s) to out')]);
    expect(output.split('\n').filter((l) => l.includes('wrote'))).toHaveLength(1);
    expect(output).not.toContain('warning');
  });

  it('surfaces the analyzer warning count with where to read the detail — not the whole code frame', () => {
    const output = render([
      stage(
        'analyze',
        true,
        [
          'warning[BRG1302]: Syntax has no UIR representation',
          '  --> lib/main.dart:5:9',
          '   |',
          '5  |         _items[0] = 5;',
          '   |         ^^^^^^^^^^^^^',
          '',
          '1 warning found.',
          'wrote .bridge/uir.ndjson',
        ].join('\n'),
      ),
    ]);
    expect(output).toContain('1 warning found');
    expect(output).toContain('bridge analyze');
    expect(output).not.toContain('_items[0] = 5;');
  });

  it('an analyzer stage with no warnings prints nothing extra', () => {
    const output = render([stage('analyze', true, 'No issues found.\nwrote .bridge/uir.ndjson')]);
    expect(output).not.toContain('found');
    expect(output).not.toContain('bridge analyze');
  });

  it('a failing stage still prints its whole detail', () => {
    const output = render([stage('generate', false, 'error [BRG3004] `x` has no UIR representation.\nnothing was written.')]);
    expect(output).toContain('BRG3004');
    expect(output).toContain('nothing was written.');
  });

  it('a skipped stage still says why', () => {
    const output = render([stage('typecheck', true, 'skipped — dependencies are not installed. Run `npm install`.')]);
    expect(output).toContain('skip');
    expect(output).toContain('dependencies are not installed');
  });
});
