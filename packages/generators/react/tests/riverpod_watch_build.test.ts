import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodWatchRaw, typecheckEmitted } from './support.js';

// The M14 `ref.watch`/`ref.listen` hook-hoisting build-proof — "the major current App A blocker"
// (docs/m14/riverpod-usage-matrix.md §3/§6) — real analyzer output in, real `bridge normalize`, real
// generator, real `tsc --strict` against the real kit, matching this milestone's own discipline.
//
// `fixtures/apps/riverpod_watch`'s `HomeScreen` reproduces App A's own real pattern exactly: `final provider
// = counterByIdProvider(widget.id); final count = ref.watch(provider); ...; ref.read(provider.notifier)
// .increment()` — the family instance resolved once, then both watched (render position) and read/mutated
// (inside a callback). `ref.listen(provider, (previous, next) {})` is a bare statement, as both real
// corpora write it. `doubledProvider` is a provider watching another provider inside its own `create`
// closure (§7) — a plain call, never a hook, and must lower unaffected by this fixture's own widget-side
// hoisting. `resolvedByIdProvider` reproduces App B's own `resolvedPriceProvider` shape: family +
// autoDispose + a provider-internal `ref.watch` chained through another family (the same argument passed
// through), itself then `ref.watch`ed from the widget — every combination this phase's own brief asks for.
//
// The architecture this proves: every `ref.watch`/`ref.listen` reachable from a `ConsumerWidget`'s own
// render position is hoisted to the top of the component, unconditionally, in source order — the identical
// rule ADR-0048 already applies to a signal read (`component.ts`'s `declareRiverpodWatches`/
// `declareRiverpodListens`) — and the original occurrence resolves to the hoisted value (`expression.ts`'s
// `riverpodWatchLocal`), never a second, un-hoistable hook call.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodWatchRaw());

describe('M14 build-proof: `ref.watch`/`ref.listen` hook-hoisting, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('`ref.watch` is hoisted to `useWatch(...)` at the top of the component, and read at its own position through the hoisted local', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(
      /export function HomeScreen\(props: HomeScreenProps\) \{\s*const ref = useProviderContainer\(\);\s*\n\s*const w\$0 = useWatch\(counterByIdProvider\(props\.id\)\);\s*const w\$1 = useWatch\(doubledProvider\);\s*const w\$2 = useWatch\(resolvedByIdProvider\(props\.id\)\);/,
    );
    // Read at their own position through `count`/`doubled`/`resolved` — themselves a plain rebinding of the
    // hoisted local (the next test), not a second, un-hoistable `ref.watch` call.
    expect(home).toContain('{`${count}`}');
    expect(home).toContain('{`${doubled}`}');
    expect(home).toContain('{resolved}');
    // Never re-evaluated inline — the whole point of hoisting is exactly one subscription per call site.
    expect(home.match(/useWatch\(/g)?.length).toBe(3);
  });

  it('`ref.listen` is hoisted to a bare `useListen(...)` call, and its own bare-statement position emits nothing', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/useListen\(counterByIdProvider\(props\.id\), \(previous, next\) => \{\s*\}\);/);
    // No dead `undefined;`/residual statement where the Dart source called `ref.listen(...)` inline.
    expect(home).not.toMatch(/ref\.listen/);
  });

  it('`provider`\'s own prelude local is still declared, and `ref.read(provider.notifier)` inside the callback reads it — not hoisted, still a plain call', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('const provider = counterByIdProvider(props.id);');
    expect(home).toMatch(/onPressed=\{\(\) => \{\s*return ref\.read\(provider\.notifier\)\.increment\(\);\s*\}\}/);
  });

  it('`count`/`doubled`/`resolved`, whose own initializer was a hoisted `ref.watch`, become a plain rebinding of the hoisted local — not a second subscription', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('const count = w$0;');
    expect(home).toContain('const doubled = w$1;');
    expect(home).toContain('const resolved = w$2;');
  });

  it('a provider watching another provider inside its own `create` closure is a plain call, never a hook (§7)', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const doubledProvider: Provider<number> = new Provider\(\(ref\) => \{\s*return intMul\(ref\.watch\(baseProvider\), 2\);\s*\}\);/);
    // Never `useWatch` — that hook exists only for a *widget's* subscription, never a provider's own dependency.
    expect(main).not.toContain('useWatch');
  });

  it('family + autoDispose + a provider-internal `ref.watch` chained through another family (App B\'s own `resolvedPriceProvider` shape) all compose in one declaration', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(
      /export const resolvedByIdProvider = defineFamily<string, string>\('provider', \(ref, id\) => \{\s*return ref\.watch\(itemByIdProvider\(id\)\)\.toUpperCase\(\);\s*\}, \{ autoDispose: true \}\);/,
    );
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
