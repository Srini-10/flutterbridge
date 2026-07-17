import { describe, expect, it, vi } from 'vitest';

import { defineStore, effect, instantiateStore, RuntimeError } from '../src/index.js';

// Parameterised action dispatch (Spec v2.5 §A18, M3-B.1).
//
// ## The runtime needed no change, and that is the claim under test
//
// §A18 added `sig.Action.params` to the UIR because the model could not represent `toggle(int id)`. The kit's
// facade was already `action<A extends readonly unknown[], R>(body: (...args: A) => R): (...args: A) => R` —
// not by luck, but because an action is a function and was typed as one in M3-A, before anything could emit
// a parameterised one.
//
// So there is nothing to implement here, only something to prove: that arguments reach the body, that the
// properties the facade guarantees for a nullary action — one batch, the disposal guard, `onAction`
// observability, async batching up to the first suspension — all still hold when there are arguments, and
// that none of them quietly depends on arity.
//
// ## On "argument validation"
//
// There is deliberately no runtime arity or type check. The kit is called by generated TypeScript, and
// `tests/build.test.ts` in `@bridge/gen-react` compiles that output against this package: an action called
// with the wrong arity does not reach runtime, because `tsc` refuses it first. A runtime check would
// re-answer at every dispatch a question already answered once at build time, and would answer it worse —
// after the fact, in production, for a defect that is a compiler bug rather than a user error.

/** An item, standing in for whatever a real store holds. */
interface Item {
  readonly sku: string;
}

/** The store §A18 was written about: `FavoritesStore.toggle(int id)`. */
const favorites = defineStore('Favorites', ({ signal, derived, action }) => {
  const ids = signal<readonly number[]>([]);
  const count = derived(() => ids.get().length, 'count');
  const toggle = action((id: number) => {
    const current = ids.peek();
    ids.set(current.includes(id) ? current.filter((each) => each !== id) : [...current, id]);
  }, 'toggle');
  return { ids, count, toggle };
});

describe('arguments reach the body', () => {
  it('dispatches one argument', () => {
    const store = instantiateStore(favorites);
    store.state.toggle(1);
    expect(store.state.ids.get()).toEqual([1]);
    store.state.toggle(1);
    expect(store.state.ids.get()).toEqual([]);
  });

  it('dispatches several, in order', () => {
    const seen: unknown[][] = [];
    const store = instantiateStore(
      defineStore('multi', ({ action }) => ({
        select: action((item: string, index: number, force: boolean) => {
          seen.push([item, index, force]);
        }, 'select'),
      })),
    );
    store.state.select('a', 2, true);
    // Positional order is the call site's contract, which is why the compiler sorts `writes` and never
    // sorts `params`.
    expect(seen).toEqual([['a', 2, true]]);
  });

  it('dispatches none', () => {
    const runs = vi.fn();
    const store = instantiateStore(defineStore('nullary', ({ action }) => ({ reset: action(runs, 'reset') })));
    store.state.reset();
    expect(runs).toHaveBeenCalledWith();
  });

  it('passes objects by reference, not by copy', () => {
    const item: Item = { sku: 'a' };
    let received: Item | undefined;
    const store = instantiateStore(
      defineStore('byref', ({ action }) => ({
        add: action((value: Item) => {
          received = value;
        }, 'add'),
      })),
    );
    store.state.add(item);
    // A Dart object crossing into an action is the same object. Cloning would make `select(item)` compare
    // unequal to the item the caller still holds, and every identity check downstream would fail.
    expect(received).toBe(item);
  });

  it('returns the action’s value', () => {
    const store = instantiateStore(
      defineStore('ret', ({ action }) => ({ double: action((n: number) => n * 2, 'double') })),
    );
    expect(store.state.double(21)).toBe(42);
  });

  it('distinguishes an explicit undefined from a missing argument', () => {
    const seen: number[] = [];
    const store = instantiateStore(
      defineStore('arity', ({ action }) => ({
        take: action((...args: unknown[]) => {
          seen.push(args.length);
        }, 'take'),
      })),
    );
    store.state.take();
    store.state.take(undefined);
    // `f()` and `f(undefined)` are different calls, and a Dart optional parameter with a default depends on
    // the difference. The facade forwards `...args` rather than reading fixed positions, so it survives.
    expect(seen).toEqual([0, 1]);
  });
});

