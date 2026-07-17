// The signal graph — ADR-4's reactivity model, under ADR-20's evaluation semantics.
//
// ## What this module is
//
// The whole of ADR-20 (R1–R8), and nothing else. No React, no store, no theme, no DOM — this file imports
// one type from the diagnostics module and nothing more. That is deliberate on three counts:
//
// 1. ADR-20's semantics must hold in the reference interpreter ADR-4 mandates, which has no components and
//    no host framework. Semantics that needed React could not be stated there.
// 2. It makes R1–R8 testable as arithmetic — see `tests/graph.test.ts`, which asserts recomputation counts.
// 3. React is the *least* signal-native target (ADR-4). Keeping the mismatch in one adapter
//    (`internal/react/`) rather than smeared through the graph is what makes the mismatch reviewable.
//
// ## Why one module and not four
//
// Signals, derived and effects are mutually recursive: a derived is both a consumer of producers and a
// producer to consumers, and propagation walks both directions. Splitting them across modules would create
// exactly the import cycle `.dependency-cruiser.cjs`'s `no-circular` rule forbids ("Cycles break the
// pass/query model and deterministic builds"). The cycle is real, so it stays inside one module boundary
// where it is a function call rather than an architectural claim.
//
// ## The algorithm, in one paragraph
//
// Every producer carries a `version` that increments only when its value actually changes (R3). A consumer
// records, for each producer it read, the version it read (R4). A write bumps the signal's version and the
// global version, then walks the subgraph to schedule dependent effects (R2) — it computes nothing. A read
// of a derived refreshes it: if the global version is unchanged, the cache is current by construction;
// otherwise each recorded dependency is refreshed and its version compared, and the body re-runs only if
// one actually moved. Glitch-freedom (R1) is a consequence rather than a mechanism — a pulled value cannot
// be stale, because pulling is what makes it fresh.
//
// ## Module-scope state, and why ADR-15 permits it here
//
// `globalVersion`, `activeConsumer`, `batchDepth` and `effectQueue` are module-scope and mutable. ADR-15
// forbids module-scope mutable state *in generated output*, because a module is shared across every request
// in a Next.js server process and a store on one is one user's cart served to another. That reasoning does
// not reach this file, on two grounds, and both are needed:
//
// - **It holds no application data.** A version counter and a queue are engine bookkeeping. Every value a
//   user could observe lives in a store instance, and stores are created per provider (ADR-15's rewrite).
// - **It is never live across a suspension point.** `activeConsumer` and `batchDepth` are set and restored
//   within a single synchronous call, and `effectQueue` is drained synchronously inside `flush`. JavaScript
//   is single-threaded, so no other request can observe them mid-update. This is why `derived` bodies must
//   be synchronous, and why an async action's post-`await` writes land in a *new* batch (see `store.ts`).

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

/** ADR-20 R7: generations of effects in one flush before the runtime calls it non-terminating. */
const MAX_FLUSH_ITERATIONS = 100;

/** A version that no node has, used to mean "never computed". */
const NEVER = 0;

/** Anything a consumer can read and track. */
interface Producer {
  /** Bumps only on an actual change (R3). */
  version: number;
  /** Reverse edges. A `Set` because iteration order is insertion order, which R5 relies on. */
  readonly subscribers: Set<Consumer>;
  /** Bring the cached value up to date. A no-op for signals, which are always current. */
  refresh(): void;
}

/** Anything that reads producers and must be told when they change. */
interface Consumer {
  /** The producers read during the last computation, and the version each had (R4). */
  dependencies: Map<Producer, number>;
}

/** The consumer currently computing, or `null` when reads are untracked. */
let activeConsumer: Consumer | null = null;

/** Increments on every actual signal change. Lets an unchanged graph skip refresh entirely. */
let globalVersion = 1;

/** Depth of nested `batch` calls. Only the outermost flushes (R6). */
let batchDepth = 0;

/** Effects scheduled but not yet run, in scheduling order (R5). */
let effectQueue: EffectNode[] = [];

/**
 * Whether a flush is already draining the queue.
 *
 * An effect that writes a signal reaches `set`, which flushes when no batch is open — so without this, a
 * write from inside an effect would start a *nested* flush. That would run the newly scheduled effects
 * depth-first, in the middle of the current generation, instead of in scheduling order (R5), and a
 * self-rescheduling effect would recurse to a `RangeError` instead of reporting `BRG4001` (R7). The nested
 * call returns immediately and the outer loop picks the work up, which is what makes R7's generations
 * generations.
 */
