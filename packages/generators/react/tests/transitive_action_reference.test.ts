import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { fileAt, harness } from './support.js';

// A sig.Action referenced only from ANOTHER sig.Action's own body (M8-O). `referencedActions` used to
// walk only the render tree — `outer() { inner(); }`, `onPressed: outer`, declared only `outer`, and
// `inner`'s own, correctly-targeted reference reached the expression emitter with no declaration
// resolved for it, refused as BRG3006 for a program that, in fact, declared it. Fixed by a fixed-point
// walk over each newly-discovered action's own body. These are precise, isolated identity assertions on
// synthetic UIR; `transitive_actions_build.test.ts` covers the same shapes end to end from real Dart.

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

function actionNode(id: string, body: Record<string, unknown>[], extra: Record<string, unknown> = {}): AnyUirNode {
  return { id, kind: 'sig.Action', span, body, ...extra } as unknown as AnyUirNode;
}

function callOf(targetId: string, name = 'callee'): Record<string, unknown> {
  return {
    id: `${targetId}-call`,
    kind: 'logic.ExprStmt',
    span,
    expr: {
      id: `${targetId}-call-expr`,
      kind: 'logic.Call',
      span,
      callee: { id: `${targetId}-ref`, kind: 'logic.Ref', span, name, target: targetId, type: { name: 'void Function()' } },
      type: { name: 'void' },
    },
  };
}

function writeSignal(signalId: string): Record<string, unknown> {
  return {
    id: `${signalId}-write`,
    kind: 'logic.ExprStmt',
    span,
    expr: {
      id: `${signalId}-assign`,
      kind: 'logic.Assign',
      span,
      operator: 'increment',
      isPostfix: true,
      target: { id: `${signalId}-target`, kind: 'logic.Ref', span, name: 'count', target: signalId, type: { name: 'int' } },
      type: { name: 'int' },
    },
  };
}

function signal(id: string): AnyUirNode {
  return { id, kind: 'sig.Signal', span, type: { library: 'dart:core', name: 'int' } } as unknown as AnyUirNode;
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

describe('an action referenced only from another action’s body (M8-O)', () => {
  it('is discovered transitively and both are emitted', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('inner', [writeSignal('sig1')]),
      actionNode('outer', [callOf('inner')]),
      component('comp', 'W', button('btn', 'outer')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('handle_inner');
    expect(source).toContain('handle_outer');
    expect(source).not.toContain('not declared in this program');
  });

  it('two-hop (A -> B -> C) resolves in full', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('c', [writeSignal('sig1')]),
      actionNode('b', [callOf('c')]),
      actionNode('a', [callOf('b')]),
      component('comp', 'W', button('btn', 'a')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('handle_a');
    expect(source).toContain('handle_b');
    expect(source).toContain('handle_c');
  });

  it('fan-out (A -> B and A -> C) discovers both branches', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('b', [writeSignal('sig1')]),
      actionNode('c', [writeSignal('sig1')]),
      actionNode('a', [callOf('b'), callOf('c', 'callee2')]),
      component('comp', 'W', button('btn', 'a')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).toContain('handle_b');
    expect(source).toContain('handle_c');
  });

  it('a self-cycle (A -> A) terminates and emits exactly one declaration', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('a', [writeSignal('sig1'), callOf('a')]),
      component('comp', 'W', button('btn', 'a')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source.match(/const handle_a = /g)?.length).toBe(1);
  });

  it('a mutual cycle (A -> B -> A) terminates and emits exactly one declaration each', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('a', [writeSignal('sig1'), callOf('b')]),
      actionNode('b', [writeSignal('sig1'), callOf('a')]),
      component('comp', 'W', button('btn', 'a')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source.match(/const handle_a = /g)?.length).toBe(1);
    expect(source.match(/const handle_b = /g)?.length).toBe(1);
  });

  it('an action referenced both directly by render and transitively is emitted exactly once', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('inner', [writeSignal('sig1')]),
      actionNode('outer', [callOf('inner')]),
      component(
        'comp',
        'W',
        {
          id: 'root',
          kind: 'ui.Element',
          span,
          component: { name: 'Column', userDefined: false },
          children: [button('btn1', 'outer'), button('btn2', 'inner')],
        },
      ),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source.match(/const handle_inner = /g)?.length).toBe(1);
  });

  it('an action nothing reaches is never emitted', () => {
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      actionNode('inner', [writeSignal('sig1')]),
      actionNode('outer', [callOf('inner')]),
      actionNode('orphan', [writeSignal('sig1')]),
      component('comp', 'W', button('btn', 'outer')),
    ];
    const { context } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/w.tsx') ?? '';
    expect(source).not.toContain('handle_orphan');
  });

  it('identically-shaped actions in two different owners never cross-resolve or collapse', () => {
    // Deliberately identical bodies (both write `count`, both call an inner action) — a name- or
    // content-based discovery mechanism could plausibly conflate the two; NodeId-based discovery, keyed
    // off each owner's own distinct action ids, cannot.
    const nodes: AnyUirNode[] = [
      signal('sig1'),
      signal('sig2'),
      actionNode('a-inner', [writeSignal('sig1')]),
      actionNode('a-outer', [callOf('a-inner')]),
      actionNode('b-inner', [writeSignal('sig2')]),
      actionNode('b-outer', [callOf('b-inner')]),
      component('comp-a', 'A', button('btn-a', 'a-outer')),
      component('comp-b', 'B', button('btn-b', 'b-outer')),
    ];
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const sourceA = fileAt(files, 'src/components/a.tsx') ?? '';
    const sourceB = fileAt(files, 'src/components/b.tsx') ?? '';
    // Each component declares exactly its own two handlers (outer + the transitively-discovered inner)
    // — never the other component's, and never a merged/deduplicated single pair.
    expect(sourceA.match(/const handle_\w+ = /g)?.length).toBe(2);
    expect(sourceB.match(/const handle_\w+ = /g)?.length).toBe(2);
    expect(sourceA).not.toBe(sourceB);
  });

  it('discovery order does not affect the final, sorted emission order (declaration order reversed)', () => {
    const forward: AnyUirNode[] = [
      signal('sig1'),
      actionNode('c', [writeSignal('sig1')]),
      actionNode('b', [callOf('c')]),
      actionNode('a', [callOf('b')]),
      component('comp', 'W', button('btn', 'a')),
    ];
    const reversed: AnyUirNode[] = [...forward].reverse();

    const first = reactGenerator.generate(harness(forward).context);
    const second = reactGenerator.generate(harness(reversed).context);
    expect(fileAt(first.files, 'src/components/w.tsx')).toBe(fileAt(second.files, 'src/components/w.tsx'));
  });
});
