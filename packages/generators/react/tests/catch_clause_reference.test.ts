import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// A catch clause's own exception binding (ADR-28, amended M8-S). Before this milestone, `on Object catch
// (e) { ... e ... }` extracted `e` with no declaration at all — a bare `exceptionName` string and an
// untargeted `logic.Ref` — so a read of it always fell through to `BRG3006` ("`e` is not declared in this
// program"), even though the binding plainly exists in the source. Separately, `statement.ts`'s own
// `logic.TryCatch` case read a field (`exception`) that never matched the real schema field
// (`exceptionName`), so the emitted `catch (...)` parameter was *always* the hardcoded fallback `error`,
// regardless of the source's own name — a latent bug masked, until now, by the fact that a resolvable read
// of the exception variable never existed to expose the mismatch. Both are fixed together here: the
// analyzer now gives the exception binding a real, declaration-tier `logic.VarDecl` (`exceptionDecl`), and
// the generator emits the catch parameter under that same declaration's own name.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function signal(id: string): AnyUirNode {
  return { id, kind: 'sig.Signal', span, type: { library: 'dart:core', name: 'int' } } as unknown as AnyUirNode;
}

function exceptionDecl(id: string, name: string): Record<string, unknown> {
  return { id, kind: 'logic.VarDecl', span, name, type: { library: 'dart:core', name: 'Object' }, isFinal: true };
}

/** A reference. `target` is absent for an untargeted read (the pre-fix shape, or a genuinely free name). */
function ref(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { library: 'dart:core', name: 'Object' }, ...(target ? { target } : {}) };
}

function writeSignal(id: string, signalId: string, value: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    kind: 'logic.ExprStmt',
    span,
    expr: {
      id: `${id}-assign`,
      kind: 'logic.Assign',
      span,
      operator: 'assign',
      type: { library: 'dart:core', name: 'int' },
      target: { id: `${id}-target`, kind: 'logic.Ref', span, name: 'count', target: signalId, type: { library: 'dart:core', name: 'int' } },
      value,
    },
  };
}

/** A `try { <tryBody> } on Object catch (<exceptionDecl.name>) { <catchBody> }` statement. */
function tryCatch(
  id: string,
  tryBody: Record<string, unknown>[],
  exception: Record<string, unknown> | undefined,
  catchBody: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id,
    kind: 'logic.TryCatch',
    span,
    body: { id: `${id}-try-body`, kind: 'logic.Block', span, statements: tryBody },
    catches: [
      {
        ...(exception === undefined
          ? {}
          : { exceptionName: String(exception['name']), exceptionDecl: exception }),
        body: { id: `${id}-catch-body`, kind: 'logic.Block', span, statements: catchBody },
      },
    ],
  };
}

function actionNode(id: string, body: Record<string, unknown>[]): AnyUirNode {
  return { id, kind: 'sig.Action', span, body } as unknown as AnyUirNode;
}

function component(id: string, name: string, render: Record<string, unknown>): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function button(id: string, targetId: string): Record<string, unknown> {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name: 'ElevatedButton', userDefined: false },
    props: {
      onPressed: {
        id: `${id}-b`,
        kind: 'bind.Expr',
        span,
        expr: { id: `${id}-ref`, kind: 'logic.Ref', span, name: 'handler', target: targetId, type: { name: 'void Function()' } },
      },
    },
  };
}

describe('a catch clause’s own exception binding (ADR-28, amended M8-S)', () => {
  it('a targeted read inside the clause resolves to the real declaration, under its declared name', () => {
    const decl = exceptionDecl('e-decl', 'e');
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('act', [
        tryCatch('tc1', [], decl, [writeSignal('s1', 'sig1', ref('r1', 'e', 'e-decl'))]),
      ]),
      component('comp', 'W', button('btn', 'act')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('catch (e)');
    expect(source).not.toContain('not declared in this program');
    // The read inside the catch body must use the SAME identifier the catch parameter itself declares —
    // not a coincidentally-matching literal name (mutation-resistance: a name-based fallback would also
    // pass this half of the assertion, which is why the declared-name-mismatch test below exists too).
    expect(source).toMatch(/catch \(e\) \{[^}]*\be\b/s);
  });

  it('two catch clauses in two different actions, same exception name, never collide (target-based, not name-based)', () => {
    const declA = exceptionDecl('e-decl-a', 'e');
    const declB = exceptionDecl('e-decl-b', 'e');
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('actA', [tryCatch('tcA', [], declA, [writeSignal('sA', 'sig1', ref('rA', 'e', 'e-decl-a'))])]),
      actionNode('actB', [tryCatch('tcB', [], declB, [writeSignal('sB', 'sig1', ref('rB', 'e', 'e-decl-b'))])]),
      component('comp', 'W', {
        id: 'root',
        kind: 'ui.Element',
        span,
        component: { name: 'Column', userDefined: false },
        children: [button('btnA', 'actA'), button('btnB', 'actB')],
      }),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).not.toContain('not declared in this program');
    // Both independently resolve — this would still pass under an accidental name-based shortcut, but
    // combined with the declared-name-mismatch test below, the pair together requires target resolution.
    expect((source.match(/catch \(e\)/g) ?? []).length).toBe(2);
  });

  it('a declaration named differently from the read’s own literal name proves resolution is target-based, not name-based', () => {
    // The read's OWN `name` field says `boom` (stale, or simply what the source token spelled at some
    // earlier point) but its `target` points at a declaration actually named `e`. A name-based fallback
    // would either emit `boom` (undeclared, wrong) or fail to resolve at all; target-based resolution
    // must emit `e` — matching what the catch parameter itself declares — regardless of the ref's own
    // `name` field.
    const decl = exceptionDecl('e-decl', 'e');
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('act', [
        tryCatch('tc1', [], decl, [writeSignal('s1', 'sig1', ref('r1', 'boom', 'e-decl'))]),
      ]),
      component('comp', 'W', button('btn', 'act')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('catch (e)');
    expect(source).not.toContain('boom');
  });

  it('an untargeted read of the same name is never silently resolved — still BRG3006, unweakened', () => {
    const decl = exceptionDecl('e-decl', 'e');
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('act', [
        // The read has NO target — the pre-fix shape, or a genuinely free reference — even though a
        // same-named declaration exists elsewhere in the program. It must not be guessed at by name.
        tryCatch('tc1', [], decl, [writeSignal('s1', 'sig1', ref('r1', 'e'))]),
      ]),
      component('comp', 'W', button('btn', 'act')),
    ];
    const { context, reported } = harness(nodes);
    reactGenerator.generate(context);

    expect(reported.some((d) => d.severity === 'error' && d.code === 'BRG3006')).toBe(true);
  });

  it('a clause with no exception parameter at all still emits a bare catch, unaffected', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('act', [
        tryCatch('tc1', [], undefined, [writeSignal('s1', 'sig1', { id: 'lit', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 })]),
      ]),
      component('comp', 'W', button('btn', 'act')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('catch (error)');
  });
});
