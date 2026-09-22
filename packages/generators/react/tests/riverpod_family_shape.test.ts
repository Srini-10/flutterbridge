import { describe, expect, it } from 'vitest';

import { isRiverpodFamilyValue, riverpodBuilderShapeOf } from '../src/internal/emit/riverpod_family.js';

// Unit coverage for `riverpod_family.ts`'s two pure recognizers — the build-proof (`riverpod_family_build.test.ts`)
// already exercises every real-corpus shape end to end; this covers the *edges* around them: what is
// deliberately not recognized, so a shape this generator does not support refuses rather than misfiring.

const BUILDERS_LIBRARY = 'package:riverpod/src/builders.dart';

describe('riverpodBuilderShapeOf', () => {
  it('recognizes every builder shape the real corpora use', () => {
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'ProviderFamilyBuilder' })).toEqual({
      kind: 'provider',
      family: true,
      autoDispose: false,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AutoDisposeProviderFamilyBuilder' })).toEqual({
      kind: 'provider',
      family: true,
      autoDispose: true,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AutoDisposeProviderBuilder' })).toEqual({
      kind: 'provider',
      family: false,
      autoDispose: true,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AutoDisposeFutureProviderFamilyBuilder' })).toEqual({
      kind: 'future',
      family: true,
      autoDispose: true,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AutoDisposeStreamProviderFamilyBuilder' })).toEqual({
      kind: 'stream',
      family: true,
      autoDispose: true,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AutoDisposeStateProviderFamilyBuilder' })).toEqual({
      kind: 'state',
      family: true,
      autoDispose: true,
    });
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'StateNotifierProviderFamilyBuilder' })).toEqual({
      kind: 'stateNotifier',
      family: true,
      autoDispose: false,
    });
  });

  it('refuses a receiver from any other library, even one plausibly named — never guesses from the name alone', () => {
    expect(riverpodBuilderShapeOf({ library: 'package:app/my_builders.dart', name: 'ProviderFamilyBuilder' })).toBeUndefined();
  });

  it('refuses a builder name this table does not know, rather than guessing a kind', () => {
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'AsyncNotifierProviderBuilder' })).toBeUndefined();
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'NotAKnownShapeBuilder' })).toBeUndefined();
  });

  it('refuses a type with no `Builder` suffix at all', () => {
    expect(riverpodBuilderShapeOf({ library: BUILDERS_LIBRARY, name: 'ProviderFamily<String, String>' })).toBeUndefined();
  });

  it('refuses `undefined`', () => {
    expect(riverpodBuilderShapeOf(undefined)).toBeUndefined();
  });
});

describe('isRiverpodFamilyValue', () => {
  it('recognizes every family value type the real corpora produce', () => {
    expect(isRiverpodFamilyValue({ library: 'package:riverpod/src/provider.dart', name: 'ProviderFamily<String, String>' })).toBe(true);
    expect(
      isRiverpodFamilyValue({ library: 'package:riverpod/src/future_provider.dart', name: 'AutoDisposeFutureProviderFamily<int, String>' }),
    ).toBe(true);
    expect(
      isRiverpodFamilyValue({
        library: 'package:riverpod/src/state_notifier_provider.dart',
        name: 'StateNotifierProviderFamily<CounterNotifier, int, String>',
      }),
    ).toBe(true);
  });

  it('refuses a plain (non-family) provider value — `family(arg)` and `provider` itself are different types', () => {
    expect(isRiverpodFamilyValue({ library: 'package:riverpod/src/provider.dart', name: 'Provider<String>' })).toBe(false);
  });

  it('refuses a project class whose own name happens to end in "Family"', () => {
    expect(isRiverpodFamilyValue({ library: 'package:app/models.dart', name: 'WordFamily' })).toBe(false);
  });

  it('refuses `undefined`', () => {
    expect(isRiverpodFamilyValue(undefined)).toBe(false);
  });
});
