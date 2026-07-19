# M7-C — Conditional Transition Declarations

**Not implemented, and it should not be.** The milestone's premise — that path-based navigation is blocked
by the declaration invariant — is half right. The invariant *is* solvable, and the build trace below shows
exactly how. But two further findings say the work would unblock **nothing**, so it stops here.

> **§4 (blocker B) is now stale, and §3 (blocker A) has since been measured rather than predicted.**
> `71d9d93` read the `onGenerateRoute` switch, which is exactly what §5 asked for, so the corpus does now
> have a route table for a path to resolve against. The amendment was therefore re-attempted in full.
> **It still does not work, for §3's reason alone** — and §3 understated it. See **§8**, which supersedes
> §3 and §4.

---

## 1. Path-based navigation, measured (Phase 1)

Hand-written `lib/` Dart across every available project.

| Form | hello_bridge | continuum | unichat | **total** |
| --- | ---: | ---: | ---: | ---: |
| `pushNamed` | 0 | 0 | 13 | **13** |
| `pushReplacementNamed` | 0 | 0 | 0 | **0** |
| `pushNamedAndRemoveUntil` | 0 | 0 | 0 | **0** |
| `popAndPushNamed` | 0 | 0 | 0 | **0** |
| `initialRoute` | 0 | 0 | 0 | **0** |
| **`routes:`** | 0 | 0 | **0** | **0** |
| `onGenerateRoute` | 0 | 0 | 2 | **2** |
| `context.go` / `goNamed` | 0 | 0 | 0 | **0** |

**Thirteen calls. That is the entire path-based surface of the corpus** — against 59 inline `Navigator.push`
departures, which M7-B already made identifiable.

## 2. Builder ordering, traced (Phase 2)

Not assumed — read from `canonical_builder.dart`:

| Order | What happens | Route table known? |
| --- | --- | --- |
| 0 | external symbols declared (incremental) | no |
| **1** | **`_declare` walks every record, declaring every symbol** — eager and unconditional | **no** |
| 1.5 | `_routeIndex(records, context)` — needs `app.Route` symbols resolved, which Phase 1 just did | **built here** |
| **2** | `factory.build` — **`RawRouteRef` resolves here**, and an unmatched path drops the edge (BRG1308) | yes |
| 3 | canonical program order | yes |
| **4** | `GraphValidator` — the **BRG1207** sweep over every declared symbol | yes |

**A transition's symbol is declared at Phase 1; whether its path resolves is only known at Phase 2.** That
is precisely why M7-B withheld symbols from path destinations.

### Conditional declaration *is* legal — the ordering permits it

`_routeIndex` reads **only** `app.Route` records and their ids. It does not depend on transitions. So the
declare pass could legally be split:

```
1a. declare everything except transitions
1b. build the route index          ← only needs 1a's route symbols
1c. declare a transition's symbol only if its destination resolves
2.  build
```

BRG1207 stays untouched: a symbol that is never declared is never swept. No placeholder, no deferred
repair. **This part of the milestone is achievable**, and the trace above is the design.

## 3. Why it still would not work — blocker A

The transition's symbol is only half the binding. The `logic.Navigate` that names it must also disappear
when the edge does, and it cannot disappear alone.

`node_factory._value` propagates the `_unresolved` sentinel:

```dart
case RawList(:final List<RawValue> items):
  for (final RawValue item in items) {
    final Object? built = _value(item, owner, path);
    if (built == _unresolved) return _unresolved;   // ← one bad item kills the list
```

A `logic.Navigate` sits in a lambda's statement list, inside a `bind.Expr`, inside a `ui.Element`, inside a
`ui.Component`. `_unresolved` bubbles through every one of them, so **dropping the navigation deletes the
entire screen**. And the alternative path is worse: `resolve()` reports `BRG1201`, an *error*, so
`diagnostics.hasErrors` fails the whole build.

The sentinel means *"this node cannot be built"*, not *"omit this element"*. There is no third answer today,
and inventing one — silently deleting a statement from a callback — would be a compiler quietly changing
what a program does.

## 4. Why it would not matter anyway — blocker B

