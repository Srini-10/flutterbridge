# ADR-0030 — ScaffoldMessenger / SnackBar presentation

## 1. The question

`ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved')))` is real, common Flutter
code. Today every reachable piece of it extracts cleanly, with **zero analyzer diagnostics** — `.of` is
an ordinary resolved `logic.Call`, `.showSnackBar` an ordinary `logic.MethodCall`, `SnackBar(...)` an
ordinary `logic.New`. Nothing is opaque; nothing is refused at analysis time. The refusal is entirely
generator-side, via `MISSING_CAPABILITIES`/`OVERLAY_MESSENGER`
(`packages/generators/react/src/internal/emit/unsupported.ts`), whose own comment already states the
reason no earlier ADR closes this: *"a snack bar is not in the widget tree and is not a route either; it
is enqueued on the nearest `ScaffoldMessenger`, which owns its queue, its lifetime and its dismissal.
That is a different construct from a route overlay and no ADR models it yet."*

This ADR makes that decision. It does not touch dialogs, routes, or general Material API support.

## 2. Why the existing constructs do not apply

**Not `logic.Navigate`.** ADR-0025's whole model is edges in a route graph: a push has a destination, a
pop returns along an edge that already exists. A snack bar pushes nothing — there is no route table
entry, no URL, no navigation stack effect of any kind. `showSnackBar` returns a
`ScaffoldFeatureController`, not a route.

**Not `app.RouteTransition.inline`** (ADR-0025 amendment, M9-D) either, for the same reason: that
construct exists specifically to give a route-shaped push (`showDialog`, `showModalBottomSheet`) an
inline destination. A snack bar is not pushed. `DialogHost` — one host per `RouteTransition.inline`
reached in a component, imperative `show()`/`close()`, exactly one instance shown at a time by
construction — is architecturally the wrong shape for what §3 below establishes is a **FIFO queue** with
possibly-transient, possibly-multiple pending items.

**Not a name-matched refusal kept forever.** The existing `OVERLAY_MESSENGER` entries in
`unsupported.ts` are correct as a *diagnosis*, but the milestone brief that produced them
(pre-M9) never had Flutter-semantics or reduction-ladder evidence behind it — this ADR supplies that
evidence and either authorizes a bounded subset or leaves the refusal in place with a better reason.

## 3. Flutter semantics this decision rests on

Established by direct evidence, not recollection — six real `flutter_test` widget tests, all passing,
run against the SDK actually installed in this environment (Flutter 3.47.0):

1. **Under default `MaterialApp` configuration there is exactly one messenger for the whole app.**
   `ScaffoldMessenger.of(context)` returns `identical()` instances regardless of how deep in the tree
   `context` comes from — confirmed with two `Builder`s at different nesting depths resolving to the
   same `ScaffoldMessengerState`. This is the same kind of structural shortcut M9-E found for
   `Navigator` (one Navigator under default config): it means FlutterBridge does not need to resolve
   *which* messenger a given `context` denotes, only whether the program uses more than one at all (see
   point 4).
2. **Sequential calls genuinely queue, FIFO, one visible at a time.** A second `showSnackBar` while a
   first is showing does not replace it or show alongside it; it becomes visible only once the first
   fully exits (confirmed by timing: at t+300ms only "first" is present, at t+5s "first" is gone and
   "second" has appeared). This is a real, load-bearing semantic difference from dialogs, which stack
   rather than queue.
3. **An explicit nested `ScaffoldMessenger(child: ...)` widget creates an observably separate scope.**
   `.of(context)` from inside that subtree resolves to a *different* `ScaffoldMessengerState` than the
   app-level one (confirmed via `GlobalKey` identity comparison). Point 1's shortcut is conditional on
   no such widget being present anywhere reachable.
4. **`SnackBarAction.onPressed` fires and Flutter auto-dismisses the snack bar afterward, with no
   dismiss call required from the developer.** Confirmed: the callback ran, and the snack bar was gone
   after settling, with nothing in the test's own code calling anything to dismiss it. This is simpler
   than the AlertDialog-action problem M9-E had to solve — no scoped-dismissal machinery is needed here
   at all.
5. **Default duration is 4000ms**, overridable by `duration:` — confirmed by timing (still present at
   3.5s past entrance, gone comfortably after 4s plus exit animation). This is `dart:core`'s `Duration`,
   the exact representation already lowered for M7-L's `Future.delayed` and read by M8-V's own
   getter-lowering (`Duration.inMilliseconds`) — reused unmodified, not reinvented (§9).

