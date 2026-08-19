import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// A component consuming a store member (signal, derived value, or action) it does not itself own —
// exactly the shape N11 leaves behind after a successful promotion (M7-E3, ADR-11 amendment), and the
// shape any ordinary `origin: "declared"` store's member gets read through too. `origin` is provenance,
// not a second runtime mechanism: both are lowered identically, through the real `useStore`/`useSignal`
// API `packages/runtimes/react/src/internal/react/context.ts` and `hooks.ts` already expose (M7-F).
//
// Before this milestone, this shape refused explicitly — a signal read reported `BRG3006`; an action
// reference silently emitted a bare, unimported identifier (`store_consumption.test.ts`'s previous
// version pinned both). These tests replace that pin: the same shapes now compile to real,
// hook-rule-correct React, proven by inspecting the generated source directly (a diagnostic disappearing
// is not proof — see docs/m7/m7f-promoted-store-consumption.md).

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;

function component(id: string, name: string, render: unknown): AnyUirNode {
  return { id, kind: 'ui.Component', span, name, render } as unknown as AnyUirNode;
}

function route(id: string, path: string, componentId: string): AnyUirNode {
  return { id, kind: 'app.Route', span, path, component: componentId } as unknown as AnyUirNode;
}

function storeSignal(id: string, storeId: string, initial: unknown = 0): AnyUirNode {
  return {
    id,
    kind: 'sig.Signal',
    span,
    scope: 'store',
    store: storeId,
    type: { name: 'int' },
    initial: { id: `${id}-i`, kind: 'logic.Lit', span, type: { name: 'int' }, value: initial },
  } as unknown as AnyUirNode;
}

function storeAction(id: string, writes: string[], body: unknown[] = []): AnyUirNode {
  return { id, kind: 'sig.Action', span, writes, body } as unknown as AnyUirNode;
}

function store(id: string, name: string, parts: Partial<Record<'signals' | 'derived' | 'actions', string[]>>): AnyUirNode {
  return { id, kind: 'app.Store', span, name, origin: 'promoted', ...parts } as unknown as AnyUirNode;
}

function bindSignal(id: string, signalId: string): Record<string, unknown> {
  return { id, kind: 'bind.Signal', span, signal: signalId };
}

function text(id: string, value: unknown): unknown {
  return { id, kind: 'ui.Text', span, value };
}

function actionRef(id: string, actionId: string, name = 'run'): Record<string, unknown> {
  return { id, kind: 'bind.Expr', span, expr: { id: `${id}-e`, kind: 'logic.Ref', span, name, target: actionId, type: { name: 'void Function()' } } };
}

function iconButton(id: string, onPressed: unknown): unknown {
  return { id, kind: 'ui.Element', span, component: { name: 'IconButton', userDefined: false }, props: { onPressed } };
}

const themeTokens: AnyUirNode[] = ['primary', 'onSurfaceVariant', 'surface', 'onSurface', 'error'].map(
  (role) => ({ id: `tok_${role}`, kind: 'app.Token', span, group: 'color', name: role, role, light: '#FF000000' }) as unknown as AnyUirNode,
);

function screenFile(files: readonly { readonly path: string; readonly contents: string }[]): string {
  const file = files.find((f) => f.path.includes('screen'));
  if (file === undefined) throw new Error('no screen file emitted');
  return file.contents;
}

