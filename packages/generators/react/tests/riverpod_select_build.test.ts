import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodSelectRaw, typecheckEmitted } from './support.js';

// The M14 `ref.watch(provider.select((v) => …))` build-proof — real analyzer output in, real `bridge
// normalize`, real generator, real `tsc --strict` against the real kit, matching this phase's own
// discipline.
//
// Real-corpus inventory, done before any implementation: **10 genuine `provider.select(...)` sites** across
// App A + App B combined (all App B — App A has none; App B's own textual `.select(` count of 170 is
// dominated by an unrelated Supabase query-builder method of the identical name, filtered out by requiring
// the receiver to actually be a provider). Every real site is `ref.watch(provider.select((x) => …))` — a
// bare field read (`brandConfigProvider.select((b) => b.companyName)`), a null-aware chain
// (`authStateChangesProvider.select((s) => s.valueOrNull?.session)`), or both — never `ref.listen` with a
// selector, never a selector with its own side effects. Two real sites select off a *family* application
// (`visibilityTargetsForFirmProvider(product.firmId).select(...)`); three read inside *another provider's
// own body*, not a widget (`notificationsProvider`, `tenantBrandingProvider`,
// `brand_providers.dart`'s own resolution chain).
//
// **This is a verification-only milestone slice — no generator or runtime code changed.** Three pieces
// already existed, each built for a different, earlier reason, and compose correctly here with none of
// them aware of the others:
//
//   1. `Provider`/`FutureProvider`/`Provider.family`/… are already **kit-provided types**
//      (`package_kit.ts`'s `KIT_PACKAGE_CLASSES`, the `dio`/`AsyncValue` mechanism, ADR-0075).
//   2. `expression.ts`'s existing kit-method lowering (the `logic.MethodCall` case's `kitReceiver` branch)
//      already handles an arbitrary method call on a kit-registered receiver **generically** — positional
//      arguments *and* named ones together, not only named-argument calls (`.select(fn)` is one positional
//      lambda) — so `provider.select(fn)` was already reachable as `<providerText>.select(<fnText>)`
//      without any new case.
//   3. The runtime's own `ProviderInstance.select(fn)` (`container.ts`) — returning a `SelectView` whose own
//      `same()` compares the *projected* value with `dartEquals`, Riverpod's real narrowing-rebuild
//      semantics, never a "watch everything, read a field" approximation — already existed, oracle-shaped,
//      simply never reached by the generator before this inventory pointed at it. `useWatch` (`react.ts`)
//      already accepts any `Listenable<T>` generically, keyed by `.source` (stable across the fresh
//      `SelectView` object `provider.select(fn)` constructs on every render — `react.ts`'s own `Latest`
//      class exists for exactly this).
//
// `component.ts`'s `declareRiverpodWatches` already passes whatever `ref.watch`'s own argument is through
// the ordinary, general `emitExpression` — a `provider.select(fn)` `logic.MethodCall` reaches it exactly the
// same way a bare `logic.Ref` to a provider does, so hoisting, the family case, and the null-aware chain
// inside the selector all fall out of machinery this milestone did not touch.
//
// `insideProvider` (below) proves `ref.watch(provider.select(...))` *inside a provider's own body* lowers as
// an **ordinary runtime call** (`ref.watch(...)`, the real `Ref` object's own method) — never hoisted, since
// providers are not React components and ADR-0048's hoisting rule does not apply there. This is the
// pre-existing, protected "provider-internal `ref.watch` remains an ordinary provider call" behavior,
// confirmed still correct with a `.select(...)` argument, not reopened.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodSelectRaw());

describe('M14 verification: `ref.watch(provider.select(...))`, real analyzer to real tsc — no code change, pre-existing machinery composes', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('a bare field selector becomes `provider.select((b) => { return b.field; })`, hoisted to `useWatch`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/const w\$0 = useWatch\(brandConfigProvider\.select\(\(b\) => \{\s*return b\.companyName;\s*\}\)\);/);
    expect(home).toMatch(/const w\$1 = useWatch\(brandConfigProvider\.select\(\(b\) => \{\s*return b\.supportPhone;\s*\}\)\);/);
  });

  it("a null-aware chain inside the selector (`s.valueOrNull?.nickname`) lowers through the ordinary null-aware-access machinery, unchanged", () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('sessionProvider.select((s) => {');
    expect(home).toMatch(/\$n\d+ !== null\) \? \$n\d+\.nickname : null\)\)\(s\.valueOrNull\)/);
  });

  it('`.select(...)` chained directly off a *family* application lowers correctly, family identity and all', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/const w\$3 = useWatch\(itemsByFirmProvider\('firm-1'\)\.select\(\(items\) => \{/);
  });

  it("`ref.watch(provider.select(...))` inside another provider's own body is an ordinary runtime call, never hoisted — ADR-0048's hook-hoisting rule does not apply to a provider body, and is not reopened here", () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const providers = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(providers).toMatch(
      /export const greetingProvider: Provider<string> = new Provider\(\(ref\) => \{\s*const name = ref\.watch\(brandConfigProvider\.select\(\(b\) => \{\s*return b\.companyName;\s*\}\)\);/,
    );
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
