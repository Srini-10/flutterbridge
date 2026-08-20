import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  asyncPushGuardRaw,
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  parseNdjson,
  typecheckEmitted,
} from './support.js';

// The M7-H/M7-J build-proof — an awaited `Navigator.push`, reached only after a `mounted` guard, inside
// a named async method referenced by tear-off (`onPressed: _isSubmitting ? null : _submit`) rather than
// written inline — `hello_bridge/lib/screens/login_screen.dart`'s own shape, isolated from its 27 other,
// unrelated blockers (missing theme tokens, opaque `Duration`/`Future` classes, `ui.Async` branches,
// `themeMode`, multi-hop forwarding). See `docs/m7/m7h-async-navigation-extraction.md` and
// `docs/m7/m7j-mounted-lifecycle-implementation.md`.
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` — no
// hand-authored UIR anywhere, matching every other build-proof in this suite.
//
// M7-H got this fixture to the generator with every diagnostic except `mounted`'s own resolved
// (`BRG3006`, "not declared in this program") — `mounted` reached the generator as an ordinary
// `logic.Ref`, indistinguishable in shape from a genuine unresolved reference, because nothing carried
// its resolved-element identity past extraction. ADR-0026 closes that: `mounted`/`context.mounted` are
// recognized by resolved element in the analyzer (never by spelling) and lowered to `logic.Intrinsic`,
// a framework-neutral fact the generator turns into `@bridge/runtime-react`'s `useMounted()`. This file
// is the fixture that gap left waiting for exactly that — it now reaches a clean `tsc` build.

afterAll(cleanupBuildProofTemporaries);

const before = parseNdjson(asyncPushGuardRaw());
const after = compiledFrom(asyncPushGuardRaw());

function findTransition(nodes: readonly unknown[]): Record<string, unknown> {
  const found = (nodes as unknown as Record<string, unknown>[]).find((n) => n['kind'] === 'app.RouteTransition');
  if (found === undefined) throw new Error('no app.RouteTransition in the fixture');
  return found;
}

/** The `logic.Navigate` whose `action` is `wantedAction` — `DetailScreen`'s own "Go back" (`pop`) is a
 * second one in this fixture, so presence alone is not enough to pick the awaited push out. */
function findNavigate(nodes: readonly unknown[], wantedAction: string): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node['kind'] === 'logic.Navigate' && node['action'] === wantedAction) found = node;
    for (const child of Object.values(node)) walk(child);
  };
  for (const node of nodes) walk(node);
  if (found === undefined) throw new Error(`no logic.Navigate{action: '${wantedAction}'} in the fixture`);
  return found;
}

function findIntrinsic(nodes: readonly unknown[]): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node['kind'] === 'logic.Intrinsic') found = node;
    for (const child of Object.values(node)) walk(child);
  };
  for (const node of nodes) walk(node);
  if (found === undefined) throw new Error('no logic.Intrinsic in the fixture');
  return found;
}

function findComponent(nodes: readonly unknown[], name: string): Record<string, unknown> {
  const component = (nodes as unknown as Record<string, unknown>[]).find(
    (n) => n['kind'] === 'ui.Component' && n['name'] === name,
  );
  if (component === undefined) throw new Error(`no ui.Component named ${name}`);
  return component;
}

describe('M7-H/M7-J build-proof: an awaited, mounted-guarded push, real analyzer to real tsc', () => {
  it('the transition carries all three arguments before N11, from the awaited push', () => {
    const transition = findTransition(before);
    const args = (transition['arguments'] as Record<string, unknown>[] | undefined) ?? [];
    expect(args.map((a) => a['name']).sort()).toEqual(['count', 'onIncrement', 'title']);
  });

  it('the destination component declared all three params before N11', () => {
    const screen = findComponent(before, 'DetailScreen');
    const params = (screen['params'] as Record<string, unknown>[] | undefined) ?? [];
    expect(params.map((p) => p['name']).sort()).toEqual(['count', 'onIncrement', 'title']);
  });

  it('the push is performed: logic.Navigate names the exact transition it departs on', () => {
    const navigate = findNavigate(before, 'push');
    const transition = findTransition(before);
    // Equality, not presence (M7-B/M7-H's own requirement) — an assertion on presence alone would pass
    // against a node pointing at the wrong edge.
    expect(navigate['action']).toBe('push');
    expect(navigate['transition']).toBe(transition['id']);
  });

  it("DetailScreen's own Go-back button pops, carrying no transition (§A17.3)", () => {
    const pop = findNavigate(before, 'pop');
    expect(pop['transition']).toBeUndefined();
  });

  it('mounted is a framework-neutral logic.Intrinsic, not a bare unresolved reference (ADR-0026)', () => {
    const intrinsic = findIntrinsic(before);
    expect(intrinsic['intrinsic']).toBe('componentMounted');
    // Nullary — no context value to name. A stray `operand` here would mean the analyzer confused
    // `State.mounted` with `BuildContext.mounted`.
    expect(intrinsic['operand']).toBeUndefined();
  });

  it('N11 promoted the signal and the action, leaving the constant alone', () => {
    const transition = findTransition(after);
    const args = (transition['arguments'] as Record<string, unknown>[] | undefined) ?? [];
    expect(args.map((a) => a['name'])).toEqual(['title']);

    const stores = (after as unknown as Record<string, unknown>[]).filter((n) => n['kind'] === 'app.Store');
    expect(stores).toHaveLength(1);
    expect(stores[0]!['origin']).toBe('promoted');
    expect((stores[0]!['signals'] as string[]).length).toBe(1);
    expect((stores[0]!['actions'] as string[]).length).toBe(1);
  });

  it('the generator reports no error, declares useMounted() once, and reads it live in the handler', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).not.toBe('');

    // Hoisted once, unconditionally, at component top — never inside the handler that reads it.
    expect(source.match(/const mounted = useMounted\(\);/g)?.length).toBe(1);
    // The handler reads `.current` live, after the state writes that precede the guard in source order
    // — never a value captured before them.
    expect(source).toMatch(/_isSubmitting\.set\(true\);\s*if \(\(!mounted\.current\)\) {\s*return;/);
    // The push itself is still there, after the guard, unconditionally reached once the guard passes.
    expect(source).toMatch(/router\.push\(/);
  });

  it('Flutter → analyzer (ADR-0026 recognition) → compiler (promotion) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
