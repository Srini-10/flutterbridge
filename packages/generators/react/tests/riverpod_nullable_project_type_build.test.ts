import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodNullableProjectTypeRaw, typecheckEmitted } from './support.js';

// The `FutureProvider<NullableProjectClass>` type-annotation build-proof — real analyzer output in, real
// `bridge normalize`, real generator, real `tsc --strict` against the real kit.
//
// Found while building the previous milestone's own `riverpod_select` fixture: a top-level Riverpod provider
// field whose own declared generic argument is a *nullable project-defined class* —
// `final p = FutureProvider<Session?>((ref) async => ...);` — got an incorrect, `tsc`-failing type
// annotation: `FutureProvider<unknown | null>` instead of `FutureProvider<Session | null>`.
//
// Traced through the whole pipeline before any fix, not patched from the error message alone:
//
// 1. **The analyzer** (`raw_node_emitter.dart`'s own `typeRef`) records a type argument's own `target` (the
//    link the generator needs to resolve a project class to its own emitted name) only when the *outer*
//    type is itself a project generic (`$DtoCopyWith<Dto>`), or the one caller that had already opted out
//    of that restriction via `includeExternalTypeArguments: true` (`_class`'s own `superclass` field,
//    `StateNotifier<LoadState>`, ADR-0055). A top-level or `static` field's own declared type
//    (`declaration_extractor.dart`, two call sites) was never such a caller — `FutureProvider` is itself
//    *external* (`package:riverpod/...`, no `target` of its own), so `Session`'s own `target` was silently
//    unrecorded even though `Session` *is* a project class this compiler extracts a declaration for.
// 2. **The generator** (`types.ts`'s own `typeTextOf`) falls back, with no structured `target` to resolve,
//    to re-parsing the *outer* type's own display-name string (`typeArgumentsOf`) — which cannot carry a
//    `target` at all, since it was never attached to begin with — landing on `unknown`.
//
// A *non-nullable* `FutureProvider<Session>` happened to self-heal: `typeTextOf` returns the bare string
// `'unknown'` for that case (not `FutureProvider<unknown>`), which `functions.ts`'s own
// `fieldType === 'unknown' ? '' : ...` check recognizes and *omits* the explicit annotation entirely,
// letting `tsc` infer the real type from the initializer instead — which is exactly why this stayed
// invisible until a *nullable* shape was tried (`unknown | null` does not match that bare-string check).
//
// The fix, in two parts, both generic — no App-specific name matching, no App-specific fixture shape:
//
// 1. `declaration_extractor.dart`'s own two field-declaration call sites (top-level, class-member/`static`)
//    now pass `includeExternalTypeArguments: true` — the identical, already-established treatment
//    `superclass` gets, extended to a caller with the identical need. `typeRef`'s own recursive call (for a
//    type argument's *own* type arguments) now propagates the flag too — `FutureProvider<List<Session>?>`
//    needs `Session`'s own `target` captured *two* levels down, since `List` is itself external as well;
//    without propagation the inner call silently reset to `false` and lost it the identical way.
// 2. `types.ts`'s own `collectionTypeText` (`List<T>` → `T[]`, `Set<T>` → `Set<T>`, `Map<K,V>` → `Map<K,V>`)
//    never read the structured `typeArguments` array at all — always the text-only fallback, regardless of
//    whether the analyzer had, by then, started providing structured data. Now it prefers the structured
//    array when present, the identical pattern the kit-generic branch above it already used.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodNullableProjectTypeRaw());

describe('`FutureProvider<NullableProjectClass>` build-proof, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('a non-nullable project class is unaffected — the control, already worked before this fix', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export const sessionProvider: FutureProvider<Session> = new FutureProvider(');
  });

  it('a nullable project class resolves to its own emitted name, not `unknown` — the bug', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export const maybeSessionProvider: FutureProvider<Session | null> = new FutureProvider(');
  });

  it('a nullable `List<ProjectClass>` resolves the element type too — two external generics deep, not just the outermost', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export const sessionsProvider: FutureProvider<Session[] | null> = new FutureProvider(');
  });

  it('a nullable primitive and a nullable kit-mirrored SDK value type are unaffected — the controls', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export const countProvider: Provider<number | null> = new Provider(');
    expect(main).toContain('export const maybeDurationProvider: Provider<Duration | null> = new Provider(');
  });

  it('a type alias resolving to a nullable project class needs no separate handling — the analyzer\'s own resolved type is already the aliased one', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export const aliasedSessionProvider: FutureProvider<Session | null> = new FutureProvider(');
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
