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

/** A local variable declaration (ADR-28) — `final int <name> = <value>;`. */
function varDecl(id: string, name: string, value: number): Record<string, unknown> {
  return {
    id,
    kind: 'logic.VarDecl',
    span,
    name,
    type: { name: 'int' },
    isFinal: true,
    initializer: { id: `${id}-init`, kind: 'logic.Lit', span, value, type: { name: 'int' } },
  };
}

/** A catch clause's own exception binding (ADR-28, amended M8-S) — no initializer, bound by the runtime. */
function catchExceptionDecl(id: string, name: string): Record<string, unknown> {
  return { id, kind: 'logic.VarDecl', span, name, type: { name: 'Object' }, isFinal: true };
}

/** A for-in loop's own declared variable (ADR-28, amended M9-A) — no initializer, bound by the runtime, once per iteration. */
function loopVarDecl(id: string, name: string): Record<string, unknown> {
  return { id, kind: 'logic.VarDecl', span, name, type: { name: 'int' }, isFinal: true };
}

/** A `for (final <loopDecl.name> in <iterable>) { <body> }`. */
function forIn(
  id: string,
  loopDecl: Record<string, unknown>,
  iterable: Record<string, unknown>,
  body: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.For',
    span,
    loopVariable: String(loopDecl['name']),
    loopDecl,
    iterable,
    body: { id: `${id}-body`, kind: 'logic.Block', span, statements: body },
  };
}

/**
 * A C-style loop declaring more than one variable (M9-B) —
 * `for (let <decls[0].name> = ..., <decls[1].name> = ...; ; ) { <body> }`. `init` is a `logic.Block` of
 * [decls], the same shape an ordinary multi-declaration `VariableDeclarationStatement` already uses.
 */
function classicForMulti(
  id: string,
  decls: Record<string, unknown>[],
  body: Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.For',
    span,
    init: { id: `${id}-init`, kind: 'logic.Block', span, statements: decls },
    body: { id: `${id}-body`, kind: 'logic.Block', span, statements: body },
  };
}

/** A `try { <tryBody> } on Object catch (<exceptionDecl.name>) { <catchBody> }`. */
function tryCatch(
  id: string,
  tryBody: Record<string, unknown>[],
  exceptionDecl: Record<string, unknown>,
  catchBody: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.TryCatch',
    span,
    body: { id: `${id}-body`, kind: 'logic.Block', span, statements: tryBody },
    catches: [
      {
        exceptionName: String(exceptionDecl['name']),
        exceptionDecl,
        body: { id: `${id}-catch-body`, kind: 'logic.Block', span, statements: catchBody },
      },
    ],
  };
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

