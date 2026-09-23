import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodAsyncValueRaw, typecheckEmitted } from './support.js';

// The M14 `AsyncValue<T>` consumption build-proof — the highest-value remaining Riverpod gap App B's own
// generator taxonomy exposed (docs/m14/riverpod-usage-matrix.md §4d) — real analyzer output in, real
// `bridge normalize`, real generator, real `tsc --strict` against the real kit, matching this phase's own
// discipline.
//
// Real-corpus inventory, done before any implementation: `.valueOrNull` (262 occurrences across App B and
// its own local feature packages), `.isLoading` (131), `.hasError` (82), `.hasValue` (73), `.when(` (68),
// `AsyncValue<` named (59), `.maybeWhen(` (8), `.whenData(` (6), `.requireValue` (10) — no
// `switch`/pattern-matching on `AsyncData`/`AsyncLoading`/`AsyncError`, no `.unwrapPrevious`/
// `.copyWithPrevious`/`.asData`/`.asError`, anywhere in either real corpus.
//
// The architecture: `AsyncValue<T>` (`package:riverpod/src/common.dart`) is registered as a **kit-provided
// type** (`package_kit.ts`'s existing `riverpod` table, ADR-0075 — the same mechanism `dio` already uses),
// which gives it, for free, from machinery this generator already had for every other kit type: a plain
// property read for `.valueOrNull`/`.hasError`/`.hasValue`/`.isLoading`/`.value`/`.error`/`.stackTrace`/
// `.requireValue` (a member read of a kit type is a property of the runtime class — the runtime's own
// `AsyncValue`, packages/runtimes/react/src/internal/riverpod/async_value.ts, oracle-verified, already
// exposes every one of these under the identical name), and a named-argument method call for
// `.when`/`.maybeWhen`/`.whenData` (Dart's named arguments become one trailing options object — exactly
// the runtime's own `when(cases: {data, error, loading, ...})` signature). No new generator code was
// needed beyond the one table row — `riverpod_async_value.ndjson`'s own fixture proves the *existing*
// mechanisms already generalize correctly to a type they had never been pointed at.
//
// `fixtures/apps/riverpod_async_value_widget_position` was originally the paired **negative** fixture:
// `.when(...)` embedded directly as widget-tree content (each branch itself returning a `Widget`) stayed
// precisely refused (`BRG3004`, "a widget returned by a call") — a pre-existing, general, non-Riverpod
// limitation in the render-tree extractor. A later milestone closed it (`docs/m14/riverpod-usage-matrix.md`
// §4j, `riverpod_async_value_widget_when_build.test.ts`'s own build-proof) — that fixture is now a
// **positive** one, and its own test lives there rather than here.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodAsyncValueRaw());

describe('M14 build-proof: `AsyncValue<T>` consumption, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('`.when(...)` becomes a plain named-argument call, each callback lowered by the ordinary closure machinery', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(
      /\.when\(\{ data: \(items\) => \{\s*return `items: \$\{items\.length\}`;\s*\}, error: \(e, st\) => \{\s*return `error: \$\{e\}`;\s*\}, loading: \(\) => \{\s*return 'loading';\s*\} \}\)/,
    );
  });

  it('`.maybeWhen(...)` becomes a plain named-argument call the same way, `orElse` included', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(
      /\.maybeWhen\(\{ data: \(items\) => \{\s*return `has \$\{items\.length\}`;\s*\}, orElse: \(\) => \{\s*return 'none';\s*\} \}\)/,
    );
  });

  it('`.whenData(...)` is a plain single-argument call, chainable — its own result is still an AsyncValue', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/\.whenData\(\(items\) => \{\s*return items\.length;\s*\}\)\.valueOrNull/);
  });

  it('every property real App B code reads is a plain property read — `.valueOrNull`, `.value`, `.isLoading`, `.hasError`, `.hasValue`, `.error`, `.stackTrace`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('.valueOrNull ?? ([] as string[])');
    expect(home).toContain('.value ?? ([] as string[])');
    expect(home).toMatch(/\$\{w\$\d+\.isLoading\}/);
    expect(home).toMatch(/\$\{w\$\d+\.hasError\}/);
    expect(home).toMatch(/\$\{w\$\d+\.hasValue\}/);
    expect(home).toMatch(/\$\{w\$\d+\.error\}/);
    expect(home).toMatch(/\$\{w\$\d+\.stackTrace\}/);
  });

  it('`.requireValue` inside a callback — not hoisted, still a plain call on `ref.read(...)`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/const n = ref\.read\(itemsProvider\)\.requireValue\.length;/);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
