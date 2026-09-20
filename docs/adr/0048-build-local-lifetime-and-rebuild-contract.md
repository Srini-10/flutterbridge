# ADR-48 — Build-local lifetime and the rebuild contract

- **Status:** Accepted (M11-H follow-up). **Clarifies** ADR-4, ADR-20 and ADR-28 §10; amends nothing.
  No schema, extraction, generator or runtime change accompanies it.
- **Date:** 2026-09-20

## Context

M11-G found that a write to a `build()`-level local was compiled to `0++;` (an inlined initializer used as
a write target) and closed the defect with a refusal, `BRG1311`. M11-H asked whether the refusal could be
replaced by a real representation and stopped at a gate it could not cross from code alone:

> What is the lifetime of a Dart build-local across generated re-renders, and what triggers a rebuild in the
> generated runtime?

Neither ADR-4, ADR-20 nor ADR-28 answers that. ADR-20 says component lifecycle is something "React owns" and
that the graph semantics must hold in a reference interpreter that "has no components". ADR-28 §10 defers build-
locals to M8-B's `inlineValue` without stating the contract that makes `inlineValue` sound. This ADR states
it, with evidence.

### Evidence (executed or read from source, as marked; nothing below is derived)

**Flutter itself** (`flutter test`, a real widget test, `S1` = `var count = 0; onPressed: () { count++;
setState(() { _result = count; }); }`, four taps):

| Scenario | Real Flutter | Note |
|---|---|---|
| S1 build-local, `setState` writes a changing field | `[r=1, r=1, r=1, r=1]`, 5 builds | local resets every rebuild; `setState` rebuilds even for an equal value |
| S2 `inc, inc, show(setState(){}), inc, show` | after each `show`: `[r=2, r=1]` | closure keeps its binding *until* a rebuild; a bare `setState(() {})` rebuilds |
| S3 State field instead of a local | `[r=1, r=2, r=3, r=4]` | the idiomatic form of "mutable state that survives" |

**The candidate generated models**, hand-written (the source is refused by `BRG1311`, so nothing can
generate them), run on the real `react`, `react-dom` and `@bridge/runtime-react` `signal`/`useSignal` in
jsdom, plain and under `StrictMode` (identical results; only render counts double):

| Scenario | Flutter | A: per-render `let` | B: persistent cell |
|---|---|---|---|
| S1 | `[1,1,1,1]` | `[1,1,2,1]` ✗ | `[1,2,3,4]` ✗ |
| S2 (after each `show`) | `[2,1]` | `[1,2]` ✗ | — |

**Trigger facts** (observed by probe or execution, except the two marked *source*):

- `setState(() {})` compiles to an empty handler `() => {}`; a body that writes compiles to `x.set(…)`.
- `Signal.set` with an `Object.is`-equal value notifies nobody (`graph.ts:227`, ADR-20 R3; executed:
  `{"afterChange":1,"afterTwoEqualWrites":1}`).
- A State-field write **without** `setState` (`_result = _result + 1;`) compiles to `_result.set(…)` and *does*
  re-render; Flutter would not rebuild.
- *Source:* no `React.memo` in the generator or runtime: a parent render re-renders its children. Components subscribe only through
  `useSignal`, so a write repaints "the components that read it and nothing else" (runtime test, `react.test.ts`).
- *Source:* `reactStrictMode: true` is emitted (`project.ts`), so React double-invokes renders in development.
- Tested in-place mutations of State-held collections are refused loudly, never silently stale:
  `_items.add(1)` → `TS2339`; `_items[0] = 5` → `BRG3004`/`BRG3006`; a project-class field write → `BRG3013`.

## Decision