let flushing = false;

/** Records that `activeConsumer` read `producer`, and at which version (R4). */
function track(producer: Producer): void {
  if (activeConsumer === null) return;
  activeConsumer.dependencies.set(producer, producer.version);
  producer.subscribers.add(activeConsumer);
}

/**
 * Walks the subgraph below a changed producer and schedules every effect it reaches (R2).
 *
 * It schedules rather than recomputes, and it does not decide whether the effect will actually *run* —
 * that is `needsRun`'s job at flush time, once the values are known (R3). A diamond
 * (`a → b, a → c, b → e, c → e`) reaches `e` twice; `visited` is what keeps that linear instead of
 * exponential in a deep graph.
 */
function markDependents(producer: Producer, visited: Set<Producer>): void {
  if (visited.has(producer)) return;
  visited.add(producer);
  for (const subscriber of producer.subscribers) {
    if (subscriber instanceof EffectNode) {
      schedule(subscriber);
    } else if (subscriber instanceof DerivedNode) {
      markDependents(subscriber, visited);
    }
  }
}

/** Queues an effect, at most once per flush (R5). */
function schedule(effect: EffectNode): void {
  if (effect.scheduled || effect.disposed) return;
  effect.scheduled = true;
  effectQueue.push(effect);
}

/**
 * Whether any dependency this consumer actually read has changed value since it read it (R3).
 *
 * This is the difference between "something upstream was written" and "my input is different". A signal
 * written to an equal value, or a derived that recomputed to an equal value, moves no version — so the
 * effect does not run, and `derived(() => a.get() > 0)` does not repaint when `a` goes 1 → 2.
 */
function dependenciesChanged(consumer: Consumer): boolean {
  for (const [producer, seenVersion] of consumer.dependencies) {
    producer.refresh();
    if (producer.version !== seenVersion) return true;
  }
  return false;
}

/**
 * Runs `compute` with `consumer` collecting dependencies, then unsubscribes the ones it stopped reading.
 *
 * Re-collecting on every run is R4: a derived depends on what it *read*, not on what it might read, so a
 * branch not taken creates no subscription and writes to it cause nothing.
 */
function runTracked<T>(consumer: Consumer, compute: () => T): T {
  const previousDependencies = consumer.dependencies;
  consumer.dependencies = new Map();
  const previousConsumer = activeConsumer;
  activeConsumer = consumer;
  try {
    return compute();
  } finally {
    activeConsumer = previousConsumer;
    for (const producer of previousDependencies.keys()) {
      if (!consumer.dependencies.has(producer)) producer.subscribers.delete(consumer);
    }
  }
}

/**
 * Drains the effect queue until it is empty — the fixed point (R7).
 *
 * Each iteration of the outer loop is one generation: the effects scheduled when it started. An effect that
 * writes a signal schedules the next generation. A graph that keeps scheduling forever is a defect in the
 * program, and after `MAX_FLUSH_ITERATIONS` generations this throws rather than capping silently — a capped
 * flush renders stale state under load and passes every test, which is the failure mode ADR-20 R7 refuses.
 */
function flush(): void {
  if (flushing) return; // Re-entered from an effect's own write; the loop below already owns the queue.
  flushing = true;
  try {
    let iterations = 0;
    while (effectQueue.length > 0) {
      if (++iterations > MAX_FLUSH_ITERATIONS) {
        const stuck = effectQueue.map((effect) => effect.label);
        // Cleared before throwing: the queue is poison now, and leaving it would make every later write in
        // the process re-throw this same diagnostic for an effect the caller has no way to reach.
        effectQueue = [];
        throw new RuntimeError(
          RuntimeDiagnosticCode.FlushDidNotSettle,
          `a signal update did not settle after ${MAX_FLUSH_ITERATIONS} rounds of effects; ` +
            `an effect is writing a signal that reschedules it. Still scheduled: ${[...new Set(stuck)].join(', ')}`,
          stuck,
        );
      }
      const generation = effectQueue;
      effectQueue = [];
      for (const effect of generation) {
        effect.scheduled = false;
        if (effect.disposed) continue;
        if (effect.hasRun && !dependenciesChanged(effect)) continue;
        effect.run();
      }
    }
  } finally {
    flushing = false;
  }
}