## 4. The three sub-gaps, evidence-separated

- **Gap A — `ScaffoldMessenger.of(context)` recognition.** Currently an ordinary, fully-resolved
  `logic.Call{callee: logic.Ref{name:"ScaffoldMessenger.of"}, type:{library:"package:flutter/widgets.dart",
  name:"ScaffoldMessengerState"}}`. No opacity. **Resolvable generator-side, by resolved type — see §6.**
- **Gap B — `.showSnackBar(...)`/`.hideCurrentSnackBar()`/`.removeCurrentSnackBar()`/`.clearSnackBars()`
  semantics.** Each an ordinary `logic.MethodCall` on a receiver whose resolved type is
  `ScaffoldMessengerState`. Confirmed (reduction-ladder rungs G1, G7, G8, G9) clean and diagnostic-free,
  and (G13) that this resolved-type recognition **survives one level of local-variable indirection**
  (`final messenger = ScaffoldMessenger.of(context); messenger.showSnackBar(...)`) — recognition does not
  depend on the chained-call shape. **Resolvable generator-side, by resolved type — see §6.**
- **Gap C — `SnackBar(...)`'s own content.** This is the one gap that is genuinely structural. As a plain
  constructor-call argument (never a widget-tree position), `SnackBar(...)` extracts as generic
  `logic.New`, and — rung G10 proves this generalizes to the *entire* content subtree, however deep
  (`Row`/`Icon`/`Text` inside a `SnackBar.content` all stayed `logic.New`, never `ui.Element`, despite
  each having full catalog/widget-tree support in an ordinary `build()` position). `WidgetExtractor` is
  simply never invoked from this argument position today. **This is the one change that requires
  analyzer-side work — see §7.**

## 5. Options considered

- **A — a new presentation/effect statement modelling the queue in the schema.** Rejected: the queue is
  a *runtime lifetime* concern (ordering, timers, auto-advance), not a structural fact about the program
  the schema needs to encode. Every rung that matters (G1–G9, G13) already extracts as fully-resolved,
  ordinary logic nodes with complete type information — there is no missing *fact*, only a missing
  *lowering*. Modelling a queue at the schema level would be new abstraction surface with no
  proven contradiction behind it (CLAUDE.md §Hard rules 1).
- **B — a general "presentation node" covering dialogs and snackbars alike.** Rejected for the same
  reason M9-D/M9-E never merged dialog/route machinery with anything queue-shaped: a route overlay
  stacks, a messenger overlay queues. Forcing one representation onto both either loses the queue or
  invents stack semantics no dialog has. §2 above is the direct evidence.
- **C — reuse `app.RouteTransition.inline`/`DialogHost`.** Rejected on direct evidence: `DialogHost` is
  one host per transition, imperative show/close, exactly one instance — structurally incompatible with
  a FIFO queue of possibly-several pending snack bars (§3.2).
- **D — a runtime service call, recognized generator-side by resolved type, no new schema statement.**
  **Selected**, for Gaps A and B. Direct precedent: `Future.delayed(Duration(...))` (M7-L) is recognized
  entirely generator-side — by the node's resolved type (`dart:async#Future`, constructor `delayed`) —
  with no dedicated analyzer-side UIR node at all; the analyzer left it as a completely ordinary
  `logic.New`. The M8-V numeric-method recognition (`receiverType === 'int' && method === 'toDouble'`)
  is the same pattern one level up: type-plus-name, anchored to the *resolved* type, never source text.
  The reduction ladder (§ below, G1–G9, G13) proves the SnackBar call family is exactly this shape today.
- **E — generator special-case recognition by source name.** Rejected outright — this is precisely what
  "resolved identity, never name matching" forbids, and rungs G11/G12 exist specifically to prove the
  distinction is needed: a project-defined `ScaffoldMessenger`/`showSnackBar`/`.of` resolves to a
  *different* library (`package:app/...`) and must never be confused with the real Material ones.
- **F — map to dialog/modal.** Rejected; re-proven wrong by §2/§3 above (no route, no stack, queue not
  stack, no scoped-dismissal problem to solve at all — SnackBarAction auto-dismisses).

## 6. Decision — Gaps A/B: generator-side resolved-type recognition, no new statement node

