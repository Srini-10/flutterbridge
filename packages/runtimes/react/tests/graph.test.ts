import { describe, expect, it, vi } from 'vitest';

import {
  batch,
  derived,
  effect,
  RuntimeError,
  signal,
  subscribe,
  untracked,
  type ReadableSignal,
} from '../src/index.js';

// The signal graph (M3-A), against ADR-20's evaluation semantics.
//
// These tests are the executable form of ADR-20. Each `describe` is one rule, and the rules are what a
// second implementation — the reference interpreter ADR-4 mandates, or a Vue kit — must also satisfy. So
// they are written as statements about *the semantics*, not about this implementation: nothing here reaches
// past the public API, and nothing asserts a private field.
//
// Recomputation counts are asserted throughout. That is deliberate and is what ADR-20 R3 buys: "how many
// times did this recompute" is the property `react.lower-signals` most needs to preserve, and a model
// without a value-equality cutoff cannot express it at all.

describe('R1 — an observer never sees a partially-updated graph', () => {
  it('does not expose an intermediate value when two dependencies change together', () => {
    const a = signal(1);
    const b = signal(2);
    const sum = derived(() => a.get() + b.get());
    const seen: number[] = [];
    effect(() => {
      seen.push(sum.get());
    });

    batch(() => {
      a.set(10);
      b.set(20);
    });

    // 22 is the glitch: `a` updated, `b` not yet. It must never be observed — not transiently, not as an
    // extra entry that "settles" to the right value afterwards.
    expect(seen).toEqual([3, 30]);
  });

  it('is glitch-free through a diamond, where one write reaches a node by two paths', () => {
    const source = signal(1);
    const left = derived(() => source.get() * 2);
    const right = derived(() => source.get() * 3);
    const joined = derived(() => `${left.get()}:${right.get()}`);
    const seen: string[] = [];
    effect(() => {
      seen.push(joined.get());
    });

    source.set(2);

    // A push-based model reaches `joined` twice — once via each arm — and paints `4:3` on the way.
    expect(seen).toEqual(['2:3', '4:6']);
  });
});

