import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// A component referencing a signal or action a store owns, without that component otherwise consuming
// the store (M7-E3 finding).
//
// `useStore(...)` is not yet established for an arbitrary component's render tree — there is no working
// path to lower such a reference into compiling code. Before this milestone, the signal case already
// refused explicitly (`BRG3006`); the action case did not — `declareLocalActions` declared a local
// closure for *any* referenced action regardless of ownership, and lowered its body in a scope that
// could not resolve the store's signal either, emitting a bare, unimported identifier
// (`sigDark = true;`) that only `tsc`, far downstream, would have caught. These tests pin the fix: both
// cases now refuse the same way — loudly, in the generator's own diagnostics, before any file is
// written — rather than one of them silently miscompiling.
//
// This is a generator-level limitation, not a defect in N11's promotion (`n9_n10_n11.test.ts` proves the
// UIR rewrite is correct in isolation). Full cross-store consumption from an arbitrary component —
// wiring `useStore(...)` so the value actually renders — remains unimplemented; see
// `docs/m7/m7e3-route-interface-promotion.md`.

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;

function component(id: string, name: string, render: unknown): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function route(id: string, component: string): AnyUirNode {
  return { id, kind: 'app.Route', span, path: '/', component } as unknown as AnyUirNode;
}

describe('a component referencing a store member it is not wired to', () => {
  it('a store-scoped signal it does not declare refuses explicitly — never silent (already true before M7-E3)', () => {
    const signal: AnyUirNode = {
      id: 'sig1',
      kind: 'sig.Signal',
      span,
      scope: 'store',
      store: 'store1',
      type: { name: 'int' },
      initial: { id: 'i1', kind: 'logic.Lit', span, type: { name: 'int' }, value: 0 },
    } as unknown as AnyUirNode;
    const store: AnyUirNode = { id: 'store1', kind: 'app.Store', span, name: 'PromotedStore', origin: 'promoted', signals: ['sig1'] } as unknown as AnyUirNode;
    const comp = component('comp1', 'Screen', {
      id: 'r1',
      kind: 'ui.Text',
      span,
      value: { id: 'b1', kind: 'bind.Signal', span, signal: 'sig1' },
    });

    const { context, reported } = harness([signal, store, comp, route('route1', 'comp1')]);
    const { files } = reactGenerator.generate(context);

    expect(files).toEqual([]);
    const codes = reported.filter((d) => d.severity === 'error').map((d) => d.code);
    expect(codes).toContain('BRG3006');
    expect(reported.some((d) => d.message.includes('sig1'))).toBe(true);
  });

  it('a store-scoped action it does not declare now refuses explicitly too — no more silent bare-identifier emission', () => {
    const signal: AnyUirNode = {
      id: 'sig1',
      kind: 'sig.Signal',
      span,
      scope: 'store',
      store: 'store1',
      type: { name: 'bool' },
      initial: { id: 'i1', kind: 'logic.Lit', span, type: { name: 'bool' }, value: false },
    } as unknown as AnyUirNode;
    const action: AnyUirNode = {
      id: 'act1',
      kind: 'sig.Action',
      span,
      writes: ['sig1'],
      body: [
        {
          id: 's1',
          kind: 'logic.ExprStmt',
          span,
          expr: {
            id: 'e1',
            kind: 'logic.Assign',
            span,
            operator: 'assign',
            target: { id: 't1', kind: 'logic.Ref', span, name: 'sig1', target: 'sig1', type: { name: 'bool' } },
            value: { id: 'v1', kind: 'logic.Lit', span, type: { name: 'bool' }, value: true },
            type: { name: 'bool' },
          },
        },
      ],
    } as unknown as AnyUirNode;
    const store: AnyUirNode = {
      id: 'store1',
      kind: 'app.Store',
      span,
      name: 'PromotedStore',
      origin: 'promoted',
      signals: ['sig1'],
      actions: ['act1'],
    } as unknown as AnyUirNode;
    const comp = component('comp1', 'Screen', {
      id: 'r1',
      kind: 'ui.Element',
      span,
      component: { name: 'IconButton', userDefined: false },
      props: {
        onPressed: {
          id: 'b1',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e2', kind: 'logic.Ref', span, name: 'toggle', target: 'act1', type: { name: 'void Function()' } },
        },
      },
    });
    // `IconButton` paints Material roles — irrelevant to what this test checks, so every role it needs
    // is tokened, keeping the only refusal in the diagnostics the one this test is about.
    const tokens: AnyUirNode[] = ['primary', 'onSurfaceVariant', 'surface', 'onSurface', 'error'].map(
      (role) =>
        ({ id: `tok_${role}`, kind: 'app.Token', span, group: 'color', name: role, role, light: '#FF000000' }) as unknown as AnyUirNode,
    );

    const { context, reported } = harness([signal, action, store, comp, route('route1', 'comp1'), ...tokens]);
    const { files } = reactGenerator.generate(context);

    // No file is emitted, and — the specific defect this pins — no file contains a bare, unimported
    // `sig1` identifier. Before the fix this generated `const handle_act1 = () => { sig1 = true; };`
    // with *no* error reported at all.
    expect(files).toEqual([]);
    expect(files.some((f) => f.contents.includes('sig1 ='))).toBe(false);

    const codes = reported.filter((d) => d.severity === 'error').map((d) => d.code);
    expect(codes).toContain('BRG3006');
    expect(reported.some((d) => d.message.includes('toggle'))).toBe(true);
  });
});
