# ADR-20 — Signal graph evaluation semantics

- **Status:** Accepted (M3-A). Amends Spec v2.0 §2.3 (signal graph) with the evaluation rules it omits.
- **Date:** 2026-07-17

## Context

ADR-4 makes the signal graph the universal reactivity model and calls it *"the demonstrated convergence
point of Vue, Svelte 5, Angular and Solid"*. It settles the **vocabulary** — `sig.Signal`, `sig.Derived`,
`sig.Effect`, `sig.Action`, `app.Store` — and says nothing about the **semantics**.

Nothing else does either. A search of the specification, the amendments, the ADRs and the schema for
`glitch`, `topolog`, `batch` or `order` returns the batching of `setState` at extraction time and nothing
about evaluation. The schema describes shape: `Derived.deps` is *"the signals it reads"*; `Effect.timing` is
`mount | update | unmount`. Neither says when a derived recomputes, in what order effects run, or what a
write actually causes.

That gap is load-bearing, and it has three consumers who must agree exactly:

1. **`@bridge/runtime-react`** (this milestone) — executes the graph on React.
2. **The reference interpreter** ADR-4 mandates for property-testing `react.lower-signals`. It does not
   exist yet. Property tests compare the pass's output against it; if the two disagree about semantics, the
   tests assert the wrong thing while passing.
3. **Every future kit** — Vue, Svelte, Angular. ADR-1 and ADR-18 exist because a fact stated in N places
   gets stated N different ways. Evaluation semantics are exactly such a fact.

Left unstated, each of the three would infer the semantics from its host framework, and the hosts genuinely
disagree — Vue and Solid recompute eagerly on write, React re-renders on schedule, Svelte 5 batches to a
microtask. The behaviour of a converted application would then depend on the target, which is the failure
this project exists to prevent.

## Decision

The signal graph evaluates by **lazy pull with value-equality cutoff**, under the eight rules below. They
are normative for every implementation of the graph, in every language and on every target.

Determinism here means what D1–D5 mean elsewhere: **the same writes, in the same order, produce the same
observations, in the same order.** Not "eventually consistent"; not "consistent modulo scheduling".

### R1 — Glitch-freedom

No observer ever sees a derived value computed from a mix of pre-write and post-write inputs.

`c = a + b`, with `a = 1, b = 2`, in one batch writing `a = 10, b = 20`: `c` is observed as `30`. Never
`22`, not even transiently.

### R2 — Reads are pull; writes are marks

A write marks its transitive dependents stale. It does **not** compute them. A `Derived` recomputes only
when read, and only if a dependency it actually read has changed.

This is what makes R1 cheap rather than a topological sort: a pulled value is by construction computed from
current inputs.

### R3 — Value-equality cutoff (the fixed point)

Change propagates only where a value actually changed. Equality is `Object.is`.

- `signal.set(v)` where `Object.is(v, current)` → **no change**: no version bump, no marking, no effect run.
- A `Derived` that recomputes to an `Object.is`-equal value → **no change**: its dependents are not
  invalidated and effects downstream of it do not run.

R3 is why the graph reaches a **fixed point** rather than merely settling: propagation stops at the first
node whose value is unchanged, so a write that cancels out (`x = 1` when `x` is already `1`, or
`abs(-1) → abs(1)`) costs one comparison and terminates there. Without R3 every write would repaint the
whole subgraph, and the pass tests in §"Consequences" could not assert recomputation counts at all.

`Object.is`, not `===`: it separates `+0` from `-0` and makes `NaN` equal to itself. `canonicalNumber` in
`packages/uir/src/generated/uir.ts` already had to special-case `-0` for node identity; the same distinction
matters here, for the same reason — a value that compares equal to itself must not re-notify forever.

Deep equality is **not** used. `items.set([...items.get()])` with equal contents *is* a change. The kit
cannot know whether a value is a value or an identity, and guessing wrong in the cheap direction (an extra
render) is recoverable; guessing wrong in the expensive direction (a dropped update) is the defect
`sig.Action`'s own schema doc warns about — *"generated React state that never updates"*.

### R4 — Dependencies are dynamic, and re-collected on every recomputation

A `Derived` depends on what it **read during its last computation**, not on what it might read.

```ts
derived(() => (showTotal.get() ? total.get() : 0))
```

While `showTotal` is `false`, this does not depend on `total`, and writes to `total` do not invalidate it.
Dependencies dropped on a recomputation are unsubscribed in the same step.

