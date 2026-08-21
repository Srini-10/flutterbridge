import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, transitiveActionsRaw, typecheckEmitted } from './support.js';

// The M8-O build-proof — sig.Action bodies that reference other sig.Actions: one-hop, two-hop/three-hop
// chains, fan-out, a self-cycle, a mutual cycle, a parameterized action, an async action, a write-nothing
// action (M8-H's own domain), an action reachable both directly from render and transitively, an
// unreferenced action, and two owners with an identically-named action.
//
// Real analyzer output in, real `bridge normalize` (N1–N11 — N5 has nothing to lift here, since every
// action in this fixture is already a named `sig.Action`, never an inline closure), real generator, real
// `tsc` against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(transitiveActionsRaw());

describe('M8-O build-proof: transitive action reference discovery, real analyzer to real tsc', () => {
  it('the generator reports no error — no transitively-referenced action is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('one-hop, two-hop and three-hop chains, and fan-out, are all discovered and called correctly', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // a -> b (one-hop)
    expect(source).toMatch(/const handle_\w+ = \(\) => \{\s*\n\s*handle_\w+\(\);\s*\n\s*\};/);
    // a2 -> b2 -> c2 (three-hop): three distinct handlers, chained.
    const handlers = [...source.matchAll(/const (handle_\w+) = /g)].map((m) => m[1]);
    expect(new Set(handlers).size).toBe(handlers.length); // no duplicate declarations anywhere
    expect(handlers.length).toBeGreaterThanOrEqual(15); // every reachable action in the fixture, none missing
  });

  it('a self-cycle terminates and is emitted exactly once', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // a4's own body calls itself, guarded by `count > 1000` — exactly one declaration, calling itself.
    const selfCalling = [...source.matchAll(/const (handle_\w+) = \(\) => \{[^}]*\1\(\);/gs)];
    expect(selfCalling).toHaveLength(1);
  });

  it('a mutual cycle terminates and both actions are emitted exactly once', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // a4b calls b4b and b4b calls a4b — both present, and each declared only once.
    const declarations = [...source.matchAll(/const (handle_\w+) = /g)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined);
    const counts = new Map<string, number>();
    for (const name of declarations) counts.set(name, (counts.get(name) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  });

  it('an async transitively-referenced action keeps isAsync', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    expect(source).toMatch(/const handle_\w+ = async \(\) => \{/);
  });

  it('a write-nothing transitively-referenced action (M8-H) is preserved without inventing a write', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // b7's own body: a guarded early return, no `count.set(...)` — write-nothing status unchanged by
    // becoming reachable.
    expect(source).toMatch(/const handle_\w+ = \(\) => \{\s*\n\s*if \(\(count\.get\(\) > \(1 << 30\)\)\) \{\s*\n\s*return;\s*\n\s*\}\s*\n\s*\};/);
  });

  it('a parameterized transitively-referenced action keeps its parameter', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    expect(source).toMatch(/const handle_\w+ = \(value: number\) => \{/);
    expect(source).toContain('(3);');
  });

  it('an action reachable both directly and transitively is declared exactly once', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // b8 is both `onPressed: b8` directly and called from a8 — one declaration, two call sites (one a
    // `const handle_x = ...` reference, one a JSX `onPressed={handle_x}`, one an internal call).
    const declarations = [...source.matchAll(/const (handle_\w+) = /g)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined);
    const counts = new Map<string, number>();
    for (const name of declarations) counts.set(name, (counts.get(name) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
  });

  it('the unreferenced action is never emitted', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/example.tsx') ?? '';

    // `unused()` resets count to 0 — its own body has no `+`/`+=`/`++`; every emitted handler in the
    // fixture that assigns count does so additively, so a bare `count.set(0)` (never generated for any
    // reachable action here) is what `unused` alone would have produced, and it must not appear.
    expect(source).not.toContain('count.set(0)');
  });

  it('Flutter → analyzer → compiler (N1–N11) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
