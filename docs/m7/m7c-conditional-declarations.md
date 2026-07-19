# M7-C — Conditional Transition Declarations

**Not implemented, and it should not be.** The milestone's premise — that path-based navigation is blocked
by the declaration invariant — is half right. The invariant *is* solvable, and the build trace below shows
exactly how. But two further findings say the work would unblock **nothing**, so it stops here.

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
