# ADR-0025 — The navigation model

- **Status:** Proposed — **not implemented**. M6-D is architecture validation only.
- **Date:** 2026-07-19
- **Confirms and extends:** [ADR-0024](./0024-performing-a-navigation.md) (its Option B, now with the
  evidence that decides it).
- **Amends:** Spec v2.4 §A17 (the navigation model); ADR-11 §a is re-cited correctly (see §9).
- **Evidence:** [`docs/m6/m6d-navigation-model-validation.md`](../m6/m6d-navigation-model-validation.md) —
  80 476 lines across six projects.

## Context

ADR-0024 established that imperative navigation and overlays are **one** blocker: nothing in UIR says
*perform this transition here*. It offered four options and recommended Option B (`logic.Navigate`), while
noting it could not choose on the evidence then available — *"the two apps that would show the pattern at
scale are not in this repository."*

They have now been measured. The evidence does three things: it **decides** between A and B, it **confirms**
that the model needs no larger redesign, and it **uncovers two gaps ADR-0024 does not cover**.

## The decision

Three additive amendments. No node kind is removed, no field changes type, no existing document becomes
invalid.

### D1 — `app.Route.arguments: RouteArgument[]` *(new field)*

Closes the declarative-route gap that `BRG3018` currently refuses (M6-C). Uses `RouteArgument` and
`RouteArgumentTransport` **unchanged** — no new `$defs` — which makes a declarative route and an imperative
transition answer the same question the same way. Optional.

### D2 — `logic.Navigate { transition?: NodeId }` *(new L1 node kind)*

ADR-0024's Option B. A **statement**: the analyzer replaces the navigation call with it, which is what
INV-22 already requires — `Navigator.pushNamed` is a framework runtime primitive and is surviving
extraction today in violation of that invariant.

`transition` is **optional**, and that is the whole reason this beats Option A:

| Form | Corpus | `logic.Navigate` |
| --- | ---: | --- |
| `push` / `pushNamed` / `pushReplacement` | 83 | `transition` names the edge |
| **`pop` / `popUntil` / `maybePop`** | **143** | **no `transition`** — §A17.3's "a return along an edge that already exists" |
| `showDialog` / `showModalBottomSheet` | 44 | an edge to an inline destination, like any other push |

**Option A (`site: NodeId` on `app.RouteTransition`) cannot express a pop at all** — §A17.3 rules that a pop
is not a transition, so there is no edge on which to hang a `site`. A pop is the single most frequent
navigation verb in the corpus, at 143 uses including `popUntil`/`maybePop`. That settles it.

### D3 — `app.RouteTransition.arguments` must be populated for `pushNamed`

**Not a schema change** — the field already exists and is already populated for inline destinations. It is
simply not extracted for the named form:

```dart
Navigator.pushNamed(context, '/b', arguments: {'id': '7'});
```
```json
{"kind":"app.RouteTransition","target":"9fc82d…"}          // ← no arguments
```

The map survives as an unattached `logic.MapLit`. This is an **extraction defect**, not an architectural
one, and it is listed here because ADR-0024 does not mention it and because the corpus's out-of-tree
navigation (§6) uses exclusively this form.

## What each of the brief's seven areas resolves to

| Area | Resolution | Cost |
| --- | --- | --- |
| **route constructor arguments** | D1 | one optional field |
| **`builder:`** | already correct — an inline destination is `app.RouteTransition.component` + `arguments`, and the analyzer emits it with full fidelity, transport included. Only the *performance* is missing → D2 | none beyond D2 |
| **overlay routes** | D2. Every Flutter overlay entry point pushes a `Route` (`DialogRoute`, `ModalBottomSheetRoute`, `_PopupMenuRoute`) — ADR-0024 verified this against the SDK. An overlay **is** a navigation to an inline destination | none beyond D2 |
| **imperative navigation** | D2 (+ D3 for named arguments) | one node kind |
| **`Navigator.pop`** | D2 with no `transition` | none beyond D2 |
| **nested navigation** | **deliberately not modelled yet** — see §6 | none |
| **future router packages** | **nothing to do** — see §5 |  none |

