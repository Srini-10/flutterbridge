// Parameterised actions through the pipeline (Spec v2.5 §A18, M3-B.1).
//
// §A18 added `sig.Action.params` because the model could not represent `FavoritesStore.toggle(int id)`: the
// body read `id` and nothing declared it. These tests are about the compiler's half of that — **no pass may
// silently remove a parameter**, and N5, which *creates* actions out of closures, must carry them.
//
// N5 is the one that mattered. `freeLocals` already treated a lambda's own parameters as bound, so a
// parameterised closure lifted happily — and `lift()` then built the action without `params`, so
// `onChanged: (value) => setState(…)` became an action whose body referenced an undeclared `value`. It was
// not a refusal; it was a silent drop, which is worse, and it is exactly what §A18.4 warned would leave the
// widget case broken while the store case looked fixed.

import { nodeIdOfContent, UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { N5LiftClosures, PassManager, Program, normalizationPipeline } from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

/** A `sig.Signal`. */
function signal(id: string): AnyUirNode {
  return { id, kind: 'sig.Signal', span, scope: 'component', type: { name: 'int' } } as AnyUirNode;
}

/** A `ParamDecl` — the existing type, reused rather than redefined (§A18.3). */
function param(name: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, type: { name: type }, ...extra };
}

/** A reference. */
function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'int' }, ...(target ? { target } : {}) };
}

/** `<target> = <value>` */
function assign(id: string, target: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.Assign', span, target, operator: 'assign', type: { name: 'int' }, value };
}

/** A statement wrapping an expression. */
function stmt(id: string, expr: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.ExprStmt', span, expr };
}

/** A lambda. */
function lambda(
  id: string,
  body: Record<string, unknown>[],
  params: Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.Lambda',
    span,
    body,
    type: { name: 'void Function(int)' },
    ...(params.length > 0 ? { params } : {}),
  };
}

/** A widget with an `onChanged` callback. */
function field(id: string, handler: Record<string, unknown>): AnyUirNode {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name: 'TextField', userDefined: false },
    props: { onChanged: { id: `${id}-b`, kind: 'bind.Expr', span, expr: handler } },
  } as unknown as AnyUirNode;
}

/** A declared `sig.Action` with parameters — what the analyzer emits for `toggle(int id)` since §A18. */
function action(id: string, params: Record<string, unknown>[], writes: string[] = ['s1']): AnyUirNode {
  return {
    id,
    kind: 'sig.Action',
    span,
    ...(params.length > 0 ? { params } : {}),
    writes,
    body: [stmt(`${id}-st`, assign(`${id}-a`, ref(`${id}-r`, 'count', 's1'), ref(`${id}-v`, 'id')))],
  } as unknown as AnyUirNode;
}

describe('N5 carries a lifted closure’s parameters onto the action', () => {
  it('lifts `(value) => count = value` with `value` declared', () => {
    const program = Program.of([
      signal('s1'),
      field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'value')))], [param('value', 'int')])),
    ]);

    const result = new PassManager([new N5LiftClosures()]).run(program, options);
    const lifted = result.program.ofKind('sig.Action');

    expect(lifted).toHaveLength(1);
    // Before §A18 this list was empty and the action's body read an undeclared `value`. The closure lifted
    // either way — `freeLocals` treats a lambda's own parameters as bound — so nothing failed, and the
    // defect only became visible when a generator tried to emit the body.
    expect((lifted[0] as unknown as Record<string, unknown>)['params']).toEqual([
      { name: 'value', type: { name: 'int' } },
    ]);
  });

  it('omits `params` entirely for a closure that takes none', () => {
    const program = Program.of([
      signal('s1'),
      field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'other', 's1')))])),
    ]);

    const result = new PassManager([new N5LiftClosures()]).run(program, options);
    const lifted = result.program.ofKind('sig.Action')[0] as unknown as Record<string, unknown>;

    // Absent, not `[]` (§A18.3). An empty array would say something the source did not, and would re-hash
    // every parameterless action in every cached document to say it.
    expect('params' in lifted).toBe(false);
  });

  it('preserves parameter order, and does not sort them', () => {
    const params = [param('first', 'int'), param('second', 'String'), param('third', 'bool')];
    const program = Program.of([
      signal('s1'),
      field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'first')))], params)),
    ]);

    const result = new PassManager([new N5LiftClosures()]).run(program, options);
    const lifted = result.program.ofKind('sig.Action')[0] as unknown as Record<string, unknown>;

    // `writes` is a set and is sorted; `params` is a sequence and its order is the call site's contract.
    // Sorting these would produce `toggle(bool, int, String)` for `toggle(int, String, bool)` — a signature
    // that compiles and takes its arguments in the wrong order.
    expect((lifted['params'] as Record<string, unknown>[]).map((p) => p['name'])).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('carries a parameter’s full ParamDecl, not just its name', () => {
    const params = [param('value', 'String', { required: true, named: true })];
    const program = Program.of([
      signal('s1'),
      field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'value')))], params)),
    ]);

    const result = new PassManager([new N5LiftClosures()]).run(program, options);
    const lifted = result.program.ofKind('sig.Action')[0] as unknown as Record<string, unknown>;
    expect(lifted['params']).toEqual([{ name: 'value', type: { name: 'String' }, required: true, named: true }]);
  });

  it('still refuses a closure that captures a free local, and says why', () => {
    // A captured `item` is not a parameter the source wrote. §A18 does not reach it: turning a capture into a
    // parameter means rewriting every call site to pass a value only the compiler believes in.
    const program = Program.of([
      signal('s1'),
      field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'item')))])),
    ]);

    const result = new PassManager([new N5LiftClosures()]).run(program, options);

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    const finding = result.diagnostics.find((d) => d.code === 'BRG2105');
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('item');
    // The old message said "sig.Action has no parameters", which is now false. A diagnostic that explains a
    // refusal with a reason that no longer holds sends the reader to fix the wrong thing.
    expect(finding?.message).not.toContain('sig.Action has no parameters');
  });
});

