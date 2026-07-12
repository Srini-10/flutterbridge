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

function route(id: string, path: string, component: string): AnyUirNode {
  return { id, kind: 'app.Route', span, path, component } as unknown as AnyUirNode;
}

function transition(id: string, target: string, args: Record<string, unknown>[]): AnyUirNode {
  return { id, kind: 'app.RouteTransition', span, target, arguments: args } as unknown as AnyUirNode;
}

function arg(name: string, binding: Record<string, unknown>): Record<string, unknown> {
  return { name, transport: 'primitive', binding };
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
});