describe('N5 treats a targeted local the same as an untargeted one (ADR-28)', () => {
  it('a closure capturing a local declared OUTSIDE it is refused, even though the local now has a target', () => {
    // Before ADR-28, `ref('r3', 'total')` (no target) was the only shape a captured local ever had, and
    // `freeLocals` caught it by falling through the `typeof target === 'string'` check. ADR-28 gives an
    // ordinary local a real target — this proves N5 does not mistake that for "safe to lift" the way it
    // already, correctly, does for a signal's target.
    const outer = varDecl('outer', 'total', 5) as unknown as AnyUirNode;
    const result = lift(
      Program.of([
        signal('sig1'),
        outer,
        button(
          'btn',
          lambda('l1', [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'total', 'outer'),
              type: { name: 'int' },
            }),
          ]),
        ),
      ]),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`total`');
  });

  it("a closure reading a local it declares ITSELF lifts — that capture is bound, not free", () => {
    const inner = varDecl('inner', 'total', 5);
    const result = lift(
      app(
        lambda('l1', [
          inner,
          stmt('s1', {
            id: 'a1',
            kind: 'logic.Assign',
            span,
            target: ref('r1', '_count', 'sig1'),
            operator: 'assign',
            value: ref('r3', 'total', 'inner'),
            type: { name: 'int' },
          }),
        ]),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it('a signal target is still always safe, unaffected by the local-id check', () => {
    // Regression: the fix must not accidentally start treating a signal's own target as "a local id" —
    // this is the exact shape every pre-existing N5 test above already exercises; pinned again here,
    // explicitly, alongside the new local-specific cases so the three read as one proof.
    const result = lift(app(lambda('l1', [stmt('s1', increment('a1', ref('r1', '_count', 'sig1')))])));

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  // M8-S: a catch clause's own exception binding is *also* a `logic.VarDecl` (ADR-28, amended) — nested
  // inside a `logic.TryCatch`, not a bare statement. Proves the existing, unmodified `walk(program)`-
  // based id set (M8-N's own generalisation) already covers it, with zero N5 code changes.

  it('a closure capturing a catch-bound exception declared OUTSIDE it is refused, even though it has a target', () => {
    const outerCatch = catchExceptionDecl('outer-e', 'e');
    const result = lift(
      Program.of([
        signal('sig1'),
        tryCatch('tc1', [], outerCatch, []) as unknown as AnyUirNode,
        button(
          'btn',
          lambda('l1', [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'e', 'outer-e'),
              type: { name: 'int' },
            }),
          ]),
        ),
      ]),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`e`');
  });

  it("a closure that catches its OWN exception and reads it lifts — that capture is bound, not free", () => {
    const innerCatch = catchExceptionDecl('inner-e', 'e');
    const result = lift(
      app(
        lambda('l1', [
          tryCatch(
            'tc1',
            [],
            innerCatch,
            [
              stmt('s1', {
                id: 'a1',
                kind: 'logic.Assign',
                span,
                target: ref('r1', '_count', 'sig1'),
                operator: 'assign',
                value: ref('r3', 'e', 'inner-e'),
                type: { name: 'int' },
              }),
            ],
          ),
        ]),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  // M9-A: a for-in loop's own declared variable is *also* a `logic.VarDecl` (ADR-28, amended) — nested
  // inside a `logic.For`'s own `loopDecl` field, not a bare statement. Proves the existing, unmodified
  // `walk(program)`-based id set (M8-N's own generalisation) already covers it too, with zero N5 code
  // changes — the identical shape M8-S already proved for a catch clause's own exception binding.

  it('a closure capturing an enclosing loop variable is refused, even though it has a target', () => {
    const outerLoop = loopVarDecl('outer-item', 'item');
    const result = lift(
      Program.of([
        signal('sig1'),
        forIn('for1', outerLoop, ref('r-items', 'items'), []) as unknown as AnyUirNode,
        button(
          'btn',
          lambda('l1', [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'item', 'outer-item'),
              type: { name: 'int' },
            }),
          ]),
        ),
      ]),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`item`');
  });

  it('a closure that declares its OWN for-in loop and reads that loop variable lifts — that capture is bound, not free', () => {
    const innerLoop = loopVarDecl('inner-item', 'item');
    // A list literal, not a `Ref` to an outer local — this test is isolating whether the loop variable's
    // OWN capture is safe, not whether the iterable expression is; a bare, untargeted `Ref` here would be
    // free for an unrelated reason (nothing declares `items`) and would refuse the lift for the wrong cause.
    const iterable = { id: 'r-items', kind: 'logic.ListLit', span, elements: [], type: { name: 'List<int>' } };
    const result = lift(
      app(
        lambda('l1', [
          forIn('for1', innerLoop, iterable, [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'item', 'inner-item'),
              type: { name: 'int' },
            }),
          ]) as unknown as Record<string, unknown>,
        ]),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  // M9-B: a C-style loop declaring more than one variable represents `init` as a `logic.Block` of
  // `logic.VarDecl`s (the same shape an ordinary multi-declaration `VariableDeclarationStatement`
  // already uses) — nested one level deeper than M9-A's own `loopDecl`/single-`init` case. Proves the
  // existing, unmodified `walk(program)`-based id set still finds every declaration regardless, with
  // zero N5 code changes.

  it('a closure capturing the SECOND declaration of an enclosing multi-declaration loop is refused', () => {
    const iDecl = loopVarDecl('outer-i', 'i');
    const jDecl = loopVarDecl('outer-j', 'j');
    const outerLoop = classicForMulti('for1', [iDecl, jDecl]);
    const result = lift(
      Program.of([
        signal('sig1'),
        outerLoop as unknown as AnyUirNode,
        button(
          'btn',
          lambda('l1', [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'j', 'outer-j'),
              type: { name: 'int' },
            }),
          ]),
        ),
      ]),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`j`');
  });

  it('a closure that declares its OWN multi-declaration loop and reads both declarations lifts — both captures are bound, not free', () => {
    const iDecl = loopVarDecl('inner-i', 'i');
    const jDecl = loopVarDecl('inner-j', 'j');
    const result = lift(
      app(
        lambda('l1', [
          classicForMulti('for1', [iDecl, jDecl], [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: {
                id: 'v1',
                kind: 'logic.Binary',
                span,
                left: ref('r2', 'i', 'inner-i'),
                operator: '+',
                right: ref('r3', 'j', 'inner-j'),
                type: { name: 'int' },
              },
              type: { name: 'int' },
            }),
          ]) as unknown as Record<string, unknown>,
        ]),
      ),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  // M9-C: a declaration list's own later member resolves an earlier one via sequential, growing scope —
  // `b`'s own initializer now carries a real `target` at `a`. Proves the existing, unmodified
  // `walk(program)`-based id set still finds every declaration regardless of which declaration's own
  // initializer references which, with zero N5 code changes.

  it('a closure capturing the SECOND member of an enclosing, cross-initializer-resolved declaration list is refused', () => {
    const aDecl = varDecl('outer-a', 'a', 1);
    const bDecl = {
      id: 'outer-b',
      kind: 'logic.VarDecl',
      span,
      name: 'b',
      type: { name: 'int' },
      isFinal: true,
      initializer: {
        id: 'outer-b-init',
        kind: 'logic.Binary',
        span,
        left: ref('outer-b-left', 'a', 'outer-a'),
        operator: '+',
        right: { id: 'outer-b-one', kind: 'logic.Lit', span, value: 1, type: { name: 'int' } },
        type: { name: 'int' },
      },
    };
    const declList = { id: 'block1', kind: 'logic.Block', span, statements: [aDecl, bDecl] };
    const result = lift(
      Program.of([
        signal('sig1'),
        declList as unknown as AnyUirNode,
        button(
          'btn',
          lambda('l1', [
            stmt('s1', {
              id: 'a1',
              kind: 'logic.Assign',
              span,
              target: ref('r1', '_count', 'sig1'),
              operator: 'assign',
              value: ref('r3', 'b', 'outer-b'),
              type: { name: 'int' },
            }),
          ]),
        ),
      ]),
    );

    expect(result.program.ofKind('sig.Action')).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe('BRG2105');
    expect(result.diagnostics[0]!.message).toContain('`b`');
  });

  it('a closure that declares its OWN cross-initializer-resolved declaration list and reads both members lifts — both captures are bound, not free', () => {
    const aDecl = varDecl('inner-a', 'a', 1);
    const bDecl = {
      id: 'inner-b',
      kind: 'logic.VarDecl',
      span,
      name: 'b',
      type: { name: 'int' },
      isFinal: true,
      initializer: {
        id: 'inner-b-init',
        kind: 'logic.Binary',
        span,
        left: ref('inner-b-left', 'a', 'inner-a'),
        operator: '+',
        right: { id: 'inner-b-one', kind: 'logic.Lit', span, value: 1, type: { name: 'int' } },
        type: { name: 'int' },
      },
    };
    const result = lift(
      app(
        lambda('l1', [
          aDecl,
          bDecl,
          stmt('s1', {
            id: 'a1',
            kind: 'logic.Assign',
            span,
            target: ref('r1', '_count', 'sig1'),
            operator: 'assign',
            value: ref('r3', 'b', 'inner-b'),
            type: { name: 'int' },
          }),
        ] as unknown as Record<string, unknown>[]),
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