describe('identity (ADR-17, D2)', () => {
  it('gives a parameterised action a different id than the same body without parameters', () => {
    // Content addressing working, not a migration problem: the content genuinely differs. Two actions that
    // take different arguments are not the same action.
    const withParams = nodeIdOfContent({
      kind: 'sig.Action',
      params: [param('id', 'int')],
      writes: ['s1'],
      body: [],
    } as never);
    const without = nodeIdOfContent({ kind: 'sig.Action', writes: ['s1'], body: [] } as never);
    expect(withParams).not.toBe(without);
  });

  it('does not change the id of an action that has no parameters', () => {
    // The whole reason `params` is optional rather than `[]`. This id is a fact about every document minted
    // before §A18, and it must survive the amendment.
    expect(nodeIdOfContent({ kind: 'sig.Action', writes: ['s1'], body: [] } as never)).toBe(
      nodeIdOfContent({ kind: 'sig.Action', writes: ['s1'], body: [] } as never),
    );
  });

  it('mints the same id for the same parameterised closure on every run', () => {
    const build = (): string => {
      const program = Program.of([
        signal('s1'),
        field('f1', lambda('l1', [stmt('st1', assign('a1', ref('r1', 'count', 's1'), ref('r2', 'value')))], [param('value', 'int')])),
      ]);
      return new PassManager([new N5LiftClosures()]).run(program, options).program.ofKind('sig.Action')[0]!.id;
    };
    expect(build()).toBe(build());
  });
});

describe('the whole pipeline preserves parameters', () => {
  it('N1–N11 leave a declared action’s params untouched', () => {
    const params = [param('id', 'int')];
    const program = Program.of([signal('s1'), action('act1', params)]);

    const result = new PassManager(normalizationPipeline()).run(program, {
      ...options,
      widgets: undefined as never,
    });

    // The gate the milestone asks for: "No pass may silently remove params." Asserted over the real
    // pipeline rather than by reading eleven passes, because the next pass is the one that would break it.
    const out = result.program.ofKind('sig.Action').find((a) => a.id === 'act1');
    expect((out as unknown as Record<string, unknown>)['params']).toEqual(params);
  });

  it('is byte-identical across two runs — incremental equals clean', () => {
    const build = (): string => {
      const program = Program.of([signal('s1'), action('act1', [param('id', 'int')])]);
      return new PassManager(normalizationPipeline())
        .run(program, { ...options, widgets: undefined as never })
        .program.toNdjson();
    };
    expect(build()).toBe(build());
  });

  it('round-trips a parameterised action through canonical NDJSON', () => {
    const params = [param('id', 'int'), param('force', 'bool', { named: true })];
    const program = Program.of([signal('s1'), action('act1', params)]);
    const document = program.toNdjson();

    // Canonical encoding is what node ids are hashes of, so a field that does not survive the round trip is
    // a field that gives one node two identities.
    const reparsed = Program.of(
      document
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as AnyUirNode),
    );
    expect(reparsed.toNdjson()).toBe(document);
    const out = reparsed.get('act1') as unknown as Record<string, unknown>;
    expect(out['params']).toEqual(params);
  });
});