**This is deliberately not `Derived.deps`.** The UIR field is a static, conservative over-approximation
computed by extraction — it serves the compiler's `reactivity-graph` analysis. Using it at runtime would
subscribe the example above to `total` forever: correct, but it would recompute on writes that provably
cannot change the result, and the over-approximation would compound through every downstream derived. The
runtime has the one thing the analyzer does not — the actual execution — and uses it. The two are consistent:
the dynamic set is always a subset of the static set.

### R5 — Effect ordering is FIFO by scheduling order

Scheduled effects run in the order they were scheduled. An effect scheduled twice before a flush runs once.

FIFO is sufficient *because of* R2: an effect pulls its dependencies when it runs, so it observes current
values regardless of position in the queue. Ordering effects topologically would buy nothing and would make
the order depend on graph shape — which changes under R4, and would make the observation order depend on
which branch a `Derived` happened to take.

### R6 — Writes batch; a batch flushes once

Writes inside `batch(fn)` mark; effects flush once, after `fn` returns. Batches nest — only the outermost
flushes. A write outside any batch is a batch of one.

An action dispatch is implicitly a batch (§"Actions"). This is the runtime counterpart of the extraction
contract: ADR-4 maps a `setState` body to a `sig.Action`, and a `setState` body applies as one atomic update
in Flutter. Two writes in one action must produce one render, or a `Row` reading both signals paints an
intermediate state that never existed in the Flutter program.

### R7 — Flush runs to a fixed point, and non-termination is a diagnostic

Effects may write signals, scheduling further effects. The flush loop continues until the queue is empty —
that is the fixed point.

A graph that never reaches one (`effect(() => count.set(count.get() + 1))`) is a **defect in the program**,
not a condition to survive. After `MAX_FLUSH_ITERATIONS` (100) the runtime **throws** `BRG4001`, naming the
effects still scheduled.

It throws rather than degrading. The alternative — capping silently — produces an application that renders
stale state under load and is correct in every test; that is the shape of bug this project treats as
unacceptable, and it is the same reasoning that makes `PassManager` refuse a pipeline containing an
unimplemented pass rather than skip it.

### R8 — Cycles among derived are an error

A `Derived` that reads itself, transitively, throws `BRG4002` naming the cycle. It does not deadlock, return
a stale value, or recurse until the stack overflows.

`sig.Derived` is *"a value computed from other signals — a Flutter getter over state"*. A getter that calls
itself is a bug in the source program; the runtime reports it with the cycle in hand, where it is
diagnosable, rather than as a `RangeError` from somewhere in the middle of a render.

## Alternatives considered

**Eager push (recompute dependents on write; Vue/Solid-style).** Rejected: it violates R1 unless it also
maintains a topological order, which means either a sort per write or a depth label per node maintained under
R4's dynamic edges. It also computes derived values nothing reads — on the render path, in every converted
app. Lazy pull gets R1 for free.

**Push-then-pull with dirty flags, no versions.** This is lazy pull without R3: a marked node recomputes when
read, but "marked" cannot distinguish *my input changed* from *my input was rewritten to the same value*. The
fixed point is lost and the recomputation-count tests become unwritable.

**Microtask/scheduled flush (Svelte 5-style).** Rejected: it makes the observation point depend on the host's
task queue, so the reference interpreter and the kit could not agree by construction, and a test would have
to `await` a tick to observe a synchronous write. R6's synchronous flush is what makes the graph's behaviour
identical in Node, in a browser, and in the interpreter.

## Consequences

- **The semantics are testable independently of React**, and are tested that way — the graph is a
  zero-dependency module under `src/internal/state/`, and React enters only at `useSyncExternalStore`.
- **The reference interpreter ADR-4 mandates is unblocked.** It implements R1–R8. Its agreement with this kit
  is then a property of both conforming to this ADR, rather than a coincidence to be discovered at M3-B.
- **R3 makes recomputation counts observable**, so "did the pass lower this correctly" can be asked as *"how
  many times did this derived recompute"* — the property `react.lower-signals` most needs to preserve and the
  one a value-equality-free model cannot express.
- **Two new reserved diagnostics**: `BRG4001` (flush did not reach a fixed point), `BRG4002` (cyclic derived).
  `BRG4xxx` is unused by the analyzer (`BRG13xx` extraction) and the compiler (`BRG23xx` normalization); it is
  claimed here for the runtime.
- **`sig.Effect.timing` is not modelled by R1–R8.** `mount`/`update`/`unmount` are *component lifecycle*, which
  React owns; the graph knows only "an effect that reruns when its dependencies change". The kit's lifecycle
  helpers map the timings onto the host. This split is deliberate: the graph semantics must hold in the
  reference interpreter, which has no components.
