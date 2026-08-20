import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, localStoreRaw, typecheckEmitted } from './support.js';

// The M7-N build-proof — a component-owned instance of a declared store (ADR-27):
// `final CounterStore _left = CounterStore();`, a signal, a derived value, a parameterless action (also
// read as a tear-off), a parameterized action, and a *second* independent instance of the same store type
// on the same component (`_right`) — the shape `docs/m7/m7m-user-class-construction.md` stopped short of
// implementing and ADR-27 decides.
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` against the real,
// unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other build-proof in
// this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(localStoreRaw());

describe('M7-N build-proof: a locally-owned store instance, real analyzer to real tsc', () => {
  it('the generator reports no error and resolves every member by target, not by name', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const store = fileAt(files, 'src/stores/counter-store.ts') ?? '';
    // Every member keyed by the name the author wrote — not `value_<hash>` (declaredName recovery,
    // ADR-27's `nameIndex` extension to `logic.PropertyAccess`/`logic.MethodCall`).
    expect(store).toContain("derived(() => _count.get(), 'count')");
    expect(store).toContain("derived(() => (_count.get() * 2), 'doubled')");
    expect(store).toContain("action(() => {\n    _count.set(_count.peek() + 1);\n  }, 'increment')");
    expect(store).toContain("action((n: number) => {\n    _count.set(_count.peek() + n);\n  }, 'add')");
  });

  it('two instances of the same store are acquired independently, never sharing a local', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/counters-screen.tsx') ?? '';

    expect(source.match(/= useLocalStore\(counterStoreStore\);/g)?.length).toBe(2);
    expect(source).toContain('const _left = useLocalStore(counterStoreStore);');
    expect(source).toContain('const _right = useLocalStore(counterStoreStore);');
  });

  it('a signal/derived read subscribes per instance, keyed by the access site, not the member', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/counters-screen.tsx') ?? '';

    // `left.count` and `right.count` name the same declared member but must not collapse into one
    // subscription — the whole point of ADR-27's per-node (not per-target) keying.
    expect(source).toContain('const _left_count$ = useSignal(_left.count);');
    expect(source).toContain('const _right_count$ = useSignal(_right.count);');
    expect(source).toContain('const _left_doubled$ = useSignal(_left.doubled);');
    expect(source).toContain('const _right_doubled$ = useSignal(_right.doubled);');
    expect(source).toMatch(/Left: \$\{_left_count\$\} \(doubled: \$\{_left_doubled\$\}\)/);
    expect(source).toMatch(/Right: \$\{_right_count\$\} \(doubled: \$\{_right_doubled\$\}\)/);
  });

  it('an action tear-off and a parameterized action call resolve directly, never re-subscribed', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/counters-screen.tsx') ?? '';

    expect(source).toContain('onPressed={_left.increment}');
    expect(source).toContain('onPressed={_right.increment}');
    expect(source).toMatch(/onPressed=\{\(\) => \{\s*return _left\.add\(5\);\s*\}\}/);
    expect(source).toMatch(/onPressed=\{\(\) => \{\s*return _right\.add\(5\);\s*\}\}/);
  });

  it('Flutter → analyzer (resolved-element store recognition) → compiler (unchanged N1–N11) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
