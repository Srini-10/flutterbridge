import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  inlinePushPropsRaw,
  parseNdjson,
  typecheckEmitted,
} from './support.js';

// The M7-G build-proof — inline `Navigator.push` destination props, isolated from `hello_bridge`'s own
// push (which the analyzer cannot lower into a `logic.Navigate` at all, because it is entangled with
// `async`/`await`/`mounted`, an unrelated extraction gap — see `docs/m7/gap-inline-push-props.md`).
//
// `fixtures/apps/inline_push_props` exists for exactly one reason: `HomeScreen` pushes `DetailScreen`
// from two *different* buttons, inline, with different constant arguments (`title`/`enabled`) and the
// same component-scoped signal/action (`count`/`onIncrement`) — the shape M7-G had to resolve without
// a first-caller-wins collapse and without a second argument-resolution algorithm alongside the one
// `app.Route` already used.
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` — no hand-authored
// UIR anywhere, matching `build.test.ts` (M3-D) and `promotion_build.test.ts` (M7-F).

afterAll(cleanupBuildProofTemporaries);

const before = parseNdjson(inlinePushPropsRaw());
const after = compiledFrom(inlinePushPropsRaw());

function findTransitions(nodes: readonly unknown[]): Record<string, unknown>[] {
  const transitions = (nodes as unknown as Record<string, unknown>[]).filter((n) => n['kind'] === 'app.RouteTransition');
  if (transitions.length !== 2) throw new Error(`expected 2 app.RouteTransition, found ${transitions.length}`);
  return transitions;
}

function findComponent(nodes: readonly unknown[], name: string): Record<string, unknown> {
  const component = (nodes as unknown as Record<string, unknown>[]).find(
    (n) => n['kind'] === 'ui.Component' && n['name'] === name,
  );
  if (component === undefined) throw new Error(`no ui.Component named ${name}`);
  return component;
}

describe('M7-G build-proof: inline push destination props, real analyzer to real tsc', () => {
  it('both transitions target the same component, each with all four arguments, before N11', () => {
    const [first, second] = findTransitions(before);
    expect(first!['component']).toBe(second!['component']);
    for (const transition of [first, second]) {
      const args = (transition!['arguments'] as Record<string, unknown>[] | undefined) ?? [];
      expect(args.map((a) => a['name']).sort()).toEqual(['count', 'enabled', 'onIncrement', 'title']);
    }
  });

  it('the destination component declared all four params before N11', () => {
    const screen = findComponent(before, 'DetailScreen');
    const params = (screen['params'] as Record<string, unknown>[] | undefined) ?? [];
    expect(params.map((p) => p['name']).sort()).toEqual(['count', 'enabled', 'onIncrement', 'title']);
    expect(params.every((p) => p['required'] === true)).toBe(true);
  });

  it('N11 promoted the signal and the action, and left the two constants alone, on both transitions', () => {
    const [first, second] = findTransitions(after);
    for (const transition of [first, second]) {
      const args = (transition!['arguments'] as Record<string, unknown>[] | undefined) ?? [];
      expect(args.map((a) => a['name']).sort()).toEqual(['enabled', 'title']);
    }
    // The two transitions remain distinct: their surviving constants differ, and neither collapsed
    // into the other's.
    const firstArgs = (first!['arguments'] as Record<string, unknown>[]).map((a) => a['name']);
    expect(firstArgs).toEqual(['title', 'enabled']);
  });

  it('N11 removed the promoted params from the destination component, keeping the two constants', () => {
    const screen = findComponent(after, 'DetailScreen');
    const params = (screen['params'] as Record<string, unknown>[] | undefined) ?? [];
    expect(params.map((p) => p['name']).sort()).toEqual(['enabled', 'title']);
  });

  it('exactly one promoted store exists, holding the signal and the action', () => {
    const stores = (after as unknown as Record<string, unknown>[]).filter((n) => n['kind'] === 'app.Store');
    expect(stores).toHaveLength(1);
    expect(stores[0]!['origin']).toBe('promoted');
    expect((stores[0]!['signals'] as string[]).length).toBe(1);
    expect((stores[0]!['actions'] as string[]).length).toBe(1);
  });

  it('the generator reports no error, and emits two distinct wrapper screens with distinct constants', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const page = fileAt(files, 'app/page.tsx') ?? '';
    expect(page).not.toBe('');

    // Two wrapper functions, not one — the first-caller-wins collapse this milestone fixed would have
    // produced only one, with the second push's arguments silently lost.
    const wrappers = page.match(/function DetailScreenRoute\d*\(\) \{\s*return <DetailScreen ([^/]*)\/>;/g) ?? [];
    expect(wrappers).toHaveLength(2);

    // Their constant props differ — "Details"/true from one push site, "Other"/false from the other —
    // and neither wrapper carries the other's values.
    expect(page).toMatch(/title=\{'Details'\} enabled=\{true\}/);
    expect(page).toMatch(/title=\{'Other'\} enabled=\{false\}/);

    // The `components` map registers both wrapper functions under two distinct keys, matching the two
    // distinct `app.RouteTransition` ids `screenKeyFor` derives them from.
    const componentsLine = page.match(/components=\{\{[^}]*\}\}/)?.[0] ?? '';
    expect(componentsLine).toContain('DetailScreenRoute,');
    expect(componentsLine).toContain('DetailScreenRoute2');

    const detail = fileAt(files, 'src/components/detail-screen.tsx') ?? '';
    expect(detail).not.toBe('');

    // `count`/`onIncrement` are promoted — neither survives as a prop. `title`/`enabled` do, since they
    // are per-push constants N11 never promotes.
    expect(detail).not.toMatch(/readonly count/);
    expect(detail).not.toMatch(/readonly onIncrement/);
    expect(detail).not.toMatch(/function DetailScreen\([^)]*count/);
    expect(detail).not.toMatch(/function DetailScreen\([^)]*onIncrement/);

    // The component consumes the store directly — hoisted, not conditional — and the button calls the
    // promoted action directly rather than a reconstructed closure.
    expect(detail).toMatch(/const \w+ = useStore\(promotedStoreStore\);/);
    expect(detail).toMatch(/const \w+\$ = useSignal\(\w+\._count\);/);
    expect(detail).toMatch(/onPressed=\{\w+\._increment\}/);

    // `title`/`enabled` remain ordinary per-push props on the component itself.
    expect(detail).toContain('readonly title: string;');
    expect(detail).toContain('readonly enabled: boolean;');
  });

  it('the two push call sites in HomeScreen key the router by the transitions\' own ids, matching the page\'s components map', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    const page = fileAt(files, 'app/page.tsx') ?? '';

    const pushed = [...home.matchAll(/component: "([0-9a-f]+)"/g)].map((m) => m[1]);
    expect(pushed).toHaveLength(2);
    expect(new Set(pushed).size).toBe(2); // distinct — no shared key

    for (const key of pushed) {
      expect(page).toContain(`"${key}":`);
    }
  });

  it('Flutter → analyzer → compiler (promotion) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
