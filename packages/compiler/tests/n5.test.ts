// N5 — lift-closures (M2-T7).
//
// The pass that gives an event handler a name. N11 cannot move a thing that has no name.

import { nodeIdOfContent, UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { N5LiftClosures, PassManager, Program } from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

/** A signal. */
function signal(id: string): AnyUirNode {
  return { id, kind: 'sig.Signal', span, scope: 'component', type: { name: 'int' } } as AnyUirNode;
}

/** A reference to a declared node. */
function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'int' }, ...(target ? { target } : {}) };
}

/** `<target> ++` */
function increment(id: string, target: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    kind: 'logic.Assign',
    span,
    target,
    operator: 'increment',
    type: { name: 'int' },
  };
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
    type: { name: 'void Function()' },
    ...(params.length > 0 ? { params } : {}),
  };
}

/** A widget with an `onPressed` prop. */
function button(id: string, handler: Record<string, unknown>): AnyUirNode {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name: 'ElevatedButton', userDefined: false },
    props: {
      onPressed: { id: `${id}-b`, kind: 'bind.Expr', span, expr: handler },
    },
  } as unknown as AnyUirNode;
}

/** A program with one signal and one button whose handler is [handler]. */
function app(handler: Record<string, unknown>): Program {
  return Program.of([signal('sig1'), button('btn', handler)]);
}

function lift(program: Program) {
  const manager = new PassManager([new N5LiftClosures()]);
  return manager.run(program, options);
}

describe('N5 lifts a state-writing closure into a named action', () => {
  it('synthesizes a sig.Action with an explicit write set', () => {
    const result = lift(app(lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))])));

    const actions = result.program.ofKind('sig.Action');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.writes).toEqual(['sig1']);
    expect(actions[0]!.body).toHaveLength(1);
  });

  it('rewrites the prop to REFER to the action rather than inline the closure', () => {
    const result = lift(app(lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))])));

    const action = result.program.ofKind('sig.Action')[0]!;
    const element = result.program.ofKind('ui.Element')[0]! as unknown as Record<string, unknown>;
    const binding = (element['props'] as Record<string, Record<string, unknown>>)['onPressed']!;
    const expr = binding['expr'] as Record<string, unknown>;

    expect(expr['kind']).toBe('logic.Ref');
    expect(expr['target']).toBe(action.id);
    expect(expr['name']).toBe(`action$${action.id.slice(0, 8)}`);
  });

  it('the binding keeps its own id — it is the same binding, pointing somewhere else', () => {
    // Re-minting it would orphan every override anchor that addresses it.
    const result = lift(app(lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))])));

    const element = result.program.ofKind('ui.Element')[0]! as unknown as Record<string, unknown>;
    const binding = (element['props'] as Record<string, Record<string, unknown>>)['onPressed']!;

    expect(binding['id']).toBe('btn-b');
  });

  it('finds a write made through a method call, not only an assignment', () => {
    // C1's bug, pinned: `FavoritesStore.toggle` mutates via `_ids.add(x)`, never by assignment. An
    // assignment-only analysis returns an empty write set and the generated state never updates.
    const call = {
      id: 'c1',
      kind: 'logic.MethodCall',
      span,
      receiver: ref('r1', '_ids', 'sig1'),
      method: 'add',
      type: { name: 'void' },
    };
    const result = lift(app(lambda('l1', [stmt('s1', call)])));

    expect(result.program.ofKind('sig.Action')[0]!.writes).toEqual(['sig1']);
  });

  it('the write set is sorted — a set has no traversal order', () => {
    const program = Program.of([
      signal('zzz'),
      signal('aaa'),
      button(
        'btn',
        lambda('l1', [
          stmt('s1', increment('a1', ref('r1', 'z', 'zzz'))),
          stmt('s2', increment('a2', ref('r2', 'a', 'aaa'))),
        ]),
      ),
    ]);

    expect(lift(program).program.ofKind('sig.Action')[0]!.writes).toEqual(['aaa', 'zzz']);
  });
});

describe('N5 refuses to lift what it cannot close over', () => {
  it('a closure that writes nothing is not an action', () => {
    // Naming it as a mutation would tell the generator to notify subscribers of a change that never
    // happens.
    const navigate = {
      id: 'c1',
      kind: 'logic.Call',
      span,
      callee: ref('r1', 'go'),
      type: { name: 'void' },
    };
    const result = lift(app(lambda('l1', [stmt('s1', navigate)])));

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toEqual([]);
  });

  it('a closure capturing a free local is left alone, and says why (BRG2105)', () => {
    // `onTap: () => _select(item)` inside a `for (item in items)`. sig.Action has no parameters, so a
    // named action closed over `item` is an action whose capture set nobody can compute. Lifting anyway
    // would produce something that compiles and is wrong.
    const result = lift(
      app(
        lambda('l1', [
          stmt('s1', increment('a1', ref('r1', '_count', 'sig1'))),
          stmt('s2', {
            id: 'c1',
            kind: 'logic.Call',
            span,
            callee: ref('r2', 'use'),
            args: [ref('r3', 'item')],
            type: { name: 'void' },
          }),
        ]),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`item`');
    expect(result.diagnostics[0]!.message).toContain('N11');
  });

  it("a closure's OWN parameters are not captures", () => {
    // `onChanged: (String value) { setState(() { _email = value; }); }` — `value` is the closure's own
    // parameter, so lifting the closure takes it along. It is not a capture.
    const result = lift(
      app(
        lambda(
          'l1',
          [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_email', 'sig1'),
              operator: 'assign',
              value: ref('r2', 'value'),
              type: { name: 'String' },
            }),
          ],
          [{ name: 'value', type: { name: 'String' } }],
        ),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('N5 is deterministic, idempotent and identity-correct', () => {
  const source = () => app(lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))]));

  it('the action id is minted from canonical content — reproducible, everywhere', () => {
    const first = lift(source()).program.ofKind('sig.Action')[0]!;
    const second = lift(source()).program.ofKind('sig.Action')[0]!;

    expect(first.id).toBe(second.id);

    // And it is exactly the id the canonical content hashes to — the same function Dart uses (§A16).
    const { id: _id, span: _span, ...content } = first as unknown as Record<string, unknown>;
    expect(first.id).toBe(nodeIdOfContent(content));
  });

  it('running N5 twice is a fixed point', () => {
    // The second run sees a `logic.Ref`, not a `logic.Lambda`, so it has nothing to lift.
    const once = lift(source());
    const twice = lift(once.program);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.program.ofKind('sig.Action')).toHaveLength(1);
    expect(twice.manifest.passes[0]!.changed).toBe(false);
  });

  it('a program with no closures to lift is returned unchanged — the SAME object', () => {
    const program = Program.of([signal('sig1')]);

    expect(lift(program).program).toBe(program);
  });

  it('two identical closures become ONE action — that is what content addressing means', () => {
    const program = Program.of([
      signal('sig1'),
      button('btn1', lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))])),
      button('btn2', lambda('l2', [stmt('s2', increment('a2', ref('r2', '_count', 'sig1')))])),
    ]);

    const result = lift(program);

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
  });
});