describe('R2 — reads pull, writes only mark', () => {
  it('does not compute a derived value until something reads it', () => {
    const a = signal(1);
    const compute = vi.fn(() => a.get() * 2);
    const doubled = derived(compute);

    expect(compute).not.toHaveBeenCalled();
    expect(doubled.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('does not recompute an unread derived when its dependency is written', () => {
    const a = signal(1);
    const compute = vi.fn(() => a.get() * 2);
    const doubled = derived(compute);
    doubled.get();

    a.set(2);
    a.set(3);
    a.set(4);

    // Still one: nothing read it, so there was nothing to be stale for. Work happens at the read.
    expect(compute).toHaveBeenCalledTimes(1);
    expect(doubled.get()).toBe(8);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('caches: repeated reads with no write in between compute once', () => {
    const a = signal(1);
    const compute = vi.fn(() => a.get() * 2);
    const doubled = derived(compute);

    for (let i = 0; i < 10; i++) doubled.get();

    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('R3 — propagation stops where the value stops changing', () => {
  it('an Object.is-equal write is not a change and notifies nobody', () => {
    const a = signal(1);
    const run = vi.fn();
    effect(() => {
      a.get();
      run();
    });
    run.mockClear();

    a.set(1);

    expect(run).not.toHaveBeenCalled();
  });

  it('a derived that recomputes to an equal value does not re-run its dependents', () => {
    const count = signal(1);
    const isPositive = derived(() => count.get() > 0);
    const run = vi.fn();
    effect(() => {
      isPositive.get();
      run();
    });
    run.mockClear();

    count.set(2);
    count.set(3);

    // `count` changed, so `isPositive` was recomputed — but it recomputed to `true` both times. This is the
    // fixed point: the write is real, the derived value is not, and the effect below it must not run. This
    // is the difference between "something upstream was written" and "my input is different".
    expect(run).not.toHaveBeenCalled();

    count.set(-1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('separates +0 from -0 and treats NaN as equal to itself, because it uses Object.is', () => {
    const zero = signal(0);
    const zeroRuns = vi.fn();
    effect(() => {
      zero.get();
      zeroRuns();
    });
    zeroRuns.mockClear();
    zero.set(-0);
    // `0 === -0` is true, so `===` would drop this write. They are different numbers and `canonicalNumber`
    // in the UIR encoder already had to make the same distinction, for the same reason.
    expect(zeroRuns).toHaveBeenCalledTimes(1);

    const nan = signal(Number.NaN);
    const nanRuns = vi.fn();
    effect(() => {
      nan.get();
      nanRuns();
    });
    nanRuns.mockClear();
    nan.set(Number.NaN);
    // `NaN === NaN` is false, so `===` would re-notify forever on a value that never changes.
    expect(nanRuns).not.toHaveBeenCalled();
  });

  it('does not compare deeply: an equal-contents array is a change', () => {
    const items = signal<readonly number[]>([1, 2]);
    const run = vi.fn();
    effect(() => {
      items.get();
      run();
    });
    run.mockClear();

    items.set([1, 2]);

    // A new array with equal contents notifies. The kit cannot know whether a value is a value or an
    // identity; guessing wrong in the cheap direction costs a render, guessing wrong in the expensive
    // direction is `sig.Action`'s own documented defect — "generated React state that never updates".
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('R4 — dependencies are what was read, and are re-collected every time', () => {
  it('does not depend on a branch it did not take', () => {
    const show = signal(false);
    const total = signal(100);
    const compute = vi.fn(() => (show.get() ? total.get() : 0));
    const label = derived(compute);
    label.get();
    expect(compute).toHaveBeenCalledTimes(1);

    total.set(200);
    label.get();

    // `total` was never read, so it is not a dependency, so writing it changes nothing. A static
    // over-approximation — `Derived.deps` from extraction — would recompute here.
    expect(compute).toHaveBeenCalledTimes(1);

    show.set(true);
    expect(label.get()).toBe(200);
    expect(compute).toHaveBeenCalledTimes(2);

    // Now it *is* a dependency, because now it was read.
    total.set(300);
    expect(label.get()).toBe(300);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('unsubscribes from a dependency it stopped reading', () => {
    const show = signal(true);
    const total = signal(100);
    const compute = vi.fn(() => (show.get() ? total.get() : 0));
    const label = derived(compute);
    label.get();

    show.set(false);
    label.get();
    expect(compute).toHaveBeenCalledTimes(2);

    total.set(999);
    label.get();

    // The edge to `total` is gone, not merely ignored. If stale edges survived, a long-lived derived would
    // accumulate subscriptions to every signal it ever conditionally touched and recompute on all of them.
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('R5 — effects run in the order they were scheduled', () => {
  it('runs effects FIFO, and once each per flush however many times they were scheduled', () => {
    const a = signal(0);
    const order: string[] = [];
    effect(() => {
      a.get();
      order.push('first');
    });
    effect(() => {
      a.get();
      order.push('second');
    });
    effect(() => {
      a.get();
      order.push('third');
    });
    order.length = 0;

    batch(() => {
      a.set(1);
      a.set(2);
      a.set(3);
    });

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('an effect reading a derived sees the current value regardless of its queue position', () => {
    const a = signal(1);
    const doubled = derived(() => a.get() * 2);
    const seen: number[] = [];

    // Scheduled first, but reads the derived — which is only correct because reads pull (R2).
    effect(() => {
      seen.push(doubled.get());
    });
    effect(() => {
      a.get();
    });
    seen.length = 0;

    a.set(5);

    expect(seen).toEqual([10]);
  });
});

describe('R6 — writes batch, and a batch flushes once', () => {
  it('runs an effect once for many writes in a batch', () => {
    const a = signal(0);
    const run = vi.fn();
    effect(() => {
      a.get();
      run();
    });
    run.mockClear();

    batch(() => {
      a.set(1);
      a.set(2);
      a.set(3);
    });

    // Not three. Two writes in one action must produce one render, or a component reading both signals
    // paints a state that never existed in the Flutter program.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flushes only at the outermost batch', () => {
    const a = signal(0);
    const observed: number[] = [];
    effect(() => {
      observed.push(a.get());
    });
    observed.length = 0;

    batch(() => {
      a.set(1);
      batch(() => {
        a.set(2);
        batch(() => a.set(3));
      });
      // Nothing has flushed yet: an inner batch closing is not the end of the update.
      expect(observed).toEqual([]);
    });

    expect(observed).toEqual([3]);
  });

  it('flushes synchronously for a write outside any batch', () => {
    const a = signal(0);
    const observed: number[] = [];
    effect(() => {
      observed.push(a.get());
    });
    observed.length = 0;

    a.set(1);

    // No await, no tick. A scheduled flush would make the observation point depend on the host's task
    // queue, and the reference interpreter has no task queue.
    expect(observed).toEqual([1]);
  });

  it('returns the body’s value and still flushes when the body throws', () => {
    const a = signal(0);
    const observed: number[] = [];
    effect(() => {
      observed.push(a.get());
    });
    observed.length = 0;

    expect(batch(() => 42)).toBe(42);

    expect(() =>
      batch(() => {
        a.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // The write happened, so the effect must run. Leaving the graph marked-but-unflushed would strand it in
    // a state where a later unrelated write appears to cause this one.
    expect(observed).toEqual([1]);
  });
});

describe('R7 — a flush runs to a fixed point, and says so when it cannot', () => {
  it('lets an effect write a signal, and settles', () => {
    const a = signal(0);
    const mirror = signal(0);
    effect(() => mirror.set(a.get() * 2));

    a.set(5);

    expect(mirror.get()).toBe(10);
  });

  it('settles a chain of effects that feed each other', () => {
    const a = signal(1);
    const b = signal(0);
    const c = signal(0);
    effect(() => b.set(a.get() + 1));
    effect(() => c.set(b.get() + 1));

    a.set(10);

    expect(b.get()).toBe(11);
    expect(c.get()).toBe(12);
  });

  it('throws BRG4001 rather than looping forever when an effect reschedules itself', () => {
    const count = signal(0);

    // Capping silently would leave an application rendering stale state under load and passing every test.
    expect(() => {
      effect(() => {
        count.set(count.get() + 1);
      }, 'runaway');
    }).toThrow(RuntimeError);
  });

  it('names the offending effect in the BRG4001 diagnostic', () => {
    const count = signal(0);
    try {
      effect(() => {
        count.set(count.get() + 1);
      }, 'runaway');
      expect.unreachable('the effect should not have settled');
    } catch (error) {
      const runtimeError = error as RuntimeError;
      expect(runtimeError.code).toBe('BRG4001');
      expect(runtimeError.path).toContain('runaway');
    }
  });

  it('recovers: a non-settling flush does not poison the graph for the next write', () => {
    const runaway = signal(0);
    expect(() => {
      effect(() => {
        runaway.set(runaway.get() + 1);
      }, 'runaway');
    }).toThrow(RuntimeError);

    const healthy = signal(0);
    const observed: number[] = [];
    effect(() => {
      observed.push(healthy.get());
    });
    healthy.set(1);

    // The failed flush cleared its queue. If it had not, the runaway effect would still be scheduled and
    // every subsequent write in the process would re-throw its diagnostic.
    expect(observed).toEqual([0, 1]);
  });
});

describe('R8 — a derived that reads itself is an error, not a hang', () => {
  it('throws BRG4002 with the cycle named', () => {
    // The self-reference is resolved through a holder, which is the only way to build one: the value must
    // exist before it can read itself.
    const holder: { node: ReadableSignal<number> | null } = { node: null };
    const node = derived(() => (holder.node === null ? 0 : holder.node.get() + 1), 'cyclic');
    holder.node = node;

    try {
      node.get();
      expect.unreachable('reading a cyclic derived should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      const runtimeError = error as RuntimeError;
      // Not a RangeError from somewhere in the middle of a render: a diagnostic with the cycle in hand.
      expect(runtimeError.code).toBe('BRG4002');
      expect(runtimeError.path).toContain('cyclic');
    }
  });

  it('throws through an indirect cycle', () => {
    const holder: { first: ReadableSignal<number> | null } = { first: null };
    const first: ReadableSignal<number> = derived(
      () => (holder.first === null ? 0 : second.get()),
      'first',
    );
    const second: ReadableSignal<number> = derived(() => first.get() + 1, 'second');
    holder.first = first;

    expect(() => first.get()).toThrow(RuntimeError);
  });
});

describe('subscriptions are removed, not merely ignored', () => {
  it('stops running an effect once it is disposed', () => {
    const a = signal(0);
    const run = vi.fn();
    const dispose = effect(() => {
      a.get();
      run();
    });
    run.mockClear();

    dispose();
    a.set(1);

    expect(run).not.toHaveBeenCalled();
  });

  it('is idempotent: disposing twice is not an error', () => {
    const a = signal(0);
    const dispose = effect(() => {
      a.get();
    });
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it('a disposed effect does not keep its dependency alive', () => {
    const a = signal(0);
    const dispose = effect(() => {
      a.get();
    });
    dispose();

    // Nothing is left to schedule, so the write is O(1) rather than a walk over a dead subgraph. This is the
    // observable proxy for "the edge is gone" — a leak here is a leak per request under ADR-15's scoping.
    const run = vi.fn();
    effect(() => {
      a.get();
      run();
    });
    run.mockClear();
    a.set(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('subscribe() does not call its listener on subscribe, only on change', () => {
    const a = signal(0);
    const listener = vi.fn();
    const unsubscribe = subscribe(a, listener);

    // `useSyncExternalStore` requires this: React subscribes during commit and must not be told the value
    // changed when it did not.
    expect(listener).not.toHaveBeenCalled();

    a.set(1);
    expect(listener).toHaveBeenCalledTimes(1);

    a.set(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    a.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('cleanup runs before every re-run and once at the end', () => {
  it('runs the cleanup before each re-run', () => {
    const a = signal(0);
    const events: string[] = [];
    effect(() => {
      const value = a.get();
      events.push(`run:${value}`);
      return () => events.push(`cleanup:${value}`);
    });

    a.set(1);
    a.set(2);

    // The cleanup closes over the run that created it, so it must tear down *that* run's resources before
    // the next one allocates its own.
    expect(events).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1', 'run:2']);
  });

  it('runs the cleanup on dispose', () => {
    const a = signal(0);
    const cleanup = vi.fn();
    const dispose = effect(() => {
      a.get();
      return cleanup;
    });

    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);

    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('untracked reads do not create edges', () => {
  it('peek() reads without subscribing', () => {
    const a = signal(1);
    const run = vi.fn();
    effect(() => {
      a.peek();
      run();
    });
    run.mockClear();

    a.set(2);

    expect(run).not.toHaveBeenCalled();
  });

  it('untracked() suspends tracking for a whole computation', () => {
    const tracked = signal(1);
    const hidden = signal(1);
    const run = vi.fn();
    effect(() => {
      tracked.get();
      untracked(() => hidden.get());
      run();
    });
    run.mockClear();

    hidden.set(2);
    expect(run).not.toHaveBeenCalled();

    tracked.set(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('update() does not subscribe the caller to the signal it writes', () => {
    const count = signal(0);
    const run = vi.fn();
    effect(() => {
      // A read-modify-write inside an effect. If `update` tracked, this effect would depend on `count`,
      // write `count`, and reschedule itself forever — a BRG4001 caused entirely by the kit.
      if (run.mock.calls.length === 0) count.update((current) => current + 1);
      run();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(count.get()).toBe(1);
  });
});

describe('execution is deterministic', () => {
  it('produces an identical observation sequence for an identical script', () => {
    const script = (): string[] => {
      const log: string[] = [];
      const a = signal(1);
      const b = signal(2);
      const sum = derived(() => a.get() + b.get(), 'sum');
      const doubled = derived(() => sum.get() * 2, 'doubled');
      const gate = derived(() => sum.get() > 5, 'gate');

      effect(() => {
        log.push(`sum=${sum.get()}`);
      });
      effect(() => {
        log.push(`doubled=${doubled.get()}`);
      });
      effect(() => {
        log.push(`gate=${gate.get()}`);
      });

      batch(() => {
        a.set(10);
        b.set(20);
      });
      a.set(10);
      b.set(1);
      batch(() => {
        a.set(1);
        b.set(2);
      });
      return log;
    };

    const first = script();
    const second = script();

    // D1–D5 applied to the runtime: the same writes in the same order produce the same observations in the
    // same order. Two runs in one process, so this also proves no state survives between graphs.
    expect(first).toEqual(second);
    expect(first).toEqual([
      'sum=3',
      'doubled=6',
      'gate=false',
      'sum=30',
      'doubled=60',
      'gate=true',
      'sum=11',
      'doubled=22',
      'sum=3',
      'doubled=6',
      'gate=false',
    ]);
  });

  it('two graphs in one process do not observe each other', () => {
    const first = signal(1);
    const second = signal(1);
    const firstRuns = vi.fn();
    const secondRuns = vi.fn();
    effect(() => {
      first.get();
      firstRuns();
    });
    effect(() => {
      second.get();
      secondRuns();
    });
    firstRuns.mockClear();
    secondRuns.mockClear();

    first.set(2);

    // The graph's bookkeeping is module-scope (see graph.ts). This is the assertion that it holds no
    // *application* state — the concern ADR-15 raises about a Next.js server process sharing a module.
    expect(firstRuns).toHaveBeenCalledTimes(1);
    expect(secondRuns).not.toHaveBeenCalled();
  });
});
