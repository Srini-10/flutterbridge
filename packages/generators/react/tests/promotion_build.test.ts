import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  parseNdjson,
  promotedCounterRaw,
  typecheckEmitted,
} from './support.js';

// The M7-F build-proof — single-hop promotion, isolated from `hello_bridge`'s multi-hop forwarding.
//
// `fixtures/apps/promoted_counter` exists for exactly one reason: `hello_bridge`'s own declarative route
// (`LoginScreen`) receives `isDark`/`onToggleTheme` but never reads either — it only forwards both into
// `HomeScreen`, which is precisely the shape M7-E3 scoped single-hop promotion to exclude. Forcing
// `hello_bridge` to demonstrate a successful promotion would mean weakening that exclusion or picking a
// route it does not actually have. This fixture's `CounterScreen`, unlike `LoginScreen`, genuinely reads
// `count` and calls `onIncrement` itself — the one structural difference that makes it promotable.
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` — no hand-authored
// UIR anywhere, matching `build.test.ts`'s own standard (M3-D) and the M7-F task's explicit requirement.

afterAll(cleanupBuildProofTemporaries);

const before = parseNdjson(promotedCounterRaw());
const after = compiledFrom(promotedCounterRaw());

function findRoute(nodes: readonly unknown[]): Record<string, unknown> {
  const route = (nodes as unknown as Record<string, unknown>[]).find((n) => n['kind'] === 'app.Route');
  if (route === undefined) throw new Error('no app.Route in the fixture');
  return route;
}

function findComponent(nodes: readonly unknown[], name: string): Record<string, unknown> {
  const component = (nodes as unknown as Record<string, unknown>[]).find(
    (n) => n['kind'] === 'ui.Component' && n['name'] === name,
  );
  if (component === undefined) throw new Error(`no ui.Component named ${name}`);
  return component;
}

describe('M7-F build-proof: single-hop promotion, real analyzer to real tsc', () => {
  it('the route argument existed before N11', () => {
    const route = findRoute(before);
    const args = (route['arguments'] as Record<string, unknown>[] | undefined) ?? [];
    expect(args.map((a) => a['name']).sort()).toEqual(['count', 'onIncrement']);
  });

  it('the destination component declared both params before N11', () => {
    const screen = findComponent(before, 'CounterScreen');
    const params = (screen['params'] as Record<string, unknown>[] | undefined) ?? [];
    expect(params.map((p) => p['name']).sort()).toEqual(['count', 'onIncrement']);
    expect(params.every((p) => p['required'] === true)).toBe(true);
  });

  it('N11 promoted both — the route argument disappeared', () => {
    const route = findRoute(after);
    expect(route['arguments']).toBeUndefined();
  });

  it('N11 removed both params from the destination component', () => {
    const screen = findComponent(after, 'CounterScreen');
    expect(screen['params']).toBeUndefined();
  });

  it('exactly one promoted store exists, holding the signal and the action', () => {
    const stores = (after as unknown as Record<string, unknown>[]).filter((n) => n['kind'] === 'app.Store');
    expect(stores).toHaveLength(1);
    expect(stores[0]!['origin']).toBe('promoted');
    expect((stores[0]!['signals'] as string[]).length).toBe(1);
    expect((stores[0]!['actions'] as string[]).length).toBe(1);
  });

  it('the generator reports no error, and the component consumes the store directly', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const source = fileAt(files, 'src/components/counter-screen.tsx') ?? '';
    expect(source).not.toBe('');

    // Consumes the store — `useStore` + a subscribed `useSignal`, hoisted, not conditional.
    expect(source).toMatch(/const \w+ = useStore\(promotedStoreStore\);/);
    expect(source).toMatch(/const \w+\$ = useSignal\(\w+\._count\);/);

    // No unresolved original prop anywhere in the output: neither a component signature carrying
    // `count`/`onIncrement`, nor a dangling reference to either name unresolved by the rewrite.
    expect(source).not.toMatch(/function CounterScreen\([^)]*count/);
    expect(source).not.toMatch(/function CounterScreen\([^)]*onIncrement/);
    expect(source).not.toContain('CounterScreenProps');

    // Both call sites reference the promoted action directly.
    expect(source.match(/onPressed=\{\w+\._increment\}/g)?.length).toBe(2);
  });

  it('Flutter → analyzer → compiler (promotion) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