`ScaffoldMessenger.of`, `showSnackBar`, `hideCurrentSnackBar`, `removeCurrentSnackBar`, and
`clearSnackBars` are recognized **only** by the resolved static type of their receiver
(`package:flutter/widgets.dart#ScaffoldMessengerState` for the messenger; the constructed type
`package:flutter/widgets.dart#SnackBar` for the argument) plus the literal method/constructor name on
that resolved type — the exact pattern already used for `Future.delayed` and for M8-V's numeric-method
family. **No new `logic.*` node kind, no new schema field, is introduced for the call chain itself.**
This is deliberately the smallest change that the evidence supports: every fact the generator needs
(receiver type, method name, argument shapes) is already present, fully resolved, in the existing
generic `logic.Call`/`logic.MethodCall`/`logic.New` nodes.

A project-defined lookalike (G11: a project's own `ScaffoldMessenger`/`showSnackBar`; G12: a project's
own unrelated `.of(context)`) resolves to a different library and is untouched by this recognition —
verified directly, not assumed.

## 7. Decision — Gap C: minimal, additive schema field, real widget-tree extraction for `content` only

When (and only when) the recognized shape holds — receiver resolved to `ScaffoldMessengerState`, method
`showSnackBar`, and the sole argument is a **direct inline** `SnackBar(...)` construction (never a stored
reference — see §8, rung G17) — the analyzer extracts that `SnackBar`'s `content:` argument through the
real `WidgetExtractor`, the same "ambient hook, set before, restored after" idiom `TransitionExtractor`
uses for `presentingTransition` (M9-D), but **new and separate**, not a reuse of `TransitionExtractor`
itself — this is not a route/transition concept, and routing it through the transition machinery would
risk the same kind of unvalidated side effect M9-F deliberately avoided by not routing widget-tree scope
through `Scope.forBody`.

Schema change (additive only, mirroring `ui.List.itemDecl` (M9-F) and `logic.Navigate.dismisses` (M9-E)
— a new optional field on an existing, already-generic node, never a replacement):

- `l1.json`'s `logic.New` gains one new optional field, `presentedContent: NodeId`, present **only** on
  a `SnackBar`'s own `logic.New` node when its `content:` argument was extracted through real
  widget-tree extraction under the recognized shape above. It points at a `ui.Element`. Absent in every
  other use of `logic.New` anywhere in the compiler — this field means nothing outside this one
  recognized shape, exactly the discipline `bind.Param.target` (M9-F) already established: additive,
  narrowly-scoped, silent everywhere else.
- `action:` and `duration:` need **no schema change** — G3 and G4 already prove they extract cleanly as
  ordinary `namedArgs` on the (unmodified) `SnackBar`/`SnackBarAction` `logic.New` nodes. `action:`'s own
  `SnackBarAction(...)` is *not* routed through `WidgetExtractor` — it is not rendered as a tree child in
  the generated output at all (it becomes `label`/`onPressed` props on the host call), and G4 already
  shows its `label`/`onPressed` extract correctly via the ordinary mechanism, `onPressed`'s lambda body
  included. The `SnackBar` catalog entry's existing `action` slot notation
  (`catalog/widgets/material.json`) is not exercised as a widget-tree slot by this decision; `SnackBarAction`
  gets no catalog entry.
- `emit/validation.dart` gains one validation rule: when present, `presentedContent` must resolve to a
  `ui.Element` — the same pattern `dismisses` (M9-E) already validates against `app.RouteTransition.inline`.

If the recognized shape does not hold (indirect reference, G17) or content extraction hits an unsupported
widget anywhere in the subtree (G10 proves the subtree can be arbitrarily deep — `WidgetExtractor`'s own
existing refusal machinery applies recursively, for free, exactly as it already does for an ordinary
`build()` tree), the call is refused with a diagnostic naming the reason — never silently degraded to a
generic, unrendered `logic.New`.

## 8. What this authorizes

The narrow, evidence-backed subset — every one of these confirmed clean and unambiguous by direct probe
against the real analyzer (reduction-ladder rungs in parentheses):

- A **direct inline** `ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: ..., action: ...,
  duration: ...))`, at any call site, including through **one level** of local-variable indirection on
  the messenger itself (G1, G2, G3, G4, G13).
- `content:` — any widget subtree `WidgetExtractor` already supports elsewhere (G10 — extraction is
  recursive and reuses the exact same catalog/refusal machinery every other widget position uses; a
  `content:` containing something `WidgetExtractor` cannot yet render is refused, not silently degraded).
