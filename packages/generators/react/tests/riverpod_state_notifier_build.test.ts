import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodStateNotifierRaw, typecheckEmitted } from './support.js';

// The M14 `StateNotifier` build-proof — real analyzer output in, real `bridge normalize`, real generator, real
// `tsc`, matching `riverpod_build.test.ts`'s own discipline.
//
// `fixtures/apps/riverpod_state_notifier`: `CounterController` (the simplest shape — a zero-arg constructor,
// `int` state, `state = state + 1`) and `LoadController` (a positional constructor-injected dependency, a
// defaulted parameter, a sealed `state` hierarchy read through `switch`, an `async` method that awaits before
// writing `state`) — the two shapes measured across both real applications' `StateNotifier` subclasses
// (`docs/m14/riverpod-usage-matrix.md`).
//
// The architecture this proves: a `StateNotifier` subclass is a *general class* (ADR-0055) extending the
// runtime kit's own `StateNotifier<S>` — a real `constructor()` calling a real `super(...)`, `state`/`mounted`
// resolved to `this.state`/`this.mounted` (`package_kit.ts`'s `kitSuperclassMembers`) — never an `app.Store`:
// Riverpod's own `StateNotifierProvider<N, S>((ref) => N(...))` constructs a *value*, which is what
// `logic.New` already means for a general class and what `app.Store`'s own `defineStore` (ADR-15/ADR-19: a
// definition, never an instance) deliberately does not.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodStateNotifierRaw());

describe('M14 build-proof: a StateNotifier subclass, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('CounterController is a real class extending the kit’s StateNotifier<number>, with a real super() call', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export class CounterController extends StateNotifier<number>');
    expect(main).toMatch(/constructor\(\)\s*\{\s*super\(0\);/);
    // `state = state + 1` — a bare, inherited member, resolved to `this.state`, never left as an unresolved read.
    expect(main).toMatch(/this\.state = intAdd\(this\.state, 1\)/);
  });

  it('LoadController: a real constructor-injected dependency, a defaulted parameter, and a real super() call reading it', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('export class LoadController extends StateNotifier<LoadState>');
    // The dependency and the default both become real constructor parameters — not lost, not silently dropped.
    expect(main).toMatch(/constructor\(_repository: Repository, retries: number = 3\) \{/);
    expect(main).toMatch(/super\(LoadStateInitial\.\$new\$LoadStateInitial\(\)\);/);
    // An async method awaits, then writes `this.state` — not a bare, unresolved `state` read/write.
    expect(main).toMatch(/async load\(\): Promise<void> \{/);
    expect(main).toMatch(/this\.state = LoadStateLoaded\.\$new\$LoadStateLoaded\(value\);/);
  });

  it('both providers construct their controller through the class’s own $new factory — a value, not a store definition', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/new StateNotifierProvider\(\(ref\) => \{\s*return CounterController\.\$new\$CounterController\(\);/);
    expect(main).toMatch(/new StateNotifierProvider\(\(ref\) => \{\s*return LoadController\.\$new\$LoadController\(/);
    // Never `defineStore`/`useStore` — that is the React-provider-scoped store facility (ADR-15), a different
    // thing from a Riverpod-owned instance.
    expect(main).not.toContain('defineStore');
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  });
});
