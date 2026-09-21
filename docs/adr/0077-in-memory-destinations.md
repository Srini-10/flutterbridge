# ADR-77 — In-memory destinations: a push carries live values, and the stack beneath it stays alive

- **Status:** Accepted (M14). Found by the normalizer-error inventory of a real application: 22 of its 23 normalizer errors (`BRG2305` ×21, `BRG2301` ×1 — `tools/normalizer-errors/inventory.mjs`) were the same defect seen from different call sites, and the 23rd was a different one (D4).
- **Date:** 2026-09-22

## Context

N11 (ADR-11) refuses a value that cannot cross a URL: a live object (`BRG2301`), a forwarded constructor parameter it cannot prove the type of (`BRG2305`), a closure it cannot put in a store (`BRG2303`). It applied that to **every** boundary.
But 12 of the 13 boundaries in the inventory were not URLs: `showDialog(builder: (_) => EditDialog(item: item))`, `showModalBottomSheet`, `Navigator.push(MaterialPageRoute(builder: (_) => Page(order: order)))`. Those are entries on the runtime's stack (§A17.6);
nothing is serialized, and the Flutter call carries `item` as it is. The generator could not express them either — it bound a destination's arguments into a module-level wrapper, which has no caller to read — so the refusal was *consistent*, and wrong.
The same real application showed that the runtime rendered only the top of the stack, so a push unmounted the screen beneath it.

## Decisions

**D1 — A boundary knows whether it is a URL.** `ComponentBoundary.inMemory` is true for a transition that constructs a component or an inline tree and names no route. N11 classifies through it: across an in-memory boundary a live object and a forwarded parameter are carried (no diagnostic), and so is a closure that cannot be
promoted; a closure that *writes component-scoped state* is still promoted, in either kind of boundary, because that is about the state outliving its component. A URL boundary is unchanged: `BRG2301`, `BRG2303`, `BRG2305` all still fire (mutation-tested both ways).
The "component forwards the parameter that promotion would remove" hazard still keeps the parameter; it is an error only when a URL boundary reaches the component.
**D2 — What only the call site can compute travels on the push.** `readsCallSiteState` (one predicate, used by both emitters) says an argument reads per-invocation state: a `bind.Param`, a `logic.Ref` no top-level node answers to (a parameter, a local), a closure, or a component's own
signal/action that N11 did not promote. The page module's wrapper carries the constants; `router.push({ kind: 'component', component, props: { … } })` carries the rest, evaluated in the calling component in the scope the Dart call was written in. `Destination.props` are live values, never serialized and never in a URL.
A widget argument is a `logic.WidgetExpr` (a JSX element), as it is anywhere else.
**D3 — The stack beneath the top stays mounted.** `RouterOutlet` renders every entry and hides all but the top (`display: none`, `aria-hidden`); a push mounts one screen, a pop unmounts exactly one. This is what a Flutter `Navigator` does — the route underneath keeps its `State`, its text fields, its in-flight futures — and rendering only the top
reset a counter to zero across push/pop and let a closure the destination held write into an unmounted component. Found by the browser test, not by any unit test: the fixtures that pushed constants and kept state in a store could not see it.
**D4 — `key:` is identity, not data.** A named argument whose *resolved parameter type* is Flutter's `Key` is not recorded on a route or transition (it names nothing on the destination); one that is merely spelled `key` and is not a `Key` is data and is kept.
**D6 — `go` is not `push`.** With the stack alive (D3), the model that had mapped `go_router`'s `context.go` / `goNamed` to `push` became visible: `go('/about')` left `/` mounted beneath `/about`, where go_router's declarative navigation makes the location the *whole* stack. `NavigateAction` gains `go`
(`logic.Navigate.action`, schema `l1.json`); the analyzer maps `go`/`goNamed` to it, the generator lowers it to `router.go(dest)`, and the runtime's `go` replaces the stack with one entry. `push`/`pushNamed`/`replace` are unchanged. Difference: go_router also builds the *parent* pages of a nested location (`/a/b` → `[/a, /a/b]`); this does not.
**D5 — `bridge generate` cannot ignore the normalizer.** It took `normalize(...).program` and dropped the diagnostics, so a program N11 refused went on to the generator; `bridge build` stopped and left the refused `normalized.ndjson` behind for `generate` to prefer. Now `generate` reports the normalizer's errors and writes nothing, and `build` removes a refused document.

## Documented differences

- **The result of a push is not modelled.** `await showDialog<String>(…)` / `Navigator.pop(context, value)` return values are a separate capability.
- **A component destination reached through `showDialog` / `showModalBottomSheet` is rendered as a screen, not as an overlay** (no scrim, no barrier dismissal); an inline framework dialog (`AlertDialog`) keeps its dialog host (M9).
- Props are evaluated when the push runs and are a snapshot: like Flutter's builder closure, a later change in the pushing screen does not re-invoke the push. State a closure writes, or that N11 promoted, is live.
- A `key:` on a route argument no longer remounts the page when it changes (the route entry is the identity).

## Evidence

`fixtures/apps/inline_push_dynamic` in Chromium (production and development): an owner parameter, a local, a live object, a widget and a state-writing closure reach the destination; a push and a pop preserve the pushing screen's state; a closure the destination calls writes the pushing screen's state.
Compiler unit tests for URL-vs-memory classification (two mutants killed), runtime outlet tests (stack alive, popped screen unmounted, hidden beneath, props passed by identity), analyzer tests for `Key` (a name-based mutant killed), CLI regression tests for D5.
