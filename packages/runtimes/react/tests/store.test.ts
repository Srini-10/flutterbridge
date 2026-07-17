import { describe, expect, it, vi } from 'vitest';

import { defineStore, derived, effect, instantiateStore, RuntimeError } from '../src/index.js';

// Stores (M3-A) — `app.Store` at runtime, scoped per ADR-15.
//
// The store facade's job is to be the thing a generator emits and a provider instantiates: a definition that
// holds nothing, an instance that holds everything, and actions that are atomic. These tests are about those
// properties. What a *particular* store computes is the application's business.
//
// Every store here is hand-written. That is the M3-A acceptance criterion in ADR-19: the kit executes what
// the generator will emit, and it does so before the generator exists.

/** An item, standing in for whatever an application's store actually holds. */
interface Item {
  readonly sku: string;
  readonly price: number;
}

/** The store shape ADR-15 found in a real application, in the form the generator will emit it. */
const cartStore = defineStore('cart', ({ signal, derived: derive, action }) => {
  const items = signal<readonly Item[]>([]);
  const count = derive(() => items.get().length, 'count');
  const total = derive(
    () => items.get().reduce((sum, item) => sum + item.price, 0),
    'total',
  );
  const add = action((item: Item) => items.update((current) => [...current, item]), 'add');
  const clear = action(() => items.set([]), 'clear');
  return { items, count, total, add, clear };
});

