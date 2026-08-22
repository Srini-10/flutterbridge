// N9 key-inference, N10 theme-tokenize, N11 promote-cross-route-state.

import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import {
  N10ThemeTokenize,
  N11PromoteCrossRouteState,
  N5LiftClosures,
  N9KeyInference,
  N8ExtractSlots,
  N7FlattenWrappers,
  N6ConstFold,
  navGraph,
  PassManager,
  Program,
} from '../src/index.js';

const span = { file: 'lib/a.dart', line: 1, column: 1 } as const;
const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH };

// ── N9 ────────────────────────────────────────────────────────────────────────────────────────────

function list(id: string, template: Record<string, unknown>, key?: unknown): AnyUirNode {
  return {
    id,
    kind: 'ui.List',
    span,
    source: { id: `${id}-s`, kind: 'bind.Signal', span, signal: 'sig1' },
    itemParam: 'item',
    template,
    ...(key ? { key } : {}),
  } as unknown as AnyUirNode;
}

function tile(id: string, key?: unknown): Record<string, unknown> {
  return {
    id,
    kind: 'ui.Element',
    span,
    component: { name: 'ListTile', userDefined: false },
    ...(key ? { key } : {}),
  };
}

describe('N9 — key inference', () => {
  const manager = () => new PassManager([new N6ConstFold(), new N7FlattenWrappers(), new N8ExtractSlots(), new N9KeyInference()]);

  it('lifts a key the template already carries onto the list', () => {
    const key = { id: 'k', kind: 'bind.Expr', span, expr: { id: 'ke', kind: 'logic.Ref', span, name: 'item', type: { name: 'int' } } };
    const program = Program.of([list('l', tile('t', key))]);

    const result = manager().run(program, options);
    const lifted = result.program.ofKind('ui.List')[0]! as unknown as Record<string, unknown>;

    expect(lifted['key']).toEqual(key);
    expect(lifted['id']).toBe('l');
    expect(result.diagnostics).toEqual([]);
  });

  it('NEVER infers a key from position — a keyless list stays keyless, and says so', () => {
    // An index-derived key is worse than no key: it looks like an identity and is not, so it silences
    // the generator's own fallback warning while providing none of the safety.
    const program = Program.of([list('l', tile('t'))]);

    const result = manager().run(program, options);

    expect((result.program.ofKind('ui.List')[0] as unknown as Record<string, unknown>)['key']).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2114']);
  });

  it('a list that already has a key is untouched — the author said what identity is', () => {
    const key = { id: 'k', kind: 'bind.Const', span, value: 'x' };
    const program = Program.of([list('l', tile('t'), key)]);

    expect(manager().run(program, options).program).toBe(program);
  });

  it('is a fixed point', () => {
    const key = { id: 'k', kind: 'bind.Const', span, value: 'x' };
    const program = Program.of([list('l', tile('t', key))]);

    const once = manager().run(program, options);
    const twice = manager().run(once.program, options);

    expect(twice.program.toNdjson()).toBe(once.program.toNdjson());
    expect(twice.program).toBe(once.program);
  });
});

// ── N10 ───────────────────────────────────────────────────────────────────────────────────────────

function token(id: string, name: string, light: string, role?: string): AnyUirNode {
  return { id, kind: 'app.Token', span, group: 'color', name, light, ...(role ? { role } : {}) } as unknown as AnyUirNode;
}

