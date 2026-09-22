import { describe, expect, it } from 'vitest';

import { AsyncValue } from '../src/internal/riverpod/async_value.js';
import {
  FutureProvider,
  ProviderContainer,
  StateNotifier,
  StreamProvider,
  defineStateFamily,
  defineStateNotifierFamily,
  type StreamLike,
} from '../src/internal/riverpod/container.js';

// The typed family wrappers the M14 `.family`/`.autoDispose` generator work added
// (`packages/generators/react/src/internal/emit/riverpod_family.ts` is what lowers to these): `defineStateFamily`
// and `defineStateNotifierFamily` are `defineFamily` applied to a member of a specific `ProviderInstance`
// subclass, so `.notifier` has a concrete type — the family analogue of the already-oracle-tested
// `StateProvider`/`StateNotifierProvider` value classes. `FutureProvider`/`StreamProvider` are the plain
// (non-family) value-class siblings `logic.New` reuses (`package_kit.ts`).
//
// None of these change `ProviderContainer`'s own behaviour — family-key equality, `autoDispose` timing, and
// `AsyncValue` construction are already recorded against the real package and replayed by
// `riverpod_oracle.test.ts`; this file proves only that the new *surface* reaches the identical, already-proven
// machinery: two equal family arguments still share one instance, `.notifier` still targets the right element.

describe('defineStateFamily', () => {
  it('two equal arguments share one instance; two different ones do not', () => {
    const family = defineStateFamily<string, string>((_ref, seed) => seed);
    const container = new ProviderContainer();
    const a1 = family('a');
    const a2 = family('a');
    const b = family('b');
    expect(container.read(a1)).toBe('a');
    expect(container.read(a2)).toBe('a');
    expect(container.read(b)).toBe('b');
    // `.notifier` mutates the member's own state — the identical `StateController` a plain `StateProvider` gives.
    container.read(a1.notifier).state = 'changed';
    expect(container.read(a1)).toBe('changed');
    // A different argument's instance is untouched — family isolation, not a shared cell.
    expect(container.read(b)).toBe('b');
    container.dispose();
  });
});

class Counter extends StateNotifier<number> {
  constructor(seed: number) {
    super(seed);
  }
  increment(): void {
    this.setState(this.state + 1);
  }
  private setState(next: number): void {
    // `StateNotifier#state`'s setter is the public surface (`container.ts`); this mirrors what a generated
    // `increment()` body does.
    (this as unknown as { state: number }).state = next;
  }
}

describe('defineStateNotifierFamily', () => {
  it("`.notifier` is the concrete notifier class — its own method is callable, not just the base class's", () => {
    const family = defineStateNotifierFamily<Counter, number>((_ref, seed) => new Counter(seed));
    const container = new ProviderContainer();
    const zero = family(0);
    const ten = family(10);
    expect(container.read(zero)).toBe(0);
    expect(container.read(ten)).toBe(10);
    container.read(zero.notifier).increment();
    expect(container.read(zero)).toBe(1);
    // The other family member is untouched.
    expect(container.read(ten)).toBe(10);
    container.dispose();
  });

  it('the same argument (by `==`, not identity) reads the same member', () => {
    const family = defineStateNotifierFamily<Counter, string>((_ref, seed) => new Counter(seed.length));
    const container = new ProviderContainer();
    const first = family('abc');
    const second = family(`${'ab'}c`); // a distinct string object, `==` the first
    expect(container.read(first)).toBe(3);
    container.read(first.notifier).increment();
    expect(container.read(second)).toBe(4);
    container.dispose();
  });
});

describe('FutureProvider (plain, non-family)', () => {
  it("a watcher's value is `AsyncValue<T>`, not the bare Dart return type", async () => {
    const provider = new FutureProvider<number>(async () => 7);
    const container = new ProviderContainer();
    container.listen(provider, () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const value = container.read(provider);
    expect(value).toBeInstanceOf(AsyncValue);
    expect(value.valueOrNull).toBe(7);
    container.dispose();
  });
});

describe('StreamProvider (plain, non-family)', () => {
  it("a watcher's value is `AsyncValue<T>`, fed from the stream's own emissions", async () => {
    const source: StreamLike<number> = {
      listen(onData) {
        onData(5);
        return { cancel: () => undefined };
      },
    };
    const provider = new StreamProvider<number>(() => source);
    const container = new ProviderContainer();
    container.listen(provider, () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const value = container.read(provider);
    expect(value).toBeInstanceOf(AsyncValue);
    expect(value.valueOrNull).toBe(5);
    container.dispose();
  });
});
