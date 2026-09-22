import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodNotifierRaw, typecheckEmitted } from './support.js';

// The M14 `Notifier`/`AutoDisposeNotifier`/`NotifierProvider` build-proof — Riverpod 2's own successor to
// `StateNotifierProvider`'s create-closure convention — real analyzer output in, real `bridge normalize`,
// real generator, real `tsc --strict` against the real kit, matching this phase's own discipline.
//
// Real-corpus inventory, done before any implementation: exactly 2 real declarations in all of App A + App
// B combined (App A uses `StateNotifierProvider` exclusively, already supported) — both
// `NotifierProvider.autoDispose<N, S>(N.new)` with `class N extends AutoDisposeNotifier<S>` overriding
// `build()`. No `.family`, no plain (non-`autoDispose`) `Notifier`, no `AsyncNotifier`/
// `AsyncNotifierProvider` anywhere in either real corpus — none of those are implemented.
//
// The architecture: `Notifier`/`AutoDisposeNotifier` are registered as **kit-provided superclasses**
// (`package_kit.ts`, the identical mechanism `StateNotifier` already uses, ADR-0055) — a project subclass
// is an ordinary general class (its own `build()`/other methods extracted exactly like any other instance
// method), and `NotifierProvider`/`.autoDispose` is recognized by `riverpod_family.ts`'s existing
// builder-shape table, exactly like `Provider.autoDispose`. Two things were genuinely new, both small:
//
// 1. **The runtime's own `Notifier<S>`** (`packages/runtimes/react/src/internal/riverpod/container.ts`) —
//    deliberately its own class, not built by extending or composing the already oracle-verified
//    `StateNotifier<S>`, because `Notifier`'s own construction is a two-step protocol `StateNotifier`'s is
//    not: a zero-argument factory builds the bare instance, the container attaches `ref` to it, and only
//    then calls the project's own overridden `build()` — `StateNotifier`'s own constructor instead takes
//    the initial state directly, as an ordinary argument. What the two classes share is the identical
//    notify-on-change contract (`state`, `mounted`, `dispose()`, the same `[ATTACH]` hook), not a common
//    base class.
// 2. **`this.ref`, not a bare `ref`** — a `Notifier` subclass's own `ref` reaches the generator already
//    `this.`-qualified (confirmed directly against real analyzer output: the bridge analyzer's own "is
//    this a bare read of a known state-holding base's own member" recognition is keyed to bases it already
//    knows by name, and does not yet include `Notifier`, so Dart's own ordinary instance-member resolution
//    produces an explicit `PropertyAccess` instead) — `expression.ts`'s new `kitSuperclassMemberText` is
//    the `PropertyAccess` sibling of the pre-existing *bare*-read resolution (`functions.ts`'s own
//    `kitSuperMembers`/`paramInScope`, built for `StateNotifier`'s own `state`, never `this.state`).
//
// `DeckNotifier` reproduces App B's own `DiscoverDeck` shape exactly: `build()` watches another provider,
// registers `ref.onDispose`, and `ref.listen`s a third provider, writing `state` from the listener's own
// callback. `HintSeenNotifier` reproduces the second real shape (`DiscoverSwipeHintSeenNotifier`): an
// ordinary instance method, called from outside `build()`, writing `state` after an `await`.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodNotifierRaw());

describe('M14 build-proof: Notifier/AutoDisposeNotifier/NotifierProvider, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('a Notifier subclass is a real class extending the kit\'s AutoDisposeNotifier<S>, with a real zero-argument constructor()', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export class DeckNotifier extends AutoDisposeNotifier<number>');
    expect(main).toMatch(/constructor\(\) \{\s*super\(\);\s*DeckNotifier\.\$init_DeckNotifier\.call\(this\);\s*\}/);
  });

  it('`ref`/`state` inside build() resolve to `this.ref`/`this.state` — ref.watch, ref.onDispose and ref.listen all work as plain calls', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/build\(\): number \{\s*const base = this\.ref\.watch\(baseProvider\);/);
    expect(main).toContain('this.ref.onDispose(() => {');
    expect(main).toMatch(/this\.ref\.listen\(tickProvider, \(previous, next\) => \{\s*this\.state = intAdd\(base, next\);\s*\}\);/);
    expect(main).toMatch(/return base;\s*\}/);
  });

  it('an ordinary method (not build()) reads/writes `this.state` too — `bump()`, and after an `await` in `markSeen()`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/bump\(\): void \{\s*this\.state = intAdd\(this\.state, 1\);\s*\}/);
    expect(main).toMatch(/async markSeen\(\): Promise<void> \{\s*\(await delay\(.*\)\);\s*this\.state = true;\s*\}/);
  });

  it('`NotifierProvider.autoDispose<N, S>(N.new)` becomes `new NotifierProvider(() => N.$new$N(), { autoDispose: true })` — the constructor tear-off lowered by the ordinary general-class construction machinery, no special-casing needed', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(
      /export const deckProvider = new NotifierProvider\(\(\) => \{\s*return DeckNotifier\.\$new\$DeckNotifier\(\);\s*\}, \{ autoDispose: true \}\);/,
    );
  });

  it('a widget watches the provider through the ordinary hoisting mechanism, and reads .notifier the ordinary way', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('const w$0 = useWatch(deckProvider);');
    expect(home).toContain('ref.read(deckProvider.notifier).bump();');
    expect(home).toContain('ref.read(hintSeenProvider.notifier).markSeen();');
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