describe('N10 — theme tokenize', () => {
  const manager = () => new PassManager([new N10ThemeTokenize()]);

  it('derives the full Material role set from a seed, light and dark', () => {
    const result = manager().run(Program.of([token('s', 'seed', '#FF6750A4')]), options);
    const tokens = result.program.ofKind('app.Token');

    // 46 roles + the seed itself.
    expect(tokens).toHaveLength(47);

    const primary = tokens.find((t) => t.name === 'primary')!;
    expect(primary.role).toBe('primary');
    expect(primary.light).toMatch(/^#[0-9A-F]{6,8}$/);
    expect(primary.dark).toMatch(/^#[0-9A-F]{6,8}$/);
    expect(primary.light).not.toBe(primary.dark);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2115']);
  });

  it('NEVER overwrites a role the author wrote', () => {
    // An explicit `ColorScheme(primary: …)` is the author saying what primary is. A derived value
    // replacing it would be the compiler overruling them, silently.
    const result = manager().run(
      Program.of([token('s', 'seed', '#FF6750A4'), token('p', 'primary', '#FFAABBCC', 'primary')]),
      options,
    );

    const primaries = result.program.ofKind('app.Token').filter((t) => t.role === 'primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.light).toBe('#FFAABBCC');
  });

  it('derives nothing without a seed', () => {
    const program = Program.of([token('p', 'primaryColor', '#FF112233')]);

    expect(manager().run(program, options).program).toBe(program);
  });

  it('is deterministic and a fixed point', () => {
    const source = () => Program.of([token('s', 'seed', '#FF6750A4')]);

    const a = manager().run(source(), options);
    const b = manager().run(source(), options);
    expect(a.program.toNdjson()).toBe(b.program.toNdjson());

    const twice = manager().run(a.program, options);
    expect(twice.program.toNdjson()).toBe(a.program.toNdjson());
  });
});

// ── N11 ───────────────────────────────────────────────────────────────────────────────────────────

function signal(id: string, scope = 'component'): AnyUirNode {
  return { id, kind: 'sig.Signal', span, scope, type: { name: 'bool' } } as unknown as AnyUirNode;
}

function action(id: string, writes: string[]): AnyUirNode {
  return { id, kind: 'sig.Action', span, writes, body: [] } as unknown as AnyUirNode;
}

/** An action whose own body is given explicitly (M8-R: dependency-closure checks read it). */
function actionWithBody(id: string, writes: string[], body: Record<string, unknown>[]): AnyUirNode {
  return { id, kind: 'sig.Action', span, writes, body } as unknown as AnyUirNode;
}

/** A targeted (or untargeted) reference inside an action body. */
function bodyRef(id: string, name: string, target?: string): Record<string, unknown> {
  return { id, kind: 'logic.Ref', span, name, type: { name: 'int' }, ...(target ? { target } : {}) };
}

/** `<callee>()` as a statement. */
function callStmt(id: string, callee: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.ExprStmt', span, expr: { id: `${id}-c`, kind: 'logic.Call', span, callee, args: [] } };
}

/** `<target> = <value>` as a statement. */
function assignStmt(id: string, target: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'logic.Assign', span, target, operator: 'assign', type: { name: 'int' }, value };
}

function route(id: string, path: string, component: string): AnyUirNode {
  return { id, kind: 'app.Route', span, path, component } as unknown as AnyUirNode;
}

function transition(id: string, target: string, args: Record<string, unknown>[]): AnyUirNode {
  return { id, kind: 'app.RouteTransition', span, target, arguments: args } as unknown as AnyUirNode;
}

function arg(name: string, binding: Record<string, unknown>): Record<string, unknown> {
  return { name, transport: 'primitive', binding };
}

/** A route that also carries constructor arguments (M7-E3: `app.Route.arguments`). */
function routeWithArgs(id: string, path: string, component: string, args: Record<string, unknown>[]): AnyUirNode {
  return { id, kind: 'app.Route', span, path, component, arguments: args } as unknown as AnyUirNode;
}

/** An imperative transition constructing its destination inline (`component`, not `target`). */
function inlineTransition(
  id: string,
  source: string,
  component: string,
  args: Record<string, unknown>[],
): AnyUirNode {
  return { id, kind: 'app.RouteTransition', span, source, component, arguments: args } as unknown as AnyUirNode;
}

/** A `ui.Component` with the given required params and render tree. */
function component(id: string, name: string, paramNames: readonly string[], render: unknown): AnyUirNode {
  return {
    id,
    kind: 'ui.Component',
    span,
    name,
    ...(paramNames.length > 0
      ? { params: paramNames.map((n) => ({ name: n, required: true, type: { name: 'Object' } })) }
      : {}),
    render,
  } as unknown as AnyUirNode;
}

/** A direct read of the component's own constructor parameter, at `where` in its render tree. */
function bindParam(id: string, name: string): Record<string, unknown> {
  return { id, kind: 'bind.Param', span, param: name };
}

/** A minimal widget-tree leaf embedding one binding, so `bindParam` sits inside something realistic. */
function leaf(id: string, binding: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: 'ui.Element', span, component: { name: 'Text', userDefined: false }, props: { data: binding } };
}

describe('N11 — promote cross-route state (ADR-11)', () => {
  const manager = () => new PassManager([new N5LiftClosures(), new N11PromoteCrossRouteState()]);

  it('promotes a callback crossing a route boundary into a store — the onToggleTheme case', () => {
    const program = Program.of([
      signal('sigDark'),
      action('actToggle', ['sigDark']),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onToggleTheme', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'a', target: 'actToggle', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    const store = result.program.ofKind('app.Store')[0]!;
    expect(store.origin).toBe('promoted');
    expect(store.signals).toEqual(['sigDark']);
    expect(store.actions).toEqual(['actToggle']);

    // The signal moved, and kept its id: it is the same signal, in a different place.
    const promoted = result.program.get('sigDark') as unknown as Record<string, unknown>;
    expect(promoted['scope']).toBe('store');
    expect(promoted['store']).toBe(store.id);

    // INV-18: after N11, no argument in a route transition may be of function type.
    const t = result.program.get('t1') as unknown as Record<string, unknown>;
    expect(t['arguments']).toBeUndefined();

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
  });

  it('promotes a component-scoped signal read across a boundary — the isDark case', () => {
    const program = Program.of([
      signal('sigDark'),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [arg('isDark', { id: 'b', kind: 'bind.Signal', span, signal: 'sigDark' })]),
    ]);

    const result = manager().run(program, options);

    expect(result.program.ofKind('app.Store')[0]!.origin).toBe('promoted');
    expect((result.program.get('sigDark') as unknown as Record<string, unknown>)['scope']).toBe('store');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
  });

  it('a live object across a boundary is BRG2301 — a URL carries an id, not an object graph', () => {
    const program = Program.of([
      route('r1', '/detail', 'compDetail'),
      transition('t1', 'r1', [
        arg('product', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.New', span, typeName: 'Product', type: { name: 'Product' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2301']);
    expect(result.diagnostics[0]!.severity).toBe('error');
    expect(result.program.ofKind('app.Store')).toEqual([]);
  });

  it('an unpromotable callback is BRG2303 — never dropped, never guessed', () => {
    const program = Program.of([
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onTap', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Lambda', span, body: [], type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2303']);
    expect(result.diagnostics[0]!.severity).toBe('error');
  });

  // ── M8-R: an action's own dependency closure, not just what it writes ────────────────────────────

  it('a promoted action calling another action is refused (BRG2303), naming the callee — never silently promoted, never a downstream "not declared" surprise', () => {
    const program = Program.of([
      signal('sigA'),
      action('actAnnounce', []), // writes nothing of its own — irrelevant, it is never itself promoted here
      actionWithBody('actForget', ['sigA'], [
        callStmt('s1', bodyRef('r1', 'announce', 'actAnnounce')),
        assignStmt('s2', bodyRef('r2', 'a', 'sigA'), { id: 'v', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 }),
      ]),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onForget', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'f', target: 'actForget', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2303']);
    expect(result.diagnostics[0]!.severity).toBe('error');
    expect(result.diagnostics[0]!.message).toContain('announce');
    expect(result.diagnostics[0]!.message).toContain('another action this pass does not also promote');
    expect(result.program.ofKind('app.Store')).toEqual([]);
    // INV-18 is not violated here in the misleading way: the argument is *not* stripped either, because
    // nothing was promoted — the callback stays exactly where it was, refused, not half-moved.
    expect((result.program.get('t1') as unknown as Record<string, unknown>)['arguments']).toBeDefined();
  });

  it('a promoted action reading a component-scoped signal it never writes is refused (BRG2303), naming the read', () => {
    const program = Program.of([
      signal('sigWrite'),
      signal('sigRead'), // component-scoped, never written by actForget — the `_env` shape
      actionWithBody('actForget', ['sigWrite'], [
        callStmt('s1', bodyRef('r1', 'read', 'sigRead')), // a read, wrapped as a call is irrelevant — target is what matters
        assignStmt('s2', bodyRef('r2', 'w', 'sigWrite'), { id: 'v', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 }),
      ]),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onForget', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'f', target: 'actForget', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2303']);
    expect(result.diagnostics[0]!.message).toContain('read');
    expect(result.diagnostics[0]!.message).toContain('component-scoped signal it does not write');
    expect(result.program.ofKind('app.Store')).toEqual([]);
  });

  it('a promoted action reading an *already store-scoped* signal is unaffected — global state needs no promotion', () => {
    const program = Program.of([
      signal('sigWrite'),
      signal('sigGlobal', 'store'), // already outlives any one component
      actionWithBody('actForget', ['sigWrite'], [
        callStmt('s1', bodyRef('r1', 'read', 'sigGlobal')),
        assignStmt('s2', bodyRef('r2', 'w', 'sigWrite'), { id: 'v', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 }),
      ]),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onForget', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'f', target: 'actForget', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
    expect(result.program.ofKind('app.Store')).toHaveLength(1);
    expect(result.program.ofKind('app.Store')[0]!.actions).toEqual(['actForget']);
  });

  it("a self-call (recursion) is not treated as an unowned dependency", () => {
    const program = Program.of([
      signal('sigA'),
      actionWithBody('actLoop', ['sigA'], [
        callStmt('s1', bodyRef('r1', 'loop', 'actLoop')), // calls itself
        assignStmt('s2', bodyRef('r2', 'a', 'sigA'), { id: 'v', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 }),
      ]),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onLoop', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'f', target: 'actLoop', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
    expect(result.program.ofKind('app.Store')).toHaveLength(1);
  });

  it('an untargeted reference inside the body (a local, a parameter) is never guessed at by name — not this pass\' concern', () => {
    const program = Program.of([
      signal('sigA'),
      actionWithBody('actForget', ['sigA'], [
        // `total` has no `target` — a local or parameter ADR-28/N5 own, not N11. Same name as nothing
        // in this program; must never be name-matched against `sigA`/an action to manufacture a refusal.
        callStmt('s1', bodyRef('r1', 'total')),
        assignStmt('s2', bodyRef('r2', 'a', 'sigA'), { id: 'v', kind: 'logic.Lit', span, type: { name: 'int' }, value: 1 }),
      ]),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [
        arg('onForget', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'f', target: 'actForget', type: { name: 'Function' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
    expect(result.program.ofKind('app.Store')).toHaveLength(1);
  });

  it('a primitive crosses a URL boundary fine, and is left alone', () => {
    const program = Program.of([
      route('r1', '/detail', 'compDetail'),
      transition('t1', 'r1', [arg('id', { id: 'b', kind: 'bind.Const', span, value: 7 })]),
    ]);

    const result = manager().run(program, options);

    expect(result.program).toBe(program);
    expect(result.diagnostics).toEqual([]);
  });

  it('a store-scoped signal already outlives its component — nothing to promote', () => {
    const program = Program.of([
      signal('sigX', 'store'),
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [arg('x', { id: 'b', kind: 'bind.Signal', span, signal: 'sigX' })]),
    ]);

    expect(manager().run(program, options).program).toBe(program);
  });

  it('a program with no transitions is returned untouched', () => {
    const program = Program.of([signal('s'), route('r1', '/', 'c')]);

    expect(manager().run(program, options).program).toBe(program);
  });

  it('is deterministic and a fixed point', () => {
    const source = () =>
      Program.of([
        signal('sigDark'),
        action('actToggle', ['sigDark']),
        route('r1', '/home', 'compHome'),
        transition('t1', 'r1', [
          arg('onToggleTheme', {
            id: 'b',
            kind: 'bind.Expr',
            span,
            expr: { id: 'e', kind: 'logic.Ref', span, name: 'a', target: 'actToggle', type: { name: 'Function' } },
          }),
        ]),
      ]);

    const a = manager().run(source(), options);
    const b = manager().run(source(), options);
    expect(a.program.toNdjson()).toBe(b.program.toNdjson());

    const twice = manager().run(a.program, options);
    expect(twice.program.toNdjson()).toBe(a.program.toNdjson());
  });
});

describe('the nav-graph analysis', () => {
  it('is computed from the program, and its transitions are sorted', () => {
    const graph = navGraph(
      Program.of([
        route('r1', '/a', 'c1'),
        transition('tz', 'r1', []),
        transition('ta', 'r1', []),
      ]),
    );

    expect(graph.hasRoutes).toBe(true);
    expect(graph.componentOf.get('r1')).toBe('c1');
    expect(graph.transitions.map((t) => t.id)).toEqual(['ta', 'tz']);
  });

  it('unifies a declarative route and an imperative transition as boundaries (M7-E3)', () => {
    const graph = navGraph(
      Program.of([
        routeWithArgs('r1', '/a', 'c1', [arg('x', { id: 'b', kind: 'bind.Const', span, value: 1 })]),
        transition('t1', 'r1', [arg('y', { id: 'b2', kind: 'bind.Const', span, value: 2 })]),
      ]),
    );

    expect(graph.boundaries.map((b) => b.id)).toEqual(['r1', 't1']);
    const routeBoundary = graph.boundaries.find((b) => b.id === 'r1')!;
    expect(routeBoundary.kind).toBe('route');
    expect(routeBoundary.component).toBe('c1');
    expect(routeBoundary.source).toBeUndefined();
    expect(routeBoundary.arguments.map((a) => a.name)).toEqual(['x']);

    const transitionBoundary = graph.boundaries.find((b) => b.id === 't1')!;
    expect(transitionBoundary.kind).toBe('transition');
    // `t1` names route `r1` as `target`, resolved through `componentOf` to `c1` — the same destination.
    expect(transitionBoundary.component).toBe('c1');

    expect(graph.boundariesByComponent.get('c1')!.map((b) => b.id)).toEqual(['r1', 't1']);
  });

  it('resolves an inline-pushed destination by its own `component` field, not `target`', () => {
    const graph = navGraph(
      Program.of([
        inlineTransition('t1', 'src', 'compInline', [arg('x', { id: 'b', kind: 'bind.Const', span, value: 1 })]),
      ]),
    );

    const boundary = graph.boundaries[0]!;
    expect(boundary.component).toBe('compInline');
    expect(boundary.source).toBe('src');
  });

  it('includes an argument-free route or transition too — a reaching caller that supplies nothing is still a reaching caller', () => {
    const graph = navGraph(Program.of([route('r1', '/a', 'c1'), transition('t1', 'r1', [])]));
    expect(graph.boundaries.map((b) => b.id)).toEqual(['r1', 't1']);
    expect(graph.boundaries.every((b) => b.arguments.length === 0)).toBe(true);
    expect(graph.boundariesByComponent.get('c1')!.map((b) => b.id)).toEqual(['r1', 't1']);
  });
});

// ── N11 — component-interface promotion (M7-E3, ADR-11 amendment) ──────────────────────────────────

describe('N11 — component-interface promotion (M7-E3, ADR-11 amendment)', () => {
  const manager = () => new PassManager([new N5LiftClosures(), new N11PromoteCrossRouteState()]);

  it('promotes a declarative route argument, removes the param, and rewrites the internal read — the signal case', () => {
    const comp = component('compHome', 'Home', ['isDark'], leaf('leaf1', bindParam('bp1', 'isDark')));
    const program = Program.of([
      signal('sigDark'),
      comp,
      routeWithArgs('r1', '/home', 'compHome', [arg('isDark', { id: 'b', kind: 'bind.Signal', span, signal: 'sigDark' })]),
    ]);

    const result = manager().run(program, options);

    // The route argument is gone.
    const r = result.program.get('r1') as unknown as Record<string, unknown>;
    expect(r['arguments']).toBeUndefined();

    // The param is gone from the component's declared interface.
    const rewritten = result.program.get('compHome') as unknown as Record<string, unknown>;
    expect(rewritten['params']).toBeUndefined();

    // The component's id is unchanged — it is a declaration, not content-addressed (ADR-17 ISSUE-6).
    expect(rewritten['id']).toBe(comp.id);

    // The internal read now points at the promoted store directly.
    const render = rewritten['render'] as Record<string, unknown>;
    const binding = (render['props'] as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(binding['kind']).toBe('bind.Signal');
    expect(binding['signal']).toBe('sigDark');
    expect(result.program.ofKind('app.Store')).toHaveLength(1);

    expect(result.diagnostics.map((d) => d.code).sort()).toEqual(['BRG2302', 'BRG2304']);
  });

  it('promotes a declarative route argument, removes the param, and rewrites the internal read — the action/callback case', () => {
    const comp = component('compHome', 'Home', ['onTap'], leaf('leaf1', bindParam('bp1', 'onTap')));
    const program = Program.of([
      signal('sigDark'),
      action('actToggle', ['sigDark']),
      comp,
      routeWithArgs('r1', '/home', 'compHome', [
        arg('onTap', {
          id: 'b',
          kind: 'bind.Expr',
          span,
          expr: { id: 'e', kind: 'logic.Ref', span, name: 'toggle', target: 'actToggle', type: { name: 'void Function()' } },
        }),
      ]),
    ]);

    const result = manager().run(program, options);

    const rewritten = result.program.get('compHome') as unknown as Record<string, unknown>;
    expect(rewritten['id']).toBe(comp.id);
    expect(rewritten['params']).toBeUndefined();

    const render = rewritten['render'] as Record<string, unknown>;
    const binding = (render['props'] as Record<string, unknown>)['data'] as Record<string, unknown>;
    expect(binding['kind']).toBe('bind.Expr');
    const ref = binding['expr'] as Record<string, unknown>;
    expect(ref['kind']).toBe('logic.Ref');
    expect(ref['target']).toBe('actToggle');
    // The reused reference keeps the type the program actually stated — nothing here invents one.
    expect(ref['type']).toEqual({ name: 'void Function()' });

    expect(result.diagnostics.map((d) => d.code).sort()).toEqual(['BRG2302', 'BRG2304']);
  });

  it('two callers promoting the same signal reach consensus and both are stripped', () => {
    const comp = component('compScreen', 'Screen', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigCount'),
      comp,
      routeWithArgs('r1', '/a', 'compScreen', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' })]),
      routeWithArgs('r2', '/b', 'compScreen', [arg('count', { id: 'b2', kind: 'bind.Signal', span, signal: 'sigCount' })]),
    ]);

    const result = manager().run(program, options);

    expect((result.program.get('r1') as unknown as Record<string, unknown>)['arguments']).toBeUndefined();
    expect((result.program.get('r2') as unknown as Record<string, unknown>)['arguments']).toBeUndefined();
    expect((result.program.get('compScreen') as unknown as Record<string, unknown>)['params']).toBeUndefined();
    expect(result.program.ofKind('app.Store')).toHaveLength(1);
  });

  it('one caller supplying a plain primitive blocks removal — consensus, not first-caller-wins', () => {
    const comp = component('compScreen', 'Screen', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigCount'),
      comp,
      routeWithArgs('r1', '/a', 'compScreen', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' })]),
      routeWithArgs('r2', '/b', 'compScreen', [arg('count', { id: 'b2', kind: 'bind.Const', span, value: 3 })]),
    ]);

    const result = manager().run(program, options);

    // Neither boundary's argument is touched — not even `r1`'s, which was individually promotable.
    expect((result.program.get('r1') as unknown as Record<string, unknown>)['arguments']).toEqual([
      arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' }),
    ]);
    expect((result.program.get('r2') as unknown as Record<string, unknown>)['arguments']).toEqual([
      arg('count', { id: 'b2', kind: 'bind.Const', span, value: 3 }),
    ]);
    expect((result.program.get('compScreen') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
    expect(result.program.ofKind('app.Store')).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2306']);
  });

  it('a caller that omits the argument entirely blocks removal', () => {
    const comp = component('compScreen', 'Screen', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigCount'),
      comp,
      routeWithArgs('r1', '/a', 'compScreen', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' })]),
      routeWithArgs('r2', '/b', 'compScreen', []),
    ]);

    const result = manager().run(program, options);

    expect((result.program.get('r1') as unknown as Record<string, unknown>)['arguments']).toEqual([
      arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' }),
    ]);
    expect((result.program.get('compScreen') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2306']);
  });

  it('two callers promoting two different signals blocks removal', () => {
    const comp = component('compScreen', 'Screen', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigA'),
      signal('sigB'),
      comp,
      routeWithArgs('r1', '/a', 'compScreen', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigA' })]),
      routeWithArgs('r2', '/b', 'compScreen', [arg('count', { id: 'b2', kind: 'bind.Signal', span, signal: 'sigB' })]),
    ]);

    const result = manager().run(program, options);

    expect((result.program.get('compScreen') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2306']);
  });

  it('a component that only forwards the value onward is not rewritten — the LoginScreen/HomeScreen shape', () => {
    // `Middle` receives a promotable signal from exactly one route (unanimous consensus), but forwards
    // it — by an untargeted reference, since a `ParamDecl` has no id — into a further push it cannot
    // promote. Removing `Middle`'s param would orphan that forward.
    const comp = component('compMiddle', 'Middle', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigCount'),
      comp,
      routeWithArgs('r1', '/a', 'compMiddle', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' })]),
      inlineTransition('t1', 'compMiddle', 'compNext', [
        arg('count', { id: 'b2', kind: 'bind.Expr', span, expr: { id: 'e', kind: 'logic.Ref', span, name: 'count' } }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect((result.program.get('r1') as unknown as Record<string, unknown>)['arguments']).toEqual([
      arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' }),
    ]);
    expect((result.program.get('compMiddle') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
    expect(result.program.ofKind('app.Store')).toEqual([]);
    // Once for the transition's own unprovable forward, once for the component blocked from removing it.
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2305', 'BRG2305']);
  });

  it('a `bind.Param` argument binding is the same forwarded shape as an untargeted `logic.Ref`', () => {
    const program = Program.of([
      route('r1', '/home', 'compHome'),
      transition('t1', 'r1', [arg('x', bindParam('b1', 'x'))]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2305']);
    expect(result.program.ofKind('app.Store')).toEqual([]);
  });

  it('a route/transition naming a component this program does not declare promotes on its own evidence — no interface to protect', () => {
    const program = Program.of([
      signal('sigDark'),
      route('r1', '/home', 'compHome'), // no `ui.Component` for `compHome`
      transition('t1', 'r1', [arg('isDark', { id: 'b', kind: 'bind.Signal', span, signal: 'sigDark' })]),
    ]);

    const result = manager().run(program, options);

    expect((result.program.get('t1') as unknown as Record<string, unknown>)['arguments']).toBeUndefined();
    expect(result.program.ofKind('app.Store')).toHaveLength(1);
    // No BRG2304: nothing was rewritten, because there was no component to rewrite.
    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2302']);
  });

  it('an unrelated param on the same component survives untouched', () => {
    const comp = component('compScreen', 'Screen', ['count', 'label'], leaf('leaf1', bindParam('bp1', 'count')));
    const program = Program.of([
      signal('sigCount'),
      comp,
      routeWithArgs('r1', '/a', 'compScreen', [
        arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' }),
        arg('label', { id: 'b2', kind: 'bind.Const', span, value: 'hi' }),
      ]),
    ]);

    const result = manager().run(program, options);

    const rewrittenComp = result.program.get('compScreen') as unknown as Record<string, unknown>;
    const params = rewrittenComp['params'] as Record<string, unknown>[];
    expect(params.map((p) => p['name'])).toEqual(['label']);

    const rewrittenRoute = result.program.get('r1') as unknown as Record<string, unknown>;
    expect((rewrittenRoute['arguments'] as Record<string, unknown>[]).map((a) => a['name'])).toEqual(['label']);
  });

  it('a live object is refused (BRG2301) even with a real destination component in scope', () => {
    const comp = component('compDetail', 'Detail', ['product'], leaf('leaf1', bindParam('bp1', 'product')));
    const program = Program.of([
      comp,
      routeWithArgs('r1', '/detail', 'compDetail', [
        arg('product', { id: 'b', kind: 'bind.Expr', span, expr: { id: 'e', kind: 'logic.New', span, typeName: 'Product', type: { name: 'Product' } } }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2301']);
    expect((result.program.get('compDetail') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
  });

  it('an unpromotable callback is refused (BRG2303) even with a real destination component in scope', () => {
    const comp = component('compHome', 'Home', ['onTap'], leaf('leaf1', bindParam('bp1', 'onTap')));
    const program = Program.of([
      comp,
      routeWithArgs('r1', '/home', 'compHome', [
        arg('onTap', { id: 'b', kind: 'bind.Expr', span, expr: { id: 'e', kind: 'logic.Lambda', span, body: [], type: { name: 'Function' } } }),
      ]),
    ]);

    const result = manager().run(program, options);

    expect(result.diagnostics.map((d) => d.code)).toEqual(['BRG2303']);
    expect((result.program.get('compHome') as unknown as Record<string, unknown>)['params']).toEqual(
      (comp as unknown as Record<string, unknown>)['params'],
    );
  });

  it("the component's own id is stable across the rewrite — declarations are symbol-addressed, not content-addressed (ADR-17)", () => {
    const comp = component('compHome', 'Home', ['isDark'], leaf('leaf1', bindParam('bp1', 'isDark')));
    const program = Program.of([
      signal('sigDark'),
      comp,
      routeWithArgs('r1', '/home', 'compHome', [arg('isDark', { id: 'b', kind: 'bind.Signal', span, signal: 'sigDark' })]),
    ]);

    const result = manager().run(program, options);
    const rewritten = result.program.get('compHome')!;

    expect(rewritten.id).toBe(comp.id);
    expect(rewritten.id).toBe('compHome');
  });

  it('is deterministic and a fixed point for interface promotion, and caller order does not affect the result', () => {
    const comp = component('compScreen', 'Screen', ['count'], leaf('leaf1', bindParam('bp1', 'count')));
    const forward = () =>
      Program.of([
        signal('sigCount'),
        comp,
        routeWithArgs('r1', '/a', 'compScreen', [arg('count', { id: 'b1', kind: 'bind.Signal', span, signal: 'sigCount' })]),
        routeWithArgs('r2', '/b', 'compScreen', [arg('count', { id: 'b2', kind: 'bind.Signal', span, signal: 'sigCount' })]),
      ]);
    const backward = () =>
      Program.of(
        [...forward().nodes].reverse(),
      );

    const a = manager().run(forward(), options);
    const b = manager().run(backward(), options);
    expect(a.program.toNdjson()).toBe(b.program.toNdjson());

    const twice = manager().run(a.program, options);
    expect(twice.program.toNdjson()).toBe(a.program.toNdjson());
    // A fixed point promotes nothing a second time: one store, not two; no repeated BRG2302/BRG2304.
    expect(twice.program.ofKind('app.Store')).toHaveLength(1);
    expect(twice.diagnostics).toEqual([]);
  });
});