- `action:` — a direct inline `SnackBarAction(label: ..., onPressed: ...)`, `label`/`onPressed` only
  (G4, G16 — see §11 for the required allowlist).
- `duration:` — a `Duration(...)` literal, reusing the existing representation exactly (G3, §3.5, §9).
- `hideCurrentSnackBar()`, `removeCurrentSnackBar()`, `clearSnackBars()` — zero-argument calls on a
  resolved `ScaffoldMessengerState` receiver (G7, G8, G9). Each lowers to the host's own corresponding
  queue operation (§10).
- Multiple sequential calls, including inside ordinary control flow like a `for` loop (G5, G6) — these
  are just ordinary statements; the runtime's own queue (§10) is what gives them correct FIFO behavior,
  not anything the analyzer needs to count or reason about statically.

## 9. Duration — reused, not reinvented

`SnackBar.duration` is `dart:core`'s `Duration`, extracted exactly as it already is everywhere else in
this compiler (`logic.New{typeName:'Duration', type:{library:'dart:core', ...}}` — G3 confirms this
resolves with no stand-in needed). The generator reads it the same way `delay()` (M7-L) already does —
`duration.inMilliseconds` off the kit's own `Duration` class (`packages/runtimes/react/src/internal/widgets/animation.ts`)
— no new duration representation, no raw-millisecond special case. Absent `duration:`, the host uses
Flutter's own default (4000ms, §3.5).

## 10. Generator / runtime contract

- **Ownership: root-scoped, single instance, by construction.** §3.1's evidence licenses treating the
  application as having exactly one snack-bar host, declared once at the application shell (mirroring
  where `shell.ts`'s own comment says `MaterialApp`'s consumed concepts already land — the Next.js App
  Router layout/providers layer), **not** a global mutable module-level variable — a React context
  Provider owning the queue's own state, matching this codebase's existing `useSignal`/context-based
  patterns rather than inventing a new state-management idiom.
- **No nested-messenger semantics.** §3.3 proves an explicit nested `ScaffoldMessenger(child: ...)`
  widget creates an observably different messenger, and reduction-ladder rung G14 proves the analyzer
  has **no structural way to link a `.of(context)` call site to enclosing widget-tree ancestry** — the
  nested widget and the descendant's call are structurally disconnected today, with no shared id, no
  scope annotation, and the analyzer's own single-walk-per-file design (`extractor.dart`'s own "one
  walk" invariant) rules out a second, order-dependent AST pass to reconstruct one. Per the milestone's
  own instruction to refuse rather than guess when ownership cannot be proven, this is checked
  **generator-side**, not at analysis or emit-validation time: the generator already sees the whole
  document before lowering any one node (the same document-wide view `declareDialogHosts`, M9-E,
  already scans), so **if a `ui.Element` whose `component` is `ScaffoldMessenger` exists anywhere in
  the document, every recognized `showSnackBar`-family call is refused**, with a diagnostic naming the
  reason. This is coarse (whole-document, not per-call-site) because per-call-site ownership is what is
  actually undetectable; a coarser, provably-safe rule is preferred over an unsound precise-looking
  one. It is a refusal of the specific call (the existing `MISSING_CAPABILITIES` idiom), not a hard
  analyzer error that would block the whole document from being emitted — `presentedContent` is still
  set unconditionally by extraction whenever the call shape is recognized (§7); this check happens only
  when the generator is about to consume it.
- **Queue: real FIFO, one visible at a time, matching §3.2.** A plain array of pending presentations in
  the host's own state; `showSnackBar` enqueues and — if nothing is currently showing — presents
  immediately; on dismissal (timeout, or the swipe/close affordance §16 defers, or an action tap) the
  host advances to the next queued item, if any.
- **Duration-driven dismissal**: a `setTimeout` keyed to the presented item's own duration (§9),
  cleared and re-armed on each transition; **not** an animation-driven mechanism, so no reliance on
  CSS transition end events for the *timing* half (only for the exit-transition's own visual half, which
  this milestone does not attempt — see §12).
- **`hideCurrentSnackBar`/`removeCurrentSnackBar`/`clearSnackBars`** lower to the host's own
  corresponding methods: advance-with-animation, advance-immediately, and clear-the-whole-queue,
  respectively (§3's own semantics, reused as the runtime's contract — not reinvented).
