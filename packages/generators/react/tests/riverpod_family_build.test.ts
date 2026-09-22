import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodFamilyRaw, typecheckEmitted } from './support.js';

// The M14 `.family`/`.autoDispose` build-proof — real analyzer output in, real `bridge normalize`, real
// generator, real `tsc`, matching `riverpod_build.test.ts`'s and `riverpod_state_notifier_build.test.ts`'s
// own discipline.
//
// `fixtures/apps/riverpod_family` carries every `.family`/`.autoDispose` static-builder-chain combination the
// real corpora (App A, App B) actually use (`docs/m14/riverpod-usage-matrix.md`): `Provider.family`,
// `Provider.autoDispose.family`, `FutureProvider.autoDispose.family`, `StateProvider.autoDispose.family`,
// `StateNotifierProvider.family` (App A's only family shape), and the non-family `.autoDispose`/plain
// siblings of the same kinds, mixed in the same program the way both real applications mix them.
//
// The architecture this proves: `Provider.family`/`FutureProvider.autoDispose` are Dart **static getters** —
// the chain a `.call(create)` sits on is recognized by its own *resolved type* (a `riverpod` builder class,
// `riverpod_family.ts`), never by a provider's own spelling, so two providers of the same kind with different
// names reach the identical lowering. A non-family shape reuses the same runtime **value class** a plain
// `Provider(create)` already does (`new Provider(create, { autoDispose: true })`); a family shape becomes a
// runtime **function** (`defineFamily`, or `defineStateFamily`/`defineStateNotifierFamily` when `.notifier`
// needs a concrete type) — never a string-substitution of the provider's own name.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodFamilyRaw());

describe('M14 build-proof: `.family`/`.autoDispose`, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('`Provider.family` becomes `defineFamily<string, string>(\'provider\', create)` — no autoDispose option', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const itemByIdProvider = defineFamily<string, string>\('provider', \(ref, id\) => \{\s*return `item-\$\{id\}`;\s*\}\);/);
  });

  it('`Provider.autoDispose.family` becomes the identical `defineFamily` call, plus `{ autoDispose: true }`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(
      /export const autoItemByIdProvider = defineFamily<string, string>\('provider', \(ref, id\) => \{\s*return `item-\$\{id\}`;\s*\}, \{ autoDispose: true \}\);/,
    );
  });

  it('`FutureProvider.autoDispose.family` reads `AsyncValue<T>`, not the bare Dart return type — what a watcher actually gets', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const loadedByIdProvider = defineFamily<AsyncValue<number>, string>\('future', async \(ref, id\) => \{/);
    expect(main).toContain("{ autoDispose: true }");
  });

  it('`StateProvider.autoDispose.family` is `defineStateFamily` — a typed `.notifier`, not `defineFamily`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const filterByIdProvider = defineStateFamily\(\(ref, seed\) => \{\s*return seed;\s*\}, \{ autoDispose: true \}\);/);
  });

  it('`StateNotifierProvider.family` (App A’s own shape) is `defineStateNotifierFamily` — the notifier’s own class, inferred, never `unknown`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const counterByIdProvider = defineStateNotifierFamily\(\(ref, id\) => \{\s*return CounterNotifier\.\$new\$CounterNotifier\(\);\s*\}\);/);
  });

  it('the non-family siblings reuse the exact class a plain construction already uses, unaffected by the family declarations beside them', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const autoValueProvider = new Provider\(\(ref\) => \{\s*return 7;\s*\}, \{ autoDispose: true \}\);/);
    expect(main).toMatch(/export const futureValueProvider: FutureProvider<number> = new FutureProvider\(async \(ref\) => \{\s*return 7;\s*\}\);/);
  });

  it('every family instance is applied to its own call-site argument — never the family declaration itself', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain("itemByIdProvider('a')");
    expect(home).toContain("counterByIdProvider('a')");
    expect(home).toContain("filterByIdProvider('all')");
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  });
});