All 13 `pushNamed` calls resolve against a route table that **does not exist in extracted form**.

The corpus declares **zero** `routes:` maps. Its routing lives in `onGenerateRoute`, pointing at a static
function whose body is a `switch` on string literals — which `BRG1304` correctly refuses to read today, and
which is therefore invisible to the route index.

So even with §2 implemented perfectly and §3 solved, every one of the 13 would resolve to nothing and be
dropped by `BRG1308`. **The work unblocks zero navigations.**

## 5. What to do instead

**Read the `onGenerateRoute` literal-switch form.** M6-D §6 already identified it as *"an opportunity, not a
gap"*:

```dart
static Route<dynamic> generateRoute(RouteSettings settings) {
  switch (settings.name) {
    case '/chat':
      final args = settings.arguments! as Map<String, dynamic>;
      return MaterialPageRoute(builder: (_) => ChatScreen(
        conversationId: args['conversationId'] as String,
      ));
```

Every case label is a string literal, every destination is a named component. It is a route table written as
a `switch`, and reading it:

- needs **no schema change** — it produces ordinary `app.Route` nodes;
- makes the corpus's dominant router visible for the first time;
- **dissolves blocker B**, because the 13 paths then have something to resolve against;
- narrows `BRG1304` to the case it is actually true of — a function whose routes are *not* statically
  readable — rather than every `onGenerateRoute`.

Blocker A remains, and is only reached once a path can resolve *and* fail. It is the smaller problem, and
the right amendment for it is a droppable-element sentinel distinct from "cannot build" — but it should be
designed against a case that actually occurs, which today none does.

## 6. Deliverables

| Asked for | Delivered |
| --- | --- |
| implementation **or** architectural blocker | **blocker**, with the ordering trace that proves which half is solvable |
| updated builder documentation | §2 — the first written trace of the four build phases and where the route index sits |
| regression tests | none added; nothing changed |
| corpus validation | §1 |
| engineering report | this |

**Nothing was implemented and nothing was weakened.** BRG1207 is untouched, no symbol was emitted that could
disappear, and no heuristic was introduced.

## 7. What this milestone should be remembered for

**The premise was measured before it was built on, and it did not survive.** M7-B handed forward "path
navigation is blocked by the declaration invariant" as the next thing to fix. It is blocked by that — and
also by a propagation rule that would delete a screen, and also by there being no route table to resolve
against. Only the first was visible from where M7-B stood.

The measurement that settled it took one command. The implementation it would have justified would have
taken a milestone, and shipped code that unblocked nothing.

---

## 8. Re-attempted after blocker B dissolved — and blocker A is worse than §3 said

§5 asked for the `onGenerateRoute` literal switch to be read. `71d9d93` did it. Blocker B is gone: a
`pushNamed` in the corpus now has a route table to resolve against. That removes the reason not to try, so
the amendment in §2 was implemented in full and measured.

### 8.1 The ordering precondition holds, and it is structural

§2 showed the ordering *could* be split. It is better than that — the required order already holds, and not
by accident:

| Evidence | Where |
| --- | --- |
| A transition is emitted during the render walk | `component_extractor.dart` — `widgets.extract(rendered, …)` runs `TransitionExtractor.maybeExtract`, which calls `out.emit` |
| The component is emitted **after** that walk | same file — `out.emit(ui.Component …)` follows, and cannot precede it: `render` is a required field built *from* the walk |
| Emission order is preserved | `raw_node_emitter.dart` — `_records` is append-only; `records` returns it unchanged |
| Nothing re-sorts before the build | `extractor.dart:209` returns `out.records`; `canonical_stage.dart:42` passes it straight to `build` |

So a transition always sits at a lower index than the component whose tree contains the departure naming
it, and Phase 2 iterates in index order. **The edge's fate is decided before the departure that names it is
built.** This is a consequence of `render` being required, not of a walk order someone chose, so it does not
need a second pass to guarantee it.

### 8.2 The mechanism works. All three parts of it.

