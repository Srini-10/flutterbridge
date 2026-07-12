# ADR-15 — Module-level singleton stores are forbidden in generated output (SSR/RSC safety)

- **Status:** Accepted (M0-T7). Amends Spec v2.0 §5 (state runtime) and §10 (`gen-react`).
- **Date:** 2026-07-12

## Evidence (M0-T6, W03)

`shop_bridge` contains:

```dart
final CartStore cartStore = CartStore();   // lib/state/cart_store.dart
```

An idiom so ordinary in Flutter that it is unremarkable. In Flutter that singleton is **one user**. In
a Next.js server process, **a module is shared across every request**.

If a component that touches such a store is server-rendered, **one user can be served another user's
cart.** This is a correctness and privacy defect, not a styling one — and note that *no golden, no
pixel diff, and no visual verifier would ever have caught it*. It was found by static analysis, on the
first non-trivial application we pointed the tool at.

## Decision

**Forbidden in generated output. Rewritten by the generator. Linted at source.**

1. **Forbidden (INV-19).** Emitted code must contain **no module-scope mutable state**. A top-level
   `let`/mutable binding holding a store instance in generated output is a compiler bug.
2. **Rewritten (generator).** `app.Store` nodes are emitted as **provider-scoped instances** created
   per client root / per request via the runtime's state facade (`createStore`), never as module
   singletons. The state facade already has the shape required (Spec §5.4); this ADR makes the scoping
   rule normative rather than incidental.
3. **Marked (analysis).** Any component subtree that reads a store is **client-scoped**: the
   `rsc-safety` analysis (Spec §3.3) must treat a store read as disqualifying for server rendering, so
   the store can never be instantiated on a shared server module in the first place.
4. **Linted (`bridge_lints`, M6).** New projects get a lint on module-level `ChangeNotifier`
   instances — not because Flutter is wrong, but because the pattern silently changes meaning when the
   app is also a web app. Existing projects get a compat-report warning (W03), which is where it was
   found.

## Consequences

- The compiler cannot "preserve" this Flutter idiom faithfully, and **must not**: a faithful
  translation here is a security bug. This is the one place in the platform where we deliberately
  refuse fidelity.
- No UIR schema change: `app.Store` already exists; only its *instantiation scope* in the target is
  specified.
- A store-reading subtree cannot be a server component. That is a real, accepted cost in RSC coverage,
  and it is the correct trade.