/** A writable unit of reactive state — the runtime form of `sig.Signal` (ADR-4). */
class SignalNode<T> implements Producer {
  public version = 1;
  public readonly subscribers = new Set<Consumer>();
  private value: T;

  public constructor(initial: T) {
    this.value = initial;
  }

  /** Signals are always current; the method exists so a consumer can refresh any producer uniformly. */
  public refresh(): void {}

  public get(): T {
    track(this);
    return this.value;
  }

  public peek(): T {
    return this.value;
  }

  public set(next: T): void {
    if (Object.is(next, this.value)) return; // R3: an equal write is not a change.
    this.value = next;
    this.version++;
    globalVersion++;
    markDependents(this, new Set());
    if (batchDepth === 0) flush(); // R6: a bare write is a batch of one.
  }

  public update(mutator: (current: T) => T): void {
    // `peek`, not `get`: an update must not subscribe the enclosing computation to the signal it writes.
    this.set(mutator(this.peek()));
  }
}

/** A value computed from other signals — the runtime form of `sig.Derived` (ADR-4). */
class DerivedNode<T> implements Producer, Consumer {
  public version = NEVER;
  public readonly subscribers = new Set<Consumer>();
  public dependencies = new Map<Producer, number>();
  private value: T | undefined = undefined;
  private globalVersionAtLastCheck = 0;
  private computing = false;
  private readonly compute: () => T;
  private readonly label: string;

  public constructor(compute: () => T, label: string) {
    this.compute = compute;
    this.label = label;
  }

  public refresh(): void {
    // Nothing anywhere has changed since the last check, so the cache is current by construction. This is
    // the fast path that makes reads in a render loop cheap.
    if (this.globalVersionAtLastCheck === globalVersion && this.version !== NEVER) return;
    if (this.computing) {
      throw new RuntimeError(
        RuntimeDiagnosticCode.CyclicDerived,
        `derived '${this.label}' reads itself; a computed value cannot depend on its own result`,
        [this.label],
      );
    }
    if (this.version === NEVER || dependenciesChanged(this)) this.recompute();
    this.globalVersionAtLastCheck = globalVersion;
  }

  private recompute(): void {
    const previous = this.value;
    const hadValue = this.version !== NEVER;
    this.computing = true;
    let next: T;
    try {
      next = runTracked(this, this.compute);
    } finally {
      this.computing = false;
    }
    // R3: recomputing is not changing. A derived that lands on an equal value moves no version, so nothing
    // downstream of it recomputes and no effect below it runs. This is where propagation stops.
    //
    // Note it does *not* bump `globalVersion`. Only a signal write does. A derived can change only as a
    // consequence of a write that already bumped it, so bumping again would say nothing new — and would
    // invalidate every other node's fast path on every recomputation, making a read of an untouched derived
    // O(dependencies) instead of O(1) for the rest of the flush.
    if (!hadValue || !Object.is(next, previous)) {
      this.value = next;
      this.version++;
    }
  }

  public get(): T {
    this.refresh();
    track(this);
    return this.value as T;
  }

  public peek(): T {
    this.refresh();
    return this.value as T;
  }
}

/** A side effect that re-runs when what it read changes. */
class EffectNode implements Consumer {
  public dependencies = new Map<Producer, number>();
  public scheduled = false;
  public disposed = false;
  public hasRun = false;
  public readonly label: string;
  private readonly body: () => void | (() => void);
  private cleanup: (() => void) | null = null;

  public constructor(body: () => void | (() => void), label: string) {
    this.body = body;
    this.label = label;
  }

  public run(): void {
    this.runCleanup();
    const result = runTracked(this, this.body);
    this.cleanup = typeof result === 'function' ? result : null;
    this.hasRun = true;
  }

  private runCleanup(): void {
    const cleanup = this.cleanup;
    this.cleanup = null;
    if (cleanup !== null) cleanup();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runCleanup();
    for (const producer of this.dependencies.keys()) producer.subscribers.delete(this);
    this.dependencies = new Map();
  }
}

/** A readable reactive value. Both `signal` and `derived` produce one. */
export interface ReadableSignal<T> {
  /** Reads the value **and subscribes** the enclosing `derived`/`effect` to it (ADR-20 R4). */
  get(): T;
  /** Reads the value **without subscribing** — the escape hatch for reading state you must not react to. */
  peek(): T;
}