## §5 — Future router packages: the model is already package-neutral

C1 justified part of `app.RouteTransition`'s design on `go_router` being *"the dominant navigation shape in
real apps."* Measured across 80 476 lines: **zero** `GoRoute`, `GoRouter`, `context.go`, `auto_route`,
`beamer`, `fluro`, `routemaster`, and zero `Router`/`RouterDelegate`/`RouteInformationParser`.

This is not an argument to drop `go_router` support — it is an argument that the model must not be *shaped
around* any router package, because the corpus shows which package is popular is not stable enough to build
on. The three amendments here are stated entirely in terms of **what a navigation does** — name a
destination, carry arguments, perform, return — and never in terms of who provides the API. A `go_router`
`context.go('/x')` and a `Navigator.pushNamed('/x')` produce the same `logic.Navigate` + `app.RouteTransition`;
only the adapter that recognises the call differs, and adapters are catalog data under ADR-18.

**That is the property that lets this survive M7 and future generators**: the vocabulary describes
navigation semantics, not Flutter's navigation API.

## §6 — What this ADR deliberately does **not** decide

Two shapes are real in the corpus and are **not** modelled here, because deciding them on this evidence
would repeat the mistake C1 made.

### Out-of-tree navigation

```dart
notificationService.onReturnToCall = () {
  _navigatorKey.currentState?.pushNamed(route, arguments: {…});
};
```

No `BuildContext`, no widget callback, no component — a push-notification handler navigating through a
`GlobalKey<NavigatorState>`. But `app.RouteTransition.source` is defined as *"the component the navigation
happens from"*, and here there is none.

`logic.Navigate` (D2) is agnostic about this: it is a statement, and a statement in a top-level function is
still a statement. So D2 does **not** block on it. What is unresolved is what `source` means for such an
edge — plausibly it becomes optional, but 4 `GlobalKey<NavigatorState>` uses in one application is a
sample of one application, and `source` is load-bearing for N11.

**Recorded, not decided.** Revisit when a second application shows the pattern.

### Nested navigators

unichat's call screen holds `_localNavigator` and `_rootNavigator` and pops the local one first, falling
back to the root. UIR has one navigation graph and no concept of a navigator instance. Modelling it means
deciding what a nested navigator *is* — a scope, a component property, a second graph — on **one**
application's evidence.

**Not decided.** `logic.Navigate` does not preclude it: a navigator handle would become an optional operand
later, additively.

### `onGenerateRoute` — an opportunity, not a gap

`BRG1304` says such routes *"cannot be read into a static route graph."* True of an arbitrary function;
**false of the only shape the corpus uses** — a `switch` on string literals returning `MaterialPageRoute`s,
where every case label, destination component and argument key is a literal (report §2).

This ADR does **not** propose reading it. The refusal is correct today and guessing is what §A17.2 refused.
But the *stated cause* over-claims: it asserts impossibility where the honest statement is *this analyzer
does not read that shape yet*. Reading the literal-`switch` form is a well-defined future extraction feature
that needs **no schema change** — it produces ordinary `app.Route` nodes — and it would convert the corpus's
dominant router from invisible to fully modelled.

## §7 — Compatibility, migration, cost

### Compatibility

| Amendment | Existing documents | Schema hash |
| --- | --- | --- |
| D1 field | valid unchanged — optional | moves |
| D2 node kind | valid unchanged — nothing emits it yet | moves |
| D3 extraction | valid unchanged — populates an existing field | unchanged |

Both schema amendments are additive and optional, so a document written before them loads after them. The
schema hash moves once if D1 and D2 land together, which is the argument for landing them together. Every
consumer pins the hash (ADR-14) and `just codegen-check` enforces it, so a drift cannot go unnoticed.

