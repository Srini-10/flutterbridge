import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  riverpodProviderScopeOverridesRaw,
  riverpodProviderScopeOverridesUnsupportedRaw,
  typecheckEmitted,
} from './support.js';

// The M14 `ProviderScope(overrides: [...])` build-proof — real analyzer output in, real `bridge normalize`,
// real generator, real `tsc --strict` against the real kit, matching this phase's own discipline.
//
// Real-corpus inventory, done before any implementation: exactly 1 real `ProviderScope(overrides: ...)`
// construction in App A + App B combined (App A's own single `ProviderScope(child: ...)` carries no
// overrides; App B's "admin" app the same). App B's own "customer" app has it, at the root of `main()`
// (`runApp(ProviderScope(overrides: [...], child: CommerceApp()))`), never nested, with 4 overrides: two
// `.overrideWithValue(computedValue)`, two `.overrideWith(createFn)` (via helper functions).
//
// **Before this milestone, `overrides:` was silently dropped, with no diagnostic at all** —
// `project.ts`'s own `needsRiverpod` doc already explained why: root discovery deliberately starts from
// `MaterialApp`, never from `runApp`'s own argument, so the program's own `ProviderScope(...)`
// construction was never read for *any* purpose. Confirmed directly: a probe with a real override
// generated a clean, silently-wrong `<ProviderScope>` (no `overrides` prop at all) before this fix.
//
// The fix: `provider_scope_overrides.ts`'s `rootProviderScopeOverridesOf` reads exactly one shape —
// `main()` calling `runApp` with a direct `ProviderScope(overrides: [...])` construction — lowers each
// override element with the *ordinary*, general `emitExpression` (no special-casing of `.overrideWithValue`/
// `.overrideWith`: both are plain method calls on a kit-registered `ProviderInstance`, already generically
// supported the same way `.select` was in §4g), and splices the result into `app/providers.tsx`'s own
// `<ProviderScope overrides={[...]}>`, the same way `app/page.tsx`'s own dynamically-discovered imports
// already are. `functions.ts`'s own `reachableFunctions` was extended with one more root — the overrides
// list itself — so a provider referenced *only* from an override (never from a component or an action,
// this fixture's own `accentColorProvider`) is still found reachable and emitted, not silently missing.
//
// An override whose own value depends on something only `main()`'s own body declares — App B's own other
// real shape, `appPreferencesProvider.overrideWithValue(AppPreferences(prefs))`, `prefs` from `await
// SharedPreferences.getInstance()` — refuses precisely instead: nothing here rebinds the lowering scope to
// know about `main()`'s own locals, so a reference to one is an *ordinary* unresolved reference, and
// `expression.ts`'s own existing fallback reports it exactly as it would anywhere else. This is a real,
// named boundary — `main()`'s own `async`/`await` initialization has no analogue in the generated app — not
// something this milestone attempts to close (`docs/m14/riverpod-usage-matrix.md` §4h). A helper *function*
// returning an `Override` (App B's own `loginAsHintSeed()`) is refused the identical way, for the identical
// reason: it was never independently reached.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodProviderScopeOverridesRaw());

describe('M14 build-proof: `ProviderScope(overrides: ...)` at the application root, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('`.overrideWithValue(computedValue)` — a value computed from a project class\'s own static constant and method — lowers into the `<ProviderScope overrides={[...]}>` prop', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toContain('<ProviderScope overrides={[');
    expect(providers).toContain('compiledBrandDefaultsProvider.overrideWithValue(BrandConfig_neutral.copyWith(');
  });

  it("`.overrideWith((ref) => ...)` — an inline create closure reading another provider — lowers the same way, and that other provider is emitted even though nothing else in the program reads it", () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(providers).toMatch(/themeSeedProvider\.overrideWith\(\(ref\) => \{\s*return ref\.watch\(accentColorProvider\);\s*\}\)/);
    expect(main).toContain('export const accentColorProvider: Provider<number> = new Provider((ref) => {');
  });

  it('the overrides import correctly from the generated providers module, alongside the file\'s other, fixed imports', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toContain("import { BrandConfig_neutral, accentColorProvider, compiledBrandDefaultsProvider, themeSeedProvider } from '@/generated/dart/app/lib/main';");
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});

describe('negative fixture: an override depending on `main()`\'s own local refuses precisely, never silently drops', () => {
  it('reports BRG3006 ("not declared in this program") on the local `main()` alone declares — App B\'s own real `appPreferencesProvider.overrideWithValue(AppPreferences(prefs))` shape', () => {
    const unsupported = compiledFrom(riverpodProviderScopeOverridesUnsupportedRaw());
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    const unresolved = errors.filter((d) => d.code === 'BRG3006');
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.message).toContain('`label` is not declared in this program');
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3005', 'BRG3006']);
    expect(files).toHaveLength(0);
  });
});