describe('a component reading a store signal directly (no owning param)', () => {
  it('subscribes with useSignal — not a non-subscribing .get() (the M5-D defect, avoided again)', () => {
    const sig = storeSignal('sig1', 'store1', 7);
    const comp = component('comp1', 'Screen', text('t1', bindSignal('b1', 'sig1')));
    const { context, reported } = harness([sig, store('store1', 'Counter', { signals: ['sig1'] }), comp, route('r1', '/', 'comp1')]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);

    expect(source).toContain('useStore');
    expect(source).toContain('useSignal');
    expect(source).toMatch(/const \w+ = useStore\(counterStore\);/);
    expect(source).toMatch(/const \w+\$ = useSignal\(\w+\.value_sig1\);/);
    // Never a non-subscribing read where render needs one.
    expect(source).not.toMatch(/\.value_sig1\.get\(\)/);
  });

  it('works through string interpolation, nested, and computed expressions — not just a direct bind.Signal', () => {
    const sig = storeSignal('sig1', 'store1', 3);
    const interpolated = {
      id: 't1',
      kind: 'ui.Text',
      span,
      value: {
        id: 'b1',
        kind: 'bind.Expr',
        span,
        expr: {
          id: 'si1',
          kind: 'logic.StringInterp',
          span,
          type: { library: 'dart:core', name: 'String' },
          parts: [
            { id: 'l1', kind: 'logic.Lit', span, type: { name: 'String' }, value: 'count: ' },
            { id: 'r1', kind: 'logic.Ref', span, name: 'sig1', target: 'sig1', type: { name: 'int' } },
          ],
        },
      },
    };
    const comp = component('comp1', 'Screen', interpolated);
    const { context, reported } = harness([sig, store('store1', 'Counter', { signals: ['sig1'] }), comp, route('r1', '/', 'comp1')]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);
    // Named `sig1`, not `value_sig1`: the reference inside the interpolation carries that name, and a
    // referenced name is preferred over the generic fallback prefix (`store.ts`'s `nameOf`).
    expect(source).toMatch(/const \w+\$ = useSignal\(\w+\.sig1\);/);
  });

  it('hoists the hook unconditionally out of a ui.Cond branch — the Rules of Hooks admit nothing less', () => {
    const sig = storeSignal('sig1', 'store1', 1);
    const cond = {
      id: 'c1',
      kind: 'ui.Cond',
      span,
      test: bindSignal('bt', 'sig1'),
      then: text('t1', bindSignal('b1', 'sig1')),
    };
    const comp = component('comp1', 'Screen', cond);
    const { context, reported } = harness([sig, store('store1', 'Counter', { signals: ['sig1'] }), comp, route('r1', '/', 'comp1')]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);
    // The hook call appears once, above `return`, never inside the conditional's own branch text.
    const hookLine = source.split('\n').findIndex((l) => l.includes('useSignal('));
    const returnLine = source.split('\n').findIndex((l) => l.trim().startsWith('return'));
    expect(hookLine).toBeGreaterThan(-1);
    expect(hookLine).toBeLessThan(returnLine);
    expect(source.match(/useSignal\(/g)?.length).toBe(1);
  });
});

describe('a component invoking a store action directly (no owning param)', () => {
  it('is a direct reference to the store action — never a reconstructed body at the call site', () => {
    const act = storeAction('act1', []);
    const comp = component('comp1', 'Screen', iconButton('b1', actionRef('r1', 'act1', 'toggle')));
    const { context, reported } = harness([act, store('store1', 'Toggle', { actions: ['act1'] }), comp, route('r1', '/', 'comp1'), ...themeTokens]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);

    // Named `toggle`, from the reference's own name (`actionRef`'s third argument), preferred over the
    // generic fallback (`store.ts`'s `nameOf`) — the same rule the signal case above already exercises.
    expect(source).toMatch(/onPressed=\{\w+\.toggle\}/);
    // Not called, not wrapped, not reconstructed — a bare reference, exactly like an ordinary store's own.
    expect(source).not.toContain('=> {');
    expect(source).not.toContain('.get()');
  });

  it('an action writing multiple signals is still a bare reference — no lowering distinction', () => {
    const a = storeSignal('sigA', 'store1', 0);
    const b = storeSignal('sigB', 'store1', 0);
    const act = storeAction('act1', ['sigA', 'sigB']);
    const comp = component('comp1', 'Screen', iconButton('b1', actionRef('r1', 'act1')));
    const { context, reported } = harness([
      a,
      b,
      act,
      store('store1', 'Pair', { signals: ['sigA', 'sigB'], actions: ['act1'] }),
      comp,
      route('r1', '/', 'comp1'),
      ...themeTokens,
    ]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    // `actionRef`'s default reference name is `run` — see the helper above.
    expect(screenFile(files)).toMatch(/onPressed=\{\w+\.run\}/);
  });

  it('the same action, referenced from two components, resolves independently in each — no shared local', () => {
    const act = storeAction('act1', []);
    const comp1 = component('comp1', 'ScreenA', iconButton('b1', actionRef('r1', 'act1')));
    const comp2 = component('comp2', 'ScreenB', iconButton('b2', actionRef('r2', 'act1')));
    const { context, reported } = harness([
      act,
      store('store1', 'Shared', { actions: ['act1'] }),
      comp1,
      comp2,
      route('r1', '/a', 'comp1'),
      route('r2', '/b', 'comp2'),
      ...themeTokens,
    ]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const a = files.find((f) => f.path.includes('screen-a'))!.contents;
    const b = files.find((f) => f.path.includes('screen-b'))!.contents;
    expect(a).toMatch(/useStore\(sharedStore\)/);
    expect(b).toMatch(/useStore\(sharedStore\)/);
  });
});

describe('multiple stores, and identity over name coincidence', () => {
  it('a component using StoreA.signal, StoreB.signal, and StoreA.action gets exactly the required consumption', () => {
    const sigA = storeSignal('sigA', 'storeA', 1);
    const sigB = storeSignal('sigB', 'storeB', 2);
    const act = storeAction('actA', ['sigA']);
    const tree = {
      id: 'col',
      kind: 'ui.Element',
      span,
      component: { name: 'Column', userDefined: false },
      props: {},
      children: [text('t1', bindSignal('b1', 'sigA')), text('t2', bindSignal('b2', 'sigB')), iconButton('btn', actionRef('r1', 'actA'))],
    };
    const comp = component('comp1', 'Screen', tree);
    const { context, reported } = harness([
      sigA,
      sigB,
      act,
      store('storeA', 'AlphaStore', { signals: ['sigA'], actions: ['actA'] }),
      store('storeB', 'BetaStore', { signals: ['sigB'] }),
      comp,
      route('r1', '/', 'comp1'),
      ...themeTokens,
    ]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);

    // Exactly one `useStore` per store — not one per member.
    expect(source.match(/useStore\(/g)?.length).toBe(2);
    expect(source).toContain('useStore(alphaStoreStore)');
    expect(source).toContain('useStore(betaStoreStore)');
    // Deterministic order: stores appear sorted by their own exported name (alpha before beta).
    expect(source.indexOf('alphaStoreStore')).toBeLessThan(source.indexOf('betaStoreStore'));
    // `actionRef`'s default reference name is `run`.
    expect(source).toMatch(/onPressed=\{\w+\.run\}/);
  });

  it('two stores with an identically-named signal resolve to their own store, by id — never by name', () => {
    const sig1 = { ...storeSignal('sig1', 'store1', 1), anchor: 'lib/a.dart#count' } as unknown as AnyUirNode;
    const sig2 = { ...storeSignal('sig2', 'store2', 99), anchor: 'lib/b.dart#count' } as unknown as AnyUirNode;
    const tree = {
      id: 'col',
      kind: 'ui.Element',
      span,
      component: { name: 'Column', userDefined: false },
      props: {},
      children: [text('t1', bindSignal('b1', 'sig1')), text('t2', bindSignal('b2', 'sig2'))],
    };
    const comp = component('comp1', 'Screen', tree);
    const { context, reported } = harness([
      sig1,
      sig2,
      store('store1', 'One', { signals: ['sig1'] }),
      store('store2', 'Two', { signals: ['sig2'] }),
      comp,
      route('r1', '/', 'comp1'),
    ]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);
    // Both are named `count` at the source, but each resolves through its own store's own object —
    // never coincidentally through the other, and never merged into one subscription.
    expect(source).toMatch(/useSignal\(\w+\.count\)/);
    expect(source.match(/useSignal\(/g)?.length).toBe(2);
    expect(source).toContain('useStore(oneStore)');
    expect(source).toContain('useStore(twoStore)');
  });
});

describe('derived values — the same store-consumption path, unmodified', () => {
  it('a promoted derived value subscribes through useSignal exactly like a signal', () => {
    const sig = storeSignal('sig1', 'store1', 2);
    const derived = {
      id: 'der1',
      kind: 'sig.Derived',
      span,
      body: { id: 'e1', kind: 'logic.Binary', span, operator: '*', type: { name: 'int' }, left: { id: 'l1', kind: 'logic.Ref', span, name: 'sig1', target: 'sig1', type: { name: 'int' } }, right: { id: 'lit', kind: 'logic.Lit', span, type: { name: 'int' }, value: 2 } },
    } as unknown as AnyUirNode;
    const comp = component('comp1', 'Screen', text('t1', bindSignal('b1', 'der1')));
    const { context, reported } = harness([
      sig,
      derived,
      store('store1', 'Doubled', { signals: ['sig1'], derived: ['der1'] }),
      comp,
      route('r1', '/', 'comp1'),
    ]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = screenFile(files);
    expect(source).toMatch(/const \w+\$ = useSignal\(\w+\.computed_der1\);/);
  });
});

describe('protecting ordinary, non-promoted store consumption', () => {
  it('a `declared` store (not promoted) is consumed identically — origin is provenance, not a second mechanism', () => {
    const sig = storeSignal('sig1', 'store1', 5);
    const declaredStore = { id: 'store1', kind: 'app.Store', span, name: 'Ordinary', origin: 'declared', signals: ['sig1'] } as unknown as AnyUirNode;
    const comp = component('comp1', 'Screen', text('t1', bindSignal('b1', 'sig1')));
    const { context, reported } = harness([sig, declaredStore, comp, route('r1', '/', 'comp1')]);

    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(screenFile(files)).toMatch(/const \w+\$ = useSignal\(\w+\.value_sig1\);/);
  });
});