**No generated output changes for any program that compiles today.** Every program these amendments affect
is currently *refused* (BRG3008, BRG3013, BRG3018), so the observable change is refusal → emission.

### Migration

**No user migration.** Three user-visible transitions, all in the direction of more working programs:

1. A route with constructor arguments: refused (BRG3018) → generated.
2. An imperative navigation or overlay: refused (BRG3008/BRG3013) → generated.
3. A route argument that is a **live object**: refused for the wrong reason → refused as **BRG2301**, for
   the right one. This is the only case where a user still has work to do, and it is the compiler telling
   the truth about a URL boundary a Flutter program never had to think about. It belongs in release notes.

### Implementation cost, by layer

| Layer | D1 | D2 | D3 |
| --- | --- | --- | --- |
| **Schema** | one field | one node kind | — |
| **Codegen** (both domains, ADR-18) | regenerate | regenerate | — |
| **Analyzer** | small — the route extractor already visits the construction expression it builds the route *from* | medium — recognise the call **by resolved element** (never by name, C1) and emit the node; catalog metadata under ADR-18, as `setState`/`notifyListeners` already are | small — read the `arguments:` argument that is already in hand |
| **Normalization** | N11 already classifies transports for `app.RouteTransition.arguments`; runs over the new field unchanged | none — `logic.Navigate` is not an edge, so the nav graph is unchanged | none |
| **Generator** | emit props on the route page; BRG3018 becomes the fallback rather than the standing behaviour | lower one node kind to `useRouter().push(…)` / `.pop()`; the kit's `Destination` union already mirrors §A17 | none |
| **Runtime kit** | none | **none** — `useRouter().push({kind:'route'\|'component'})` is implemented and tested (ADR-0024) | none |

The kit needing no change is the strongest signal that this is the right shape: ADR-19's descriptor
boundary was drawn correctly, and the missing piece really is only in the document.

### Diagnostics affected

| Code | After |
| --- | --- |
| BRG3018 | stops firing once D1 lands. `route_argument_positions_test.dart` is the tripwire that says so |
| BRG3008 | **restate now, independently of this ADR** — its "one push, in one fixture" premise is already false (report §5) |
| BRG3013 nav entries | stop firing once D2 lands |
| BRG3006 on `showDialog` | **should never have fired** — add capability entries for `showDialog` and `showModalBottomSheet`; today the two most frequent overlay calls in the corpus blame the user's program |
| BRG1304 | keep the refusal, soften the *stated cause* (§6) |
| BRG2301/2/3 | unchanged, and D1 makes 2301 reachable for declarative routes, which it is not today |

### Normalization impact

N11 reasons over `app.RouteTransition` edges and is **unaffected by D2**, because `logic.Navigate` is a
statement, not an edge. This separation is deliberate: overloading the edge with execution — Option A —
would have made every N11 traversal also a traversal of call sites.

D1 *extends* N11's reach rather than changing it: a declarative route's arguments become subject to the
same promotion and the same BRG2301/2302/2303 analysis that transition arguments already get. That is the
point — `home: HomePage(db: db)` passes a live object across a URL boundary and nothing tells the developer
today.

## Consequences

**Positive.** One node kind and one field close imperative navigation, overlays, pop, and route arguments —
four capabilities the corpus measures at 62 + 44 + 143 + 8 uses. The runtime kit needs no change. The model
stays package-neutral, which is what makes it survivable.

**Negative.** A new L1 node kind is a larger amendment than a field, and every generator must learn to lower
it. That cost is unavoidable: the alternative that avoids it (Option A) cannot express a pop, and Options C
and D were rejected by ADR-0024 as making the document say something it does not mean, or as exactly the
generator heuristic this project refuses.

**Deferred, explicitly.** Out-of-tree navigation and nested navigators are real and are not modelled. Both
are additive later; neither blocks D1–D3.