describe('a definition holds no state, which is what makes module scope safe', () => {
  it('gives two instances entirely separate state', () => {
    const first = instantiateStore(cartStore);
    const second = instantiateStore(cartStore);

    first.state.add({ sku: 'a', price: 10 });

    // This is ADR-15's defect, as a test: `final CartStore cartStore = CartStore();` in a Next.js server
    // process is one user's cart served to another. The definition is module-scope and the instances are
    // not, so the two carts cannot see each other.
    expect(first.state.count.get()).toBe(1);
    expect(second.state.count.get()).toBe(0);
  });

  it('does not run the setup function until the store is instantiated', () => {
    const setup = vi.fn(({ signal }: { signal: <T>(initial: T) => unknown }) => ({
      value: signal(0),
    }));
    const definition = defineStore('lazy', setup as never);

    // Merely defining allocates nothing. A definition evaluated at import time would be a module singleton
    // wearing a different hat.
    expect(setup).not.toHaveBeenCalled();

    instantiateStore(definition);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('exposes the definition’s name and freezes the instance state', () => {
    const instance = instantiateStore(cartStore);
    expect(instance.name).toBe('cart');
    expect(Object.isFrozen(instance.state)).toBe(true);
  });
});

describe('actions are atomic', () => {
  it('produces one effect run for an action that writes twice', () => {
    const store = defineStore('counter', ({ signal, action }) => {
      const a = signal(0);
      const b = signal(0);
      const bump = action(() => {
        a.set(a.peek() + 1);
        b.set(b.peek() + 1);
      }, 'bump');
      return { a, b, bump };
    });
    const instance = instantiateStore(store);
    const runs = vi.fn();
    effect(() => {
      instance.state.a.get();
      instance.state.b.get();
      runs();
    });
    runs.mockClear();

    instance.state.bump();

    // A `setState` body applies atomically in Flutter. Two renders where Flutter had one is a state that
    // never existed in the source program, painted on screen.
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('returns the action’s own return value', () => {
    const store = defineStore('echo', ({ action }) => ({
      double: action((n: number) => n * 2, 'double'),
    }));
    expect(instantiateStore(store).state.double(21)).toBe(42);
  });

  it('batches an async action’s writes up to its first await, and no further', async () => {
    const store = defineStore('async', ({ signal, action }) => {
      const a = signal(0);
      const b = signal(0);
      const load = action(async () => {
        a.set(1);
        b.set(1); // batched with the write above — both land before the first suspension
        await Promise.resolve();
        a.set(2);
        b.set(2); // each flushes on its own: the batch closed when the action returned its promise
      }, 'load');
      return { a, b, load };
    });
    const instance = instantiateStore(store);
    const runs = vi.fn();
    effect(() => {
      instance.state.a.get();
      instance.state.b.get();
      runs();
    });
    runs.mockClear();

    await instance.state.load();

    // 1 for the pre-await pair, then 2 for the post-await writes. Holding the batch across the `await` would
    // mean the graph's batch depth stayed live while another request ran — see graph.ts, "Module-scope
    // state" — so `sig.Action.isAsync` costs a flush per post-suspension write, deliberately.
    expect(runs).toHaveBeenCalledTimes(3);
    expect(instance.state.a.get()).toBe(2);
  });

  it('reports each action to onAction, before it runs', () => {
    const seen: Array<[string, readonly unknown[]]> = [];
    const instance = instantiateStore(cartStore, {
      onAction: (label, args) => seen.push([label, args]),
    });

    instance.state.add({ sku: 'a', price: 10 });
    instance.state.clear();

    expect(seen).toEqual([
      ['add', [{ sku: 'a', price: 10 }]],
      ['clear', []],
    ]);
  });
});

describe('derived values in a store recompute only when their inputs change', () => {
  it('does not recompute an unaffected derivation', () => {
    const instance = instantiateStore(cartStore);
    instance.state.add({ sku: 'a', price: 10 });

    expect(instance.state.count.get()).toBe(1);
    expect(instance.state.total.get()).toBe(10);

    instance.state.add({ sku: 'b', price: 5 });
    expect(instance.state.count.get()).toBe(2);
    expect(instance.state.total.get()).toBe(15);
  });

  it('a derivation over an unchanged store is computed once', () => {
    const compute = vi.fn((items: readonly Item[]) => items.length);
    const store = defineStore('counted', ({ signal, derived: derive }) => {
      const items = signal<readonly Item[]>([]);
      return { items, count: derive(() => compute(items.get()), 'count') };
    });
    const instance = instantiateStore(store);

    instance.state.count.get();
    instance.state.count.get();
    instance.state.count.get();

    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('store lifecycle', () => {
  it('disposes the effects it owns', () => {
    const cleanup = vi.fn();
    const store = defineStore('watched', ({ signal, effect: watch }) => {
      const value = signal(0);
      watch(() => {
        value.get();
        return cleanup;
      }, 'watcher');
      return { value };
    });
    const instance = instantiateStore(store);
    cleanup.mockClear();

    instance.dispose();

    // The store owns the effect, so unmounting the provider tears it down. An effect that outlived its store
    // would keep the store's signals reachable — a leak per request, in the one place ADR-15 says a leak is
    // a privacy defect rather than a memory one.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('stops running owned effects once disposed', () => {
    const runs = vi.fn();
    const store = defineStore('watched', ({ signal, effect: watch }) => {
      const value = signal(0);
      watch(() => {
        value.get();
        runs();
      }, 'watcher');
      return { value };
    });
    const instance = instantiateStore(store);
    instance.dispose();
    runs.mockClear();

    instance.state.value.set(1);

    expect(runs).not.toHaveBeenCalled();
  });

  it('disposes owned effects in reverse creation order', () => {
    const order: string[] = [];
    const store = defineStore('ordered', ({ effect: watch }) => {
      watch(() => () => order.push('first'), 'first');
      watch(() => () => order.push('second'), 'second');
      watch(() => () => order.push('third'), 'third');
      return {};
    });

    instantiateStore(store).dispose();

    // Reverse: a later effect may have been set up against what an earlier one established, so it must come
    // down first. This is the same reason `dispose` runs before `initState`'s allocations are released.
    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('refuses a dispatch after dispose, with BRG4003, rather than mutating state nothing is watching', () => {
    const instance = instantiateStore(cartStore);
    instance.dispose();

    try {
      instance.state.add({ sku: 'a', price: 10 });
      expect.unreachable('dispatching on a disposed store should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe('BRG4003');
      expect((error as RuntimeError).message).toContain('cart');
    }
  });

  it('is idempotent, and reports its own state', () => {
    const instance = instantiateStore(cartStore);
    expect(instance.disposed).toBe(false);

    instance.dispose();
    expect(instance.disposed).toBe(true);
    expect(() => instance.dispose()).not.toThrow();
  });

  it('leaves reads working after dispose', () => {
    const instance = instantiateStore(cartStore);
    instance.state.add({ sku: 'a', price: 10 });
    instance.dispose();

    // Reading is not writing. A component mid-unmount may still read what it rendered; refusing that would
    // turn an ordinary teardown into a crash, and there is nothing unsafe about a value nobody can change.
    expect(instance.state.count.get()).toBe(1);
  });
});

describe('stores compose with the graph outside them', () => {
  it('a derivation over two stores tracks both', () => {
    const first = instantiateStore(cartStore);
    const second = instantiateStore(cartStore);
    const combined = derived(() => first.state.total.get() + second.state.total.get(), 'combined');

    expect(combined.get()).toBe(0);
    first.state.add({ sku: 'a', price: 10 });
    expect(combined.get()).toBe(10);
    second.state.add({ sku: 'b', price: 5 });
    expect(combined.get()).toBe(15);
  });
});