- **Unmount**: the host is declared once, at the application root, and is not itself subject to the
  per-component mount/unmount lifecycle any individual screen has — matching Flutter's own behavior
  (the messenger's lifetime is the `ScaffoldMessenger`'s own State, not any individual screen's).
- **Strict Mode / duplication audit (mandatory per the milestone brief).** The enqueue happens at the
  **call site** — inside whatever event handler the generated `onClick`/`onPressed` lowers to — never
  inside a `useEffect` or a component's own render body. React 18 Strict Mode's intentional
  double-invocation applies to render functions and effects; it does **not** re-invoke an event handler
  that already ran once in response to a real user (or test) event. One triggering event therefore
  produces exactly one enqueue, by construction, with no de-duplication logic needed to make this true —
  confirmed by inspecting the mechanism's own shape (call-site imperative enqueue, no effect in the
  path), not merely asserted. The build-proof's own fixture (§14) still includes an explicit two-events
  → two-snackbars-in-order assertion as a regression guard, run under the generated app's real dependency
  set (React 18), rather than resting on this argument alone.

## 11. SnackBarAction — supported, narrowly

§3.4 establishes Flutter auto-dismisses on action tap with no explicit call from the developer — simpler
than M9-E's dialog-action problem, which needed a whole dismissal-scope mechanism. `label`/`onPressed`
lower directly (G4: `onPressed`'s body extracts as an ordinary, fully-resolved lambda, wired into the
enclosing component's scope exactly like any other inline callback). The generator enforces an explicit
allowlist over `SnackBarAction`'s own `namedArgs` keys (`label`, `onPressed` only) and refuses — does not
silently drop — anything else (§12: rung G16 proves the analyzer captures `textColor` and every other
property faithfully; the generator is the only layer that can refuse it).

## 12. What this explicitly refuses

- **`content:`/`action:` beyond a direct inline literal** — a stored `SnackBar`/`SnackBarAction`
  reference (`final bar = SnackBar(...); ...showSnackBar(bar)`) is refused (G17: no back-link from the
  `logic.Ref` at the call site to the `VarDecl`'s own initializer exists anywhere else in this compiler;
  building one is new dataflow-tracing work with no precedent, out of scope here).
- **Any `SnackBar`/`SnackBarAction` named argument outside the allowlist** (`content`, `action`,
  `duration` / `label`, `onPressed`) — refused explicitly, not silently dropped (G15, G16).
- **Any application that constructs a `ScaffoldMessenger` widget anywhere** — refused wholesale (§10);
  this milestone ships root-messenger-only support.
- **Visual/animation fidelity** — the exit/enter transition, swipe-to-dismiss gesture, and Material's
  own snack-bar surface treatment are not attempted here, the same "structural capability, not pixel
  fidelity" boundary `DialogHost`'s own file states for dialogs.
- **The `showSnackBar` return value** (`ScaffoldFeatureController`/`.closed`) — deferred, the same way
  M9-E deferred `showDialog`'s own return value. Fire-and-forget usage only.
- General Material API support, route navigation work, arbitrary overlay support, or a general
  notification/toast framework — none of that is this milestone's scope.

## 13. Migration / versioning

Purely additive: one new optional field on `logic.New` (§7), meaningless and unset on every existing
document. No consumer that does not look for `presentedContent` observes any change. `just codegen-check`
enforces the generated schema types stay in sync; no other package needs migration.

## 14. Evidence this rests on

- Six real `flutter_test` widget tests against the installed Flutter 3.47.0 SDK (§3), throwaway, not
  committed.
- An 18-rung reduction ladder (G1–G18) run against the real analyzer via a throwaway
  `dart/bridge_analyzer/test/` probe, following the established `extraction_test.dart`/
  `transition_test.dart` harness pattern, not committed.
- Direct reading of `packages/generators/react/src/internal/emit/expression.ts` (the `Future.delayed`/
  M7-L precedent and the M8-V numeric-method precedent), `unsupported.ts` (`OVERLAY_MESSENGER`'s own
  prior reasoning), `packages/runtimes/react/src/internal/widgets/dialog.ts` and `shell.ts` (why
  `DialogHost` does not apply, and the existing "shown by an imperative call" framing), and
  `catalog/widgets/material.json` (the pre-existing `SnackBar` catalog entry and its `content`/`action`
  slots).

## 15. Provenance

FlutterBridge remains the sole development target. No corpus application drove this decision; the
evidence is real Dart/Flutter-SDK behavior and the real analyzer's own output on synthetic, generically-
named probes, per the standing project boundary (`CLAUDE.md`).
