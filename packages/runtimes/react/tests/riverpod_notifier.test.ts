import { describe, expect, it } from 'vitest';

import { NotifierProvider, Notifier, AutoDisposeNotifier, ProviderContainer } from '../src/internal/riverpod/container.js';

// `Notifier<S>`/`AutoDisposeNotifier<S>`/`NotifierProvider` — Riverpod 2's own `Notifier` API (M14, the
// generator's own commit has the full real-corpus evidence: `NotifierProvider.autoDispose<DiscoverDeck,
// List<Product>>(DiscoverDeck.new)`, a real declaration this milestone's own fixture reproduces). Behavioral,
// against the container's own already-oracle-verified dependency-tracking and notify machinery — this file
// proves only the two things genuinely new here: the two-step construction protocol (`ref` attached, then
// `build()` called, in that order) and that `.notifier` reaches the concrete subclass, mirroring
// `StateNotifierProvider`'s own already-proven shape.

class Counter extends AutoDisposeNotifier<number> {
  override build(): number {
    return 0;
  }
  bump(): void {
    this.state = this.state + 1;
  }
}

describe('Notifier / AutoDisposeNotifier', () => {
  it('build() computes the initial state; a watcher sees it without any explicit state assignment inside build()', () => {
    const provider = new NotifierProvider<Counter>(() => new Counter());
    const container = new ProviderContainer();
    expect(container.read(provider)).toBe(0);
    container.dispose();
  });

  it('ref is available inside build() (attached before build() runs), and not before', () => {
    class ReadsRefEarly extends Notifier<number> {
      sawRefBeforeBuild = false;
      constructor() {
        super();
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- probing for a throw, not using the value.
          this.ref;
          this.sawRefBeforeBuild = true;
        } catch {
          // expected: ref is not attached yet at construction time.
        }
      }
      override build(): number {
        // If this throws, ref genuinely was not attached before build() — the test below would fail loudly.
        void this.ref;
        return 1;
      }
    }
    const provider = new NotifierProvider<ReadsRefEarly>(() => new ReadsRefEarly());
    const container = new ProviderContainer();
    const notifier = container.read(provider.notifier) as ReadsRefEarly;
    expect(notifier.sawRefBeforeBuild).toBe(false);
    expect(container.read(provider)).toBe(1);
    container.dispose();
  });

  it('.notifier is the concrete subclass — its own method is callable, and mutating state notifies a watcher', async () => {
    const provider = new NotifierProvider<Counter>(() => new Counter());
    const container = new ProviderContainer();
    const log: number[] = [];
    container.listen(provider, (_prev, next) => log.push(next as number));
    container.read(provider.notifier).bump();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual([1]);
    container.dispose();
  });

  it('a rebuild (autoDispose, re-read after the last listener leaves) constructs a fresh notifier instance', async () => {
    let constructions = 0;
    class Fresh extends AutoDisposeNotifier<number> {
      override build(): number {
        constructions += 1;
        return constructions;
      }
    }
    const provider = new NotifierProvider<Fresh>(() => new Fresh(), { autoDispose: true });
    const container = new ProviderContainer();
    const sub = container.listen(provider, () => {});
    expect(container.read(provider)).toBe(1);
    sub.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Disposed after the last listener left (autoDispose) — reading again rebuilds.
    expect(container.read(provider)).toBe(2);
    container.dispose();
  });
});