describe('the facade’s guarantees hold with arguments', () => {
  it('batches an action’s writes into one flush', () => {
    const store = instantiateStore(
      defineStore('batched', ({ signal, action }) => {
        const a = signal(0);
        const b = signal(0);
        return {
          a,
          b,
          set: action((x: number, y: number) => {
            a.set(x);
            b.set(y);
          }, 'set'),
        };
      }),
    );
    const runs = vi.fn();
    effect(() => {
      store.state.a.get();
      store.state.b.get();
      runs();
    });
    runs.mockClear();

    store.state.set(1, 2);

    // ADR-20 R6. Two writes in one action produce one render, whatever the action's arity.
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('reports the arguments to onAction', () => {
    const seen: Array<[string, readonly unknown[]]> = [];
    const store = instantiateStore(favorites, { onAction: (label, args) => seen.push([label, args]) });
    store.state.toggle(7);
    // The kit's whole observability surface for state changes, and it already carried the arguments —
    // there was nothing to report before §A18, because no action could have any.
    expect(seen).toEqual([['toggle', [7]]]);
  });

  it('refuses a parameterised dispatch after dispose, with BRG4003', () => {
    const store = instantiateStore(favorites);
    store.dispose();
    try {
      store.state.toggle(1);
      expect.unreachable('dispatching on a disposed store should throw');
    } catch (error) {
      expect((error as RuntimeError).code).toBe('BRG4003');
    }
  });

  it('batches an async action’s arguments up to its first await, and no further', async () => {
    const store = instantiateStore(
      defineStore('async', ({ signal, action }) => {
        const a = signal(0);
        const b = signal(0);
        return {
          a,
          b,
          load: action(async (base: number) => {
            a.set(base);
            b.set(base); // batched with the write above
            await Promise.resolve();
            a.set(base + 1);
            b.set(base + 1); // each flushes on its own: the batch closed when the action returned its promise
          }, 'load'),
        };
      }),
    );
    const runs = vi.fn();
    effect(() => {
      store.state.a.get();
      store.state.b.get();
      runs();
    });
    runs.mockClear();

    await store.state.load(10);

    expect(runs).toHaveBeenCalledTimes(3);
    expect(store.state.a.get()).toBe(11);
  });

  it('keeps a derived correct across dispatches', () => {
    const store = instantiateStore(favorites);
    expect(store.state.count.get()).toBe(0);
    store.state.toggle(1);
    store.state.toggle(2);
    expect(store.state.count.get()).toBe(2);
    store.state.toggle(1);
    expect(store.state.count.get()).toBe(1);
  });

  it('re-renders a subscriber once per dispatch that changes what it reads, and not otherwise', () => {
    const store = instantiateStore(
      defineStore('swap', ({ signal, derived, action }) => {
        const ids = signal<readonly number[]>([1]);
        const count = derived(() => ids.get().length, 'count');
        // Removes one and adds another, in one batch: `ids` changes, `count` does not.
        const swap = action((out: number, incoming: number) => {
          ids.set([...ids.peek().filter((each) => each !== out), incoming]);
        }, 'swap');
        return { ids, count, swap };
      }),
    );
    const runs = vi.fn();
    effect(() => {
      store.state.count.get();
      runs();
    });
    runs.mockClear();

    store.state.swap(1, 2);

    // `ids` genuinely changed — a reader of `ids` would re-render. `count` went 1 → 1, so a reader of
    // `count` must not. ADR-20 R3: propagation stops where values stop changing, and arity has nothing to
    // do with it.
    expect(store.state.ids.get()).toEqual([2]);
    expect(runs).not.toHaveBeenCalled();
  });

  it('gives two instances independent state under parameterised dispatch', () => {
    const first = instantiateStore(favorites);
    const second = instantiateStore(favorites);
    first.state.toggle(1);
    // ADR-15, unchanged by §A18: the definition is module-scope and holds nothing; the instances are not.
    expect(first.state.count.get()).toBe(1);
    expect(second.state.count.get()).toBe(0);
  });
});

describe('execution is deterministic', () => {
  it('produces an identical observation sequence for an identical dispatch script', () => {
    const script = (): string[] => {
      const log: string[] = [];
      const store = instantiateStore(favorites);
      effect(() => {
        log.push(`count=${store.state.count.get()}`);
      });
      for (const id of [1, 2, 3, 2, 1]) store.state.toggle(id);
      return log;
    };
    expect(script()).toEqual(script());
    expect(script()).toEqual(['count=0', 'count=1', 'count=2', 'count=3', 'count=2', 'count=1']);
  });
});