**D1 — The contract preserves the rendered result, not `build()` invocations.** FlutterBridge guarantees
that the rendered tree is a function of props, State-field (signal) values and inherited state. It does
**not** guarantee the count, timing, or identity of `build()` invocations. This is the contract ADR-20 already
implies (R3 value-equality cutoff, R6 one render per batch, fine-grained subscription) and the one M8-B
already relies on (Flutter's own requirement that `build()` be free of externally observable effects).

**D2 — A build-local has no lifetime.** It is a *name for an expression over the render's inputs*. It is
neither per-build nor per-render, because neither is a defined, observable unit. `Binding.inlineValue` is
its correct realisation, and read-only capture (of `final` or `var`, never written) remains supported.
The Dart lifetime (fresh per `build()` call) is deliberately **not** modelled.

**D3 — The generated re-render triggers are normative and differ from Flutter's.** A component re-renders
when (a) an `Object.is`-changing write reaches a signal it reads through `useSignal`, (b) its parent
renders, or (c) a provider it consumes changes (store, theme, router). No other trigger is part of the
contract (React may re-render for its own reasons, e.g. StrictMode; the contract does not depend on it). The
declared differences from Flutter:

| Flutter | Generated | Consequence |
|---|---|---|
| `setState(() {})` rebuilds | no-op | unobservable for a pure `build()` |
| `setState` writing an equal value rebuilds | no render (R3) | unobservable for a pure `build()` |
| a State-field write without `setState` does not rebuild | re-renders | Flutter's is a stale-UI bug; ADR-4 makes fields signals on purpose |
| one `setState` with N writes → one build | one render (R6) | equal |
| `const`/identical widgets skip a parent rebuild | re-render (no memo) | unobservable for a pure `build()` |

Rows 1, 2 and 5 are unobservable **unless the program observes `build()` invocations** — which a mutable
build-local captured by a callback does, and which no other construct in the supported subset is known to
do. Row 3 *is* observable and deliberate (the generated behaviour is the intended one); row 4 is equal.

**D4 — Mutation of a build-local stays unsupported, permanently under this contract.** `BRG1311` is not a
gap awaiting a feature; it is the contract's boundary. A program that mutates a build-local from a callback
depends on the very quantity D1 declines to preserve. Nothing is weakened; the diagnostic's own explanation
is unchanged by this ADR. The idiomatic, supported form is a State field mutated inside `setState`, whose
lifetime (per mounted instance, recreated on remount) *is* modelled by `ui.Component.localSignals`.

**D5 — The four representations are rejected, on evidence.**

- *Per-render `let`* — wrong (S1 `[1,1,2,1]`, S2 `[1,2]`). Also not target-neutral: a Vue `<script setup>`,
  Solid or Svelte component body runs once per instance, so "per render" is React's host model leaking into
  the UIR — the exact thing ADR-4 exists to prevent.
- *Persistent cell / lift to State field* — wrong (S1 `[1,2,3,4]`); it is a State field, and lifting every
  `var` is a prohibited cheat.
- *`sig.Signal` / `logic.Lit`* — the former is persistent (as above), the latter is the M11-G defect.
- *A UIR binding node alone* — necessary for any of them, sufficient for none: it supplies a slot, not a lifetime.

**D6 — What would reopen this**, i.e. the minimum a *faithful* implementation needs. All are required; the
list is deliberately not something a milestone can start on its own:

1. A spec-level (v3) decision that Flutter's rebuild schedule is normative, superseding D1.
2. An ADR-20 amendment adding a rebuild rule (`setState` forces a rebuild epoch even for equal writes),
   carried in UIR (e.g. a flag on `sig.Action`) — in tension with ADR-4's "no generator ever sees `setState`"
   and with R3, and undoing the State-field-write-without-`setState` behaviour in D3.
3. A per-component rebuild epoch in the runtime, with epoch-scoped cells for build-locals.
4. A build-scope binding slot in `ui.Component` (`l2.json`), so a local can be declared at all.
5. A reference interpreter that has components (ADR-20 requires the graph semantics to hold in an interpreter
   that has none) to state the semantics independently of React.
6. A target-neutral definition of "rebuild" for Vue/Svelte/Solid, whose component functions do not re-run.
7. Equivalence for parent-driven rebuilds and inherited-widget dependencies, which reduces to Flutter's widget
   identity/equality and has no bounded form.

Items 2, 6 and 7 are unbounded. The cost is not justified by the payoff: the only programs it rescues are
ones whose Flutter behaviour is a well-known anti-pattern (state lost on every rebuild).

**D7 — Schema.** The decision requires **no** schema change. Reopening under D6 would require two: a
build-scope binding slot (D6.4) and a rebuild flag on `sig.Action` (D6.2).

## Alternatives considered

Per-render `let`, persistent cell, lift-to-State, a `Signal`-typed binding, and a binding node without a
lifetime rule — see D5, each with the executed result above. Also rejected: making `BRG1311` a warning, or
emitting the write "best effort" — both produce output that runs and is wrong in a way no test written
against the Dart source would notice.

## Consequences

- The observable-equivalence contract is now written down; ADR-28 §10's exclusion of `inlineValue` is
  explained, not merely asserted.
- Future milestones may not propose build-local mutation, per-render bindings, or a rebuild flag without
  citing D6 and the spec-level decision D6.1.
- **Known deviation surface (D3)** is now enumerated. It is the checklist for any later claim of "behavioural
  equivalence" for a supported construct.
- Follow-ups recorded when this ADR was written, and what became of them (M11-I, plan Phases C–D):
  (a) *a clearer refusal for a build-level write* — the `<unknown>` was a generator defect (`BRG3004` read a
  field, `source`, that no producer writes; the schema's is `dartSource`), fixed, so the refusal now names the
  body and the frontend's reason. No analyzer error was added: a straight-line write inside one `build()`
  (`var total = 0; for (…) total += x;`) never crosses the boundary D4 describes, so `BRG1311` would misstate
  the contract; it is an unsupported statement shape and stays `ui.Opaque`. (b) *`BRG1311`'s explanation* —
  now states this contract, and the report carries a hint. (c) *the block-bodied `ListView.builder` drop* —
  the attribution was wrong (see `docs/m11/m11i-completion-audit.md` §D1); fixed as three separate defects.
- Limits of the evidence: the models are hand-written, not generated; jsdom, not a browser; a handful of
  scenarios, not a proof of equivalence. They are sufficient to *reject* A and B (a single counter-example
  each), not to accept anything.
