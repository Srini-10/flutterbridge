# ADR-11 — Cross-route state promotion (closes ISSUE-1)

- **Status:** Accepted (M0-T7). Amends Spec v2.0 §3.3 (normative pass list).
- **Date:** 2026-07-12
- **Supersedes:** ISSUE-1, open since M0-T3.

## Evidence

Three independent M0 tasks hit this, by three different routes:

| Source | Evidence |
| --- | --- |
| **M0-T3** (extraction spike) | `navigation[0].propsPassed` = `onToggleTheme: void Function()` crossing `Navigator.push`. |
| **M0-T4** (React reference) | The hand-written reference **could not pass it**. `login-screen.tsx` carries the comment marking the exact line where the closure dies; `app/layout.tsx` had to pin the light theme rather than invent a resolution. |
| **M0-T6** (compat report) | A separately written tool independently flagged it as **W01** at `login_screen.dart:55`, and found a second shape (**W02**, live objects as route arguments). |

`hello_bridge` — an app deliberately written *to the MVP subset* — contains this pattern. It is not an
exotic case; it is what prop-drilling looks like the moment a route boundary appears.

## Decision

**Option 1: a target-neutral normalization pass, `N11 promote-cross-route-state`.**

Options 2 (per-generator transforms) and 3 (exclude from MVP) are rejected:

- **Option 2** — every URL-routed target (React, Vue, Angular, Svelte) hits this *identically*. A
  closure cannot be serialised to a URL in any of them. Solving it per-generator means solving it N
  times, inconsistently — precisely the duplication ADR-1 exists to prevent.
- **Option 3** — excluding it would push a pattern that appears in our own MVP-subset fixture *out* of
  the MVP, and would force `bridge_lints` (M6) to ban prop-drilled callbacks across routes, which is a
  real and surprising constraint on users.

**No UIR schema change is required.** `sig.Signal.scope` is already `"component" | "store"` (Spec
§2.3). The fix is a rewrite within the frozen vocabulary, not an extension of it.

## The pass

| | |
| --- | --- |
| **Name** | `normalize.promote-cross-route-state` (N11) |
| **Layer** | L3 (+ L2 rewrites of readers) |
| **Position** | **Last in normalization**, after N1–N10. It must see closures already lifted to named actions (N5) and the final signal set. Runs before all analyses that consume the signal graph, and before any target transform. |
| **Requires** | `nav-graph` analysis (route transition edges + their argument bindings). Permitted: Spec §3.2 lets a pass declare `requires: AnalysisKey[]`; the pass manager computes the analysis on demand. `nav-graph` depends only on L3 route decls and navigation call sites, both available after LINK. |
| **Invalidates** | `nav-graph`, `reactivity-graph` |

**Inputs.** `app.Route` declarations; `nav-graph` transitions; `sig.Signal` nodes with
`scope: "component"`; `sig.Action` nodes; `ui.Component` params.

**Outputs.** For each route transition, examine every argument passed to the destination component:

1. **Function-typed binding referencing a `sig.Action`** (the `onToggleTheme` case) → promote the
   signals that action writes, and the action itself, into a synthesized `app.Store` with
   `origin: "promoted"`. Rewrite every reader/writer to reference the store. **Remove the argument**
   from the transition and the corresponding param from the destination component. Emit `BRG2302`
   (info) so the promotion is visible, never silent.
2. **Binding reading a component-scoped signal owned by a component not on the destination route**
   (the `isDark` case) → same promotion.
3. **A non-primitive data object** (the `arguments: product` case) → **not** promotion. See ADR-11a
   below.
4. **A primitive** → unchanged. Primitives cross a URL boundary fine.

**Failure behaviour.** If a callback closes over state that cannot be promoted — a `BuildContext`, a
non-signal local, an `Opaque` expression — the pass emits **`BRG2303` (error)** with the anchor and
routes the construct to the override system. It never drops it and never guesses.

**Interaction with existing passes.** N11 consumes N5's lifted closures (without them, a callback is
an anonymous expression with no action to promote) and runs after N10 so the theme signals it may
promote already carry token references. It invalidates `reactivity-graph`, which is recomputed before
the target transforms consume it.

**New invariant.** **INV-18** — after N11, no argument in a route transition may be of function type.
Checked in dev builds; a violation is a compiler bug, not a user error.

## ADR-11a — Route arguments carrying live objects (W02)

`Navigator.pushNamed(context, '/product', arguments: product)` passes a live Dart object. A URL route
carries an identifier, not an object graph.

**MVP behaviour: diagnose, do not transform.** Emit **`BRG2301`** (error) naming the argument, its
type, and the anchor. The developer passes an identifier and loads on the destination, or writes an
override.

Automatically lowering the object to a route parameter plus a data load on the destination would
require the compiler to decide *which field is the identity* and *which loader re-derives the object*.
We have no evidence supporting either inference. **Evidence insufficient — deferred.** Revisit
post-M2 with data from real applications; `bridge_lints` (M6) gains a rule so new projects never
create the shape.