Implemented as specified: `declare(conditional:)` recording conditional symbols separately, the `BRG1207`
sweep skipping a conditional symbol whose node was dropped, and a reference to such a symbol resolving to
`_unresolved`. Conditionality is derived **structurally** — a record whose subtree contains a `RawRouteRef`
— rather than by node kind, because `RawRouteRef` is the compiler's only legitimately-failing resolution:
every other way a record fails to build is an *error*, and an error fails the build, so no symbol outlives
it to be swept.

Each part is load-bearing, shown by breaking it:

| Configuration | Result |
| --- | --- |
| baseline | `BRG1308` warning, screen intact, no departure emitted |
| **full amendment**, path *resolves* | **works** — `logic.Navigate.transition` = the edge's id |
| **full amendment**, path *does not resolve* | screen deleted, `BRG1207` **error** on `comp:…#Home` |
| amendment − the sweep exemption | `BRG1207` on `nav:lib/main.dart#0` *and* on `comp:…#Home` |
| amendment − the drop-on-reference | `logic.Navigate` survives with a **dangling** `NodeId` in the emitted graph |

Rows 4 and 5 are the point: the exemption does remove the transition's own `BRG1207`, and the drop does
prevent the dangling reference. **The amendment solves exactly the problem it was designed to solve.**

### 8.3 What it does not solve, measured

Row 3. `Navigator.pushNamed(context, '/nope')` inside `_HomeState.build`:

```
WARNINGS:   [BRG1308]
ERRORS:     [BRG1207 The declaration "comp:lib/main.dart#Home" is referenced,
             but no node with its id survived the build.]
COMPONENTS: []
TOPLEVEL:   []
```

§3 predicted "dropping the navigation deletes the entire screen". It does — and then the build **fails
anyway**, because the deleted screen is an ordinary declaration and `BRG1207` is right to say so. So the
amendment does not even achieve its own goal of keeping `BRG1308` a warning. The output is empty.

### 8.4 Why this cannot be fixed within the rules

**Conditionality is contagious upward; the exemption must not be.**

`_unresolved` means *this node cannot be built*, and `node_factory._value` propagates it to the owner,
transitively, until it reaches a node that survives. Here that is the `ui.Component`. Every declaration on
that path — the element, the component — is an **ordinary** declaration, and its disappearance is a genuine
hole. Keeping the build green would mean declaring *those* conditional too: stating that a screen may
legitimately vanish from the compiled application. That is precisely the weakening of `BRG1207` the
amendment forbids, and it would be a much larger one than the case it was meant to serve.

The alternative — a sentinel meaning *omit this element* rather than *this node cannot be built* — is the
one §3 already ruled out, and it remains ruled out: silently removing `Navigator.pushNamed('/nope')` from an
`onPressed` leaves a button that does nothing, reported only as a warning. That is the compiler changing
what the program does.

**So the blocker is not in the amendment. It is that `BRG1308` is a warning at all.** A path naming no
route is dropped and the build continues; a departure naming that path cannot be dropped without taking its
screen with it. Those two are consistent only while the departure does not exist — which is the state M7-B
deliberately left, and the state this restores.

### 8.5 What would actually unblock it

Not this amendment. Either:

1. **Make an unresolved path an error** (`BRG1308` → error, ADR required). The cascade stops mattering,
   because the build fails and emits nothing either way — and arguably it *should*: a program navigating to
   a route it does not declare is broken, and the compiler currently ships it with a warning. This is the
   smaller change and the honest one.
2. **Give a departure a representable "unresolved" form** — a `logic.Navigate` that records the path it
   could not resolve, so the node survives, the generator can refuse it by name, and nothing is deleted.
   That is a schema change, and it needs the diagnostic story designed with it.

Both are decisions about what the compiler should *mean*, not about how the builder should be arranged.
Neither is improvised here.

### 8.6 What shipped

Nothing in `lib/`. `BRG1207` is untouched, no symbol is emitted that could disappear, and no heuristic was
introduced.

One test changed. `transition_test.dart`'s "a path that matches no route is BRG1308, and the edge is
dropped" now also asserts that **`Home`, `Settings` and `App` survive** — the property the naive fix breaks,
which nothing pinned before. It passes today and fails with `ui.Component: []` the moment a path edge is
given a symbol, so the next attempt meets §8.3 immediately rather than at the end of a milestone.
