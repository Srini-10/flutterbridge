import { bench, describe } from 'vitest';

import { batch, derived, effect, signal, type ReadableSignal } from '../src/index.js';

// Benchmarks for the signal graph (M3-A).
//
// ## What these are for
//
// Not to produce a number for a slide. Each one measures a property ADR-20 *claims*, in a shape where the
// claim would be false if the implementation were wrong:
//
// - **The R2 fast path**: a read with no intervening write must be O(1), not O(dependencies). This is why
//   `recompute` does not bump `globalVersion` — a derived can only change downstream of a write that already
//   did, so bumping again would make every *other* node's fast path miss for the rest of the flush.
// - **The R3 cutoff**: work stops where values stop changing, so a write that cancels out costs one
//   comparison rather than a subgraph repaint.
// - **R6 batching**: N writes in a batch cost one flush, not N.
//
// Run with `pnpm --filter @bridge/runtime-react bench`. Not part of `turbo run test`, and deliberately not a
// CI gate: a timing assertion on a shared runner is a flaky test, and the properties above are asserted
// exactly (as counts, not times) in `graph.test.ts`.

/** A chain of `length` derived values, each reading the one before it. */
function chain(length: number): { head: ReturnType<typeof signal<number>>; tail: ReadableSignal<number> } {
  const head = signal(0);
  let tail: ReadableSignal<number> = head;
  for (let i = 0; i < length; i++) {
    const previous = tail;
    tail = derived(() => previous.get() + 1, `link${i}`);
  }
  return { head, tail };
}

describe('reads', () => {
  bench('cached read of a deep chain (the R2 fast path)', () => {
    const { tail } = chain(100);
    tail.get();
    for (let i = 0; i < 1000; i++) tail.get();
  });

  bench('read after a write, down a 100-deep chain', () => {
    const { head, tail } = chain(100);
    tail.get();
    for (let i = 0; i < 100; i++) {
      head.set(i);
      tail.get();
    }
  });

  bench('read of an untouched derived while another changes', () => {
    const a = signal(0);
    const b = signal(0);
    const fromA = derived(() => a.get() * 2, 'fromA');
    const fromB = derived(() => b.get() * 2, 'fromB');
    fromA.get();
    fromB.get();
    // `fromB` is untouched throughout. Each of its reads should be a single global-version comparison.
    for (let i = 0; i < 1000; i++) {
      a.set(i);
      fromA.get();
      fromB.get();
    }
  });
});

describe('propagation', () => {
  bench('one write, 1000 subscribed effects', () => {
    const source = signal(0);
    for (let i = 0; i < 1000; i++) effect(() => {
      source.get();
    });
    source.set(1);
  });

  bench('one write through a 100-wide diamond', () => {
    const source = signal(0);
    const arms: ReadableSignal<number>[] = [];
    for (let i = 0; i < 100; i++) arms.push(derived(() => source.get() + i, `arm${i}`));
    const joined = derived(() => arms.reduce((sum, arm) => sum + arm.get(), 0), 'joined');
    effect(() => {
      joined.get();
    });
    for (let i = 0; i < 100; i++) source.set(i);
  });

  bench('R3 cutoff: 1000 writes that do not change a derived value', () => {
    const count = signal(1);
    const positive = derived(() => count.get() > 0, 'positive');
    let runs = 0;
    effect(() => {
      positive.get();
      runs++;
    });
    // Every write changes `count` and none change `positive`, so the effect must run exactly once — at
    // creation. The cost here is 1000 comparisons, not 1000 effect runs.
    for (let i = 1; i <= 1000; i++) count.set(i);
  });

  bench('no cutoff: 1000 writes that each change a derived value', () => {
    const count = signal(1);
    const doubled = derived(() => count.get() * 2, 'doubled');
    effect(() => {
      doubled.get();
    });
    for (let i = 1; i <= 1000; i++) count.set(i);
  });
});

describe('batching', () => {
  bench('1000 writes, unbatched', () => {
    const source = signal(0);
    effect(() => {
      source.get();
    });
    for (let i = 0; i < 1000; i++) source.set(i);
  });

  bench('1000 writes in one batch', () => {
    const source = signal(0);
    effect(() => {
      source.get();
    });
    batch(() => {
      for (let i = 0; i < 1000; i++) source.set(i);
    });
  });
});

describe('construction', () => {
  bench('build a 1000-node chain', () => {
    chain(1000);
  });

  bench('create and dispose 1000 effects', () => {
    const source = signal(0);
    const disposers = Array.from({ length: 1000 }, () => effect(() => {
      source.get();
    }));
    for (const dispose of disposers) dispose();
  });
});
