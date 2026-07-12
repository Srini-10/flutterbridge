// N7 — flatten-wrappers (M2-T9).

import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { N6ConstFold, N7FlattenWrappers, PassManager, PipelineError, Program } from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

function text(id: string, value: string): Record<string, unknown> {
  return { id, kind: 'ui.Text', span, value: { id: `${id}-b`, kind: 'bind.Const', span, value } };
}

function constBinding(id: string, value: unknown): Record<string, unknown> {
  return { id, kind: 'bind.Const', span, value };
}

function signalBinding(id: string, signal: string): Record<string, unknown> {
  return { id, kind: 'bind.Signal', span, signal };
}

function cond(
  id: string,
  test: Record<string, unknown>,
  then: Record<string, unknown>,
  otherwise?: Record<string, unknown>,
): Record<string, unknown> {
  return { id, kind: 'ui.Cond', span, test, then, ...(otherwise ? { otherwise } : {}) };
}

/** A Column with [children]. */
function column(children: Record<string, unknown>[]): AnyUirNode {
  return {
    id: 'col',
    kind: 'ui.Element',
    span,
    component: { name: 'Column', userDefined: false },
    children,
  } as unknown as AnyUirNode;
}

function run(program: Program) {
  return new PassManager([new N6ConstFold(), new N7FlattenWrappers()]).run(program, options);
}

/** The Column's children after the run. */
function children(program: Program): Record<string, unknown>[] {
  const element = program.ofKind('ui.Element')[0]! as unknown as Record<string, unknown>;
  return (element['children'] as Record<string, unknown>[]) ?? [];
}

describe('N7 collapses a condition that has no decision left to make', () => {
  it('a constantly-true Cond becomes its `then` branch', () => {
    const result = run(
      Program.of([column([cond('c', constBinding('t', true), text('a', 'yes'), text('b', 'no'))])]),
    );

    expect(children(result.program)).toHaveLength(1);
    expect(children(result.program)[0]!['kind']).toBe('ui.Text');
    expect(children(result.program)[0]!['id']).toBe('a');
  });

  it('a constantly-false Cond becomes its `otherwise` branch', () => {
    const result = run(
      Program.of([column([cond('c', constBinding('t', false), text('a', 'yes'), text('b', 'no'))])]),
    );

    expect(children(result.program)[0]!['id']).toBe('b');
  });

  it('a constantly-false Cond with no else renders nothing, and is dropped from the list', () => {
    const result = run(
      Program.of([column([cond('c', constBinding('t', false), text('a', 'yes')), text('z', 'kept')])]),
    );

    expect(children(result.program)).toHaveLength(1);
    expect(children(result.program)[0]!['id']).toBe('z');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2107']);
  });

  it('a Cond on a SIGNAL is a real decision and is left completely alone', () => {
    const program = Program.of([
      column([cond('c', signalBinding('t', 'sig1'), text('a', 'yes'), text('b', 'no'))]),
    ]);

    expect(run(program).program).toBe(program);
  });

  it('nested conditions collapse depth first', () => {
    const inner = cond('i', constBinding('t2', true), text('a', 'deep'), text('b', 'no'));
    const outer = cond('o', constBinding('t1', true), inner, text('c', 'no'));

    expect(children(run(Program.of([column([outer])])).program)[0]!['id']).toBe('a');
  });

  it('N6 and N7 compose: a folded condition becomes a collapsed branch', () => {
    // This is the ordering, doing its job. Before N6, `1 < 2` is an expression and every branch looks
    // live. After it, the condition is a constant and N7 can see there is nothing to decide.
    const test = {
      id: 'be',
      kind: 'bind.Expr',
      span,
      expr: {
        id: 'e',
        kind: 'logic.Binary',
        span,
        operator: '<',
        left: { id: 'l', kind: 'logic.Lit', span, value: 1, type: { name: 'int' } },
        right: { id: 'r', kind: 'logic.Lit', span, value: 2, type: { name: 'int' } },
        type: { name: 'bool' },
      },
    };
    const result = run(Program.of([column([cond('c', test, text('a', 'yes'), text('b', 'no'))])]));

    expect(children(result.program)).toHaveLength(1);
    expect(children(result.program)[0]!['id']).toBe('a');
  });
});

describe('N7 splices away a block that adds nothing', () => {
  it('a block inside a statement list disappears into it', () => {
    // The `logic.Block` the Flutter adapter's setState unwrap leaves behind (INV-22) stops being
    // visible here.
    const action = {
      id: 'act',
      kind: 'sig.Action',
      span,
      writes: ['sig1'],
      body: [
        {
          id: 'blk',
          kind: 'logic.Block',
          span,
          statements: [
            { id: 's1', kind: 'logic.Break', span },
            { id: 's2', kind: 'logic.Continue', span },
          ],
        },
      ],
    } as unknown as AnyUirNode;

    const result = run(Program.of([action]));
    const body = (result.program.ofKind('sig.Action')[0] as unknown as Record<string, unknown>)[
      'body'
    ] as Record<string, unknown>[];

    expect(body.map((s) => s['kind'])).toEqual(['logic.Break', 'logic.Continue']);
  });

  it('an empty block disappears entirely', () => {
    const action = {
      id: 'act',
      kind: 'sig.Action',
      span,
      writes: ['sig1'],
      body: [{ id: 'blk', kind: 'logic.Block', span }],
    } as unknown as AnyUirNode;

    const body = (
      run(Program.of([action])).program.ofKind('sig.Action')[0] as unknown as Record<string, unknown>
    )['body'] as unknown[];

    expect(body).toEqual([]);
  });
});

describe('a branch that can never render is dropped in silence', () => {
  it('N7 says NOTHING about the nodes inside a branch it deletes', () => {
    // The subtle one. N7 drops a dead branch *before* descending into it, so a constantly-true `ui.Cond`
    // buried inside a branch that can never render is never reported — it is about to stop existing, and
    // a diagnostic pointing inside code that is not there sends someone hunting a bug that cannot fire.
    //
    // A bottom-up rewrite would visit the buried node first and report it. This test is the guard.
    const buried = cond('buried', constBinding('bt', true), text('x', 'x'), text('y', 'y'));
    const dead = cond('dead', constBinding('dt', false), buried);

    const result = run(Program.of([column([dead, text('z', 'kept')])]));

    // Exactly one diagnostic: the dead branch itself. Not one for the collapsible Cond inside it.
    expect(result.diagnostics.map((d) => d.nodeId)).toEqual(['dead']);
    expect(children(result.program).map((c) => c['id'])).toEqual(['z']);
  });
});

describe('N7 respects the pipeline contract', () => {
  it('declares that it requires N6 — and the manager enforces it', () => {
    // Before const-folding, every branch looks live. A pipeline that runs N7 first does not crash; it
    // simply finds nothing to collapse, which is the quiet kind of wrong.
    expect(() => new PassManager([new N7FlattenWrappers()])).toThrow(PipelineError);
    expect(() => new PassManager([new N6ConstFold(), new N7FlattenWrappers()])).not.toThrow();
  });

  it('running it twice is a fixed point', () => {
    const source = () =>
      Program.of([column([cond('c', constBinding('t', true), text('a', 'yes'), text('b', 'no'))])]);

    const once = run(source());
    const twice = run(once.program);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.manifest.passes.every((p) => !p.changed)).toBe(true);
  });

  it('a program with nothing to flatten is returned unchanged — the SAME object', () => {
    const program = Program.of([column([text('a', 'plain')])]);

    expect(run(program).program).toBe(program);
  });
});
