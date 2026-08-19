import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  asyncPushGuardRaw,
  cleanupBuildProofTemporaries,
  compiledFrom,
  harness,
  parseNdjson,
} from './support.js';

// The M7-H build-proof — an awaited `Navigator.push`, reached only after a `mounted` guard, inside a
// named async method referenced by tear-off (`onPressed: _isSubmitting ? null : _submit`) rather than
// written inline — `hello_bridge/lib/screens/login_screen.dart`'s own shape, isolated from its 27 other,
// unrelated blockers (missing theme tokens, opaque `Duration`/`Future` classes, `ui.Async` branches,
// `themeMode`, multi-hop forwarding). See `docs/m7/m7h-async-navigation-extraction.md`.
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator — no hand-authored UIR
// anywhere, matching every other build-proof in this suite.
//
// ## Why this does not assert a clean `tsc` build
//
// `mounted` reaches the generator as an ordinary, faithfully-extracted boolean reference
// (`logic.Ref{name: 'mounted'}` under a `logic.Unary`/`logic.If`) — the analyzer's side of this is
// exhaustively proven in `dart/bridge_analyzer/test/transition_test.dart`'s `m7hAsyncNavigation` group.
// What does not exist yet is a *generator/runtime* lowering for it: React has no built-in analogue of
// `State.mounted`, and `@bridge/runtime-react` has no hook that tracks it. So the generator correctly,
// loudly refuses (`BRG3006`, "not declared in this program") rather than inventing a value — exactly the
// "never silently" discipline Phase 13 of this milestone required — and `generateProject`'s own
// architecture (`pipeline.ts`) forces `files: []` whenever *any* error is reported, so no partial output
// exists to typecheck. Implementing `mounted` itself is generator/runtime work, not extraction, and is
// this milestone's own recommended next step — not silently smuggled in here.
//
// What this file proves instead, positively: every other diagnostic this shape used to produce before
// M7-H is now **absent** — the push is `performed` (no `BRG3008`), the awaited push itself lowers (no
// "Navigator.push needs lowering" `BRG3013`), and the router is correctly declared for a *referenced*
// action rather than only an inline one (no "no router in scope" `BRG3006`). `mounted`'s own refusal is
// the *only* error left, named precisely.

afterAll(cleanupBuildProofTemporaries);

const before = parseNdjson(asyncPushGuardRaw());
const after = compiledFrom(asyncPushGuardRaw());

function findTransition(nodes: readonly unknown[]): Record<string, unknown> {
  const found = (nodes as unknown as Record<string, unknown>[]).find((n) => n['kind'] === 'app.RouteTransition');
  if (found === undefined) throw new Error('no app.RouteTransition in the fixture');
  return found;
}

function findNavigate(nodes: readonly unknown[]): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node['kind'] === 'logic.Navigate') found = node;
    for (const child of Object.values(node)) walk(child);
  };
  for (const node of nodes) walk(node);
  if (found === undefined) throw new Error('no logic.Navigate in the fixture');
  return found;
}

function findComponent(nodes: readonly unknown[], name: string): Record<string, unknown> {
  const component = (nodes as unknown as Record<string, unknown>[]).find(
    (n) => n['kind'] === 'ui.Component' && n['name'] === name,
  );
  if (component === undefined) throw new Error(`no ui.Component named ${name}`);
  return component;
}

describe('M7-H build-proof: an awaited, mounted-guarded push, real analyzer to the generator', () => {
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
    const navigate = findNavigate(before);
    const transition = findTransition(before);
    // Equality, not presence (M7-B/M7-H's own requirement) — an assertion on presence alone would pass
    // against a node pointing at the wrong edge.
    expect(navigate['action']).toBe('push');
    expect(navigate['transition']).toBe(transition['id']);
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

  it('every M7-H-relevant diagnostic is clear — only the separate, pre-existing mounted gap remains', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');

    // Absent: the push is performed, so it is routable.
    expect(errors.find((d) => d.code === 'BRG3008')).toBeUndefined();
    // Absent: the awaited push itself lowered to logic.Navigate — no generic "needs lowering" refusal.
    expect(errors.find((d) => d.message.includes('needs lowering an imperative navigation call'))).toBeUndefined();
    // Absent: the router is declared for a *referenced* action, not only ones written inline.
    expect(errors.find((d) => d.message.includes('no router in scope'))).toBeUndefined();
    // Absent: the destination's arguments all resolve — no unreachable-state refusal for this push.
    expect(errors.find((d) => d.code === 'BRG3013' && d.message.includes('the push at'))).toBeUndefined();

    // Present, exactly once, and precisely named: mounted has no generator/runtime lowering yet.
    const mountedErrors = errors.filter((d) => d.message.includes('`mounted` is not declared'));
    expect(mountedErrors).toHaveLength(1);

    // And that is the *only* substantive error — the rest of the diagnostic set is the mounted refusal
    // plus its required summary.
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3005', 'BRG3006']);
  });
});
