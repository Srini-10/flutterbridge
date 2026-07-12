# ADR-4 — Signal graph as the universal reactivity model

- **Status:** Accepted (frozen, Specification v2.0 §2.1, §2.3)
- **Date:** 2026-07-11

## Context

Every ui-realm target has its own reactivity system: React hooks, Vue `computed`, Svelte 5 runes,
Angular signals, SolidJS signals. Flutter has `setState`, `ValueNotifier`, `ChangeNotifier`, Riverpod,
and Bloc. Something in the middle has to be canonical, or every target re-derives Flutter's semantics
independently and inconsistently.

## Decision

State is modeled in UIR as a **signal graph**: `sig.Signal`, `sig.Derived`, `sig.Effect`, `sig.Action`,
grouped into `app.Store`. The **extraction contract** maps Flutter's idioms into it at extraction
time — `State` fields become component-scoped signals, `setState` bodies become actions,
`initState`/`dispose` become mount/unmount effects, `ChangeNotifier` classes become stores.

**No generator ever sees `setState`.** Hooks, `computed`, runes, and Angular signals are all
*lowerings* of the same graph.

## Alternatives considered

1. **Model React hooks in the IR.** Every non-React lowering becomes a translation of a translation.
2. **Keep Flutter idioms raw in the IR.** Every generator re-implements the same semantic analysis.

## Consequences

- Signals are the demonstrated convergence point of Vue, Svelte 5, Angular and Solid, and map cleanly
  from Notifier/Riverpod/Bloc — so the mapping is natural in both directions.
- React is, ironically, the **least** signal-native target. The mismatch is absorbed by the state
  facade in `@bridge/runtime-react` (`createStore`/`useSignal`/`useDerived` over
  `useSyncExternalStore`), not by the IR. This is a deliberate, accepted tradeoff.
- `react.lower-signals` is the highest-defect-risk pass in the platform (Blueprint §6, R3) and carries
  mandatory property tests against a reference interpreter of the signal graph.