/** A reactive value that can be written. The runtime form of `sig.Signal`. */
export interface WritableSignal<T> extends ReadableSignal<T> {
  /**
   * Writes the value. An `Object.is`-equal write is not a change and notifies nobody (ADR-20 R3).
   *
   * Outside `batch`, this flushes effects synchronously before returning (ADR-20 R6).
   */
  set(next: T): void;
  /** `set(mutator(peek()))`. Reads untracked, so writing a signal never subscribes you to it. */
  update(mutator: (current: T) => T): void;
}

/** Disposes an effect or subscription. Idempotent. */
export type Dispose = () => void;

/**
 * Creates a writable signal — the runtime form of `sig.Signal` (ADR-4).
 *
 * @param initial - the initial value.
 * @returns a signal holding `initial`.
 *
 * @example
 * ```ts
 * const count = signal(0);
 * count.get();       // 0, and subscribes the caller if it is a derived/effect
 * count.set(1);      // notifies; flushes effects synchronously
 * count.set(1);      // no-op: Object.is-equal (ADR-20 R3)
 * ```
 */
export function signal<T>(initial: T): WritableSignal<T> {
  return new SignalNode(initial);
}

/**
 * Creates a derived value — the runtime form of `sig.Derived` (ADR-4).
 *
 * Lazy and cached: `compute` runs on the first read, and again only when a dependency it *actually read*
 * has changed (ADR-20 R2, R4). It must be **synchronous and free of side effects** — it is a getter, and
 * the runtime may call it at any read, or not at all.
 *
 * @param compute - the computation. Reads inside it become this value's dependencies.
 * @param label - a name used in diagnostics, e.g. a cycle report (ADR-20 R8).
 * @returns a read-only signal.
 *
 * @example
 * ```ts
 * const items = signal<readonly Item[]>([]);
 * const total = derived(() => items.get().reduce((n, i) => n + i.price, 0), 'total');
 * ```
 */
export function derived<T>(compute: () => T, label = 'derived'): ReadableSignal<T> {
  return new DerivedNode(compute, label);
}

/**
 * Runs `body` now, and again whenever a signal it read changes (ADR-20 R5).
 *
 * `body` may return a cleanup function, which runs before each re-run and once on dispose — the runtime
 * form of a `sig.Effect` whose `timing` pairs `mount` with `unmount`.
 *
 * @param body - the effect. Reads inside it become its dependencies.
 * @param label - a name used in diagnostics, e.g. a non-settling flush (ADR-20 R7).
 * @returns a disposer. Idempotent.
 *
 * @example
 * ```ts
 * const stop = effect(() => {
 *   const id = setInterval(tick, delay.get());
 *   return () => clearInterval(id);
 * });
 * ```
 */
export function effect(body: () => void | (() => void), label = 'effect'): Dispose {
  const node = new EffectNode(body, label);
  node.run(); // Effects run once on creation, so their dependency set exists before any write can arrive.
  return () => {
    node.dispose();
  };
}

/**
 * Runs `body` with all writes batched: effects flush once, after it returns (ADR-20 R6).
 *
 * Batches nest; only the outermost flushes. This is the runtime counterpart of `setState`'s atomicity — two
 * writes in one action must produce one render, or a component reading both paints a state that never
 * existed in the Flutter program.
 *
 * @param body - the writes to batch.
 * @returns whatever `body` returns.
 */
export function batch<T>(body: () => T): T {
  batchDepth++;
  try {
    return body();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

/**
 * Runs `body` without subscribing the enclosing computation to anything it reads.
 *
 * @param body - the computation.
 * @returns whatever `body` returns.
 */
export function untracked<T>(body: () => T): T {
  const previous = activeConsumer;
  activeConsumer = null;
  try {
    return body();
  } finally {
    activeConsumer = previous;
  }
}

/**
 * Calls `listener` whenever `source`'s value changes. It is **not** called on subscribe.
 *
 * This is the primitive `useSyncExternalStore` needs, and the reason it is not simply `effect`: React's
 * `subscribe` must not invoke its listener synchronously during subscription.
 *
 * @param source - the signal to watch.
 * @param listener - called after each actual change (ADR-20 R3), inside the flush.
 * @returns an unsubscribe function. Idempotent.
 */
export function subscribe<T>(source: ReadableSignal<T>, listener: () => void): Dispose {
  let primed = false;
  return effect(() => {
    source.get();
    if (primed) listener();
    primed = true;
  }, 'subscription');
}
