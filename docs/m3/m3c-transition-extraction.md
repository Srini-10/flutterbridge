# M3-C — RouteTransition extraction

**Date:** 2026-07-17. **Milestone:** M3-C. **Scope:** the analyzer only — no generator, no runtime, no
schema change.

## Summary

The compiler pipeline N1–N11 was complete and green, but the analyzer emitted `app.Route` *declarations*
and never an `app.RouteTransition`. The nav graph had nodes and no edges; N11 (`promote-cross-route-state`,
ADR-11) had never fired on any real program. M3-C closes that gap: **the analyzer now emits route
transitions from real navigation call sites, and N11 promotes across them.**

| | before M3-C | after M3-C |
| --- | --- | --- |
| `app.RouteTransition` nodes emitted | **0, ever** | one per navigation call site |
| nav APIs recognised | recognition built, unused | `Navigator.push/pushReplacement/pushNamed/pushReplacementNamed/popAndPushNamed`, `context.go/push/replace` |
| N11 promotions on a real program | never | **yes** — a component-scoped signal crossing a push (§ "A real promotion") |
| analyzer tests | 185 | **205** (+20, `test/transition_test.dart`) |

## What already existed, and what M3-C added

The v2.4 §A17 groundwork (commit `9ecf84e`) built the **recognition** half and left the **consumer** half
for this milestone. What was already there:

- `TransitionAdapter.claimsTransition` / `transitionOf`, and both adapters' implementations
  (`material_adapter.dart`, `gorouter_adapter.dart`) — including pop-is-not-an-edge, the `arguments:`
  object refusal, and dynamic-path refusal.
- `AdapterRegistry.transitionOf` dispatch, `TransitionDeclaration` / `TransitionArgument`.
- `BRG1307` and the emit-time exactly-one-of-`target`/`component` check
  (`emit/validation.dart#_checkTransitionDestinations`).
- The schema itself: `target` optional, `component` added (§A17.3).

**Nothing consumed any of it.** There was no `transition_extractor.dart`, the `_ConstructionVisitor`
only visited `InstanceCreationExpression` (routes/tokens), and a navigation is a `MethodInvocation`. So
M3-C is the consumer:

- **`session/extract/transition_extractor.dart`** (new) — turns a `TransitionDeclaration` into an
  `app.RouteTransition` record: resolves the destination, binds the arguments, records the source.
- **The hook** — `ExpressionExtractor._invocation` offers every method invocation to the transition
  extractor. This is where a navigation is reached *with the scope its arguments bind against*, which a
  standalone construction walk does not have (`HomeScreen(isDark: _isDark)` is a signal read only if the
  scope says `_isDark` is a signal). Wired through a `TransitionHook` typedef to avoid an import cycle.
- **`source`** — `ComponentExtractor` tells the transition extractor which component it is inside, so a
  transition records where the navigation happens from.
- **Named-route resolution** — a new `RawRouteRef(path)` and a builder-side `RouteIndex`
  (`builder/route_index.dart`) resolve a concrete navigation path to the `app.Route` it lands on, across
  files and across parameterized routes. A path that matches no route is `BRG1308` (new, warning), and the
  edge is dropped rather than pointed at a route that is not there.

## The two destination shapes (§A17)

- **Inline `MaterialPageRoute`** → `component`, resolved from the destination widget's *static type* to
  the library that declares it — the same resolution `app.Route.component` uses. A push to a widget the
  project does not declare (a framework `Text`, a package widget) is `BRG1304` and drops the edge.
- **Named / path navigation** (`pushNamed`, `context.go`) → `target`, an `app.Route` resolved by the
  `RouteIndex`. Matching is the router's own rule, not a guess: an **exact** path wins, otherwise a single
  **`:param` pattern** match (`/item/42` is served by `/item/:id`). No match, or an ambiguous one, is
  `BRG1308`.

## Arguments

Each argument is `{name, transport, binding}`. The binding is classified in scope exactly as any widget
prop is — `bind.Const` for a literal, `bind.Signal` for a component-signal read, `bind.Param` for a prop,
`bind.Expr` otherwise — which is what lets N11 tell a primitive that crosses a URL fine from a signal it
must promote. `transport` is `primitive` on emit (the N11-test convention); N11 is the pass that decides
what becomes of an argument across the boundary and strips the promoted ones. An argument whose value has
no UIR node is **omitted and reported (BRG1302), never serialized as a Dart source string** — a route
argument a generator cannot pass to anything.

## Corpus validation

### hello_bridge — one edge, extracted; no promotion, honestly

`bridge_analyzer` on `fixtures/apps/hello_bridge` now emits **31 records (was 30): the one added record is
the `app.RouteTransition`** for `login_screen.dart`'s `Navigator.push`. It survives N1–N11 unchanged in
shape (`component` → HomeScreen, `source` → LoginScreen, two arguments).

**N11 does not promote on it — and that is correct.** The push passes `isDark: widget.isDark` and
`onToggleTheme: widget.onToggleTheme`. Both are **forwarded props** (`bind.Expr` over
`logic.PropertyAccess` on `widget`), which N11 rightly treats as primitives: `LoginScreen` is handing on
values it was itself given, not originating state at this boundary. The state that genuinely needs
promoting — `_BridgeAppState._isDark` (a signal) and `_toggleTheme` (an action) — crosses into the routed
screens at `main.dart`'s `home: LoginScreen(isDark: _isDark, onToggleTheme: _toggleTheme)`, which the
frozen model records as a **route declaration**, not a transition. So there is no route *transition* in
`hello_bridge` that carries promotable state, and no honest extraction makes one appear. See the finding
below.

### A real promotion, end to end

To show the extraction produces N11-promotable output, a minimal app (a screen with a component-scoped
`int _count` that pushes `Detail(count: _count)`) was run through the full pipeline:

```
analyzer  → app.RouteTransition{ component: Detail, arguments: [ count: bind.Signal(_count, scope: component) ] }
normalize → N11 fires:
              • app.Store{ name: PromotedStore, origin: promoted, signals: [_count] }
              • _count.scope: component → store
              • the transition's arguments are stripped
              • BRG2302 (info): promotion is never silent
```

This is the first N11 promotion to fire from real Dart, through the real pipeline. The fixture's sources
are in the M3-C scratch area (not committed); the shape it asserts — `bind.Signal` on a component-scoped
signal — is covered by `test/transition_test.dart` so the property is regression-guarded in CI.

## Determinism and incremental equality

Transitions get **content-addressed ids** (no symbol), so identical navigations are one node and every id
is a function of stable inputs (route ids, component ids, signal ids — all symbol-derived; spans excluded).
`test/transition_test.dart` proves same-source → same-bytes and clean-build ≡ incremental-build for a
program with a transition. One call site is one edge even when its enclosing method is walked twice (a
`build` that both renders and, because a callback it creates writes a signal, reads as an action): the
extractor dedupes by AST identity.

## Tests

`test/transition_test.dart` (20 tests): inline `MaterialPageRoute` → component; constructor arguments
(`bind.Const`/`bind.Signal`); a push to an undeclared widget (BRG1304); `pushNamed` /
`pushReplacementNamed` / `popAndPushNamed` → route; an unresolved named route (BRG1308); a runtime route
name (BRG1304); `context.go` → exact route; `context.push` → parameterized route; `context.replace`; a
runtime path (BRG1304); `Navigator.pop` and `context.pop` → no edge; a component-signal argument is a
`bind.Signal` (the promotion shape); a callback argument is captured; an unrepresentable argument is
omitted + BRG1302; `source`; determinism; incremental equality.

## Findings (implementation issues, not redesigns)

1. **`hello_bridge`'s promotion does not flow through a transition.** Its only navigation forwards props;
   the promotable state crosses at the `home:` route *declaration*. Making `hello_bridge` promote would
   require modelling a route's initial component-construction arguments as a transition edge (an app-shell
   → home entry). That is a deliberate model extension beyond §A17's enumeration (which counts only
   navigation calls) and belongs in an ADR, not in this consumer. **Surfaced, not worked around.**
2. **N11's callback-promotion path (case 1) is unreachable from real extraction.** It requires an
   argument bound to `logic.Ref{target: <sig.Action>}`, but the extractor does not put actions in scope,
   so a method tear-off (`onToggleTheme: _toggleTheme`) yields a `logic.Ref` with no `target`. Only the
   **signal** promotion path (case 2) fires from real code today. Recorded as an extraction gap.
3. **Cross-file named routes under *incremental* builds.** The `RouteIndex` is built from the pass's
   records; a route in a file the incremental build took from cache is not in it, so a cross-file named
   transition would drop (BRG1308) on an incremental build where it resolved on a clean one. `hello_bridge`
   is unaffected (inline component, no named routes). Recorded.
4. **go_router `*Named` navigations** (`goNamed`, `pushNamed`) are already refused by the adapter
   (BRG1304): resolving a route *name* needs the `name:` of every `GoRoute`, which the adapter does not yet
   record. Pre-existing, unchanged.

## Deferred: the committed golden refresh

`fixtures/uir/hello_bridge.ndjson` and `.normalized.ndjson` (the M3-B artifacts) still reflect the
pre-M3-C output. Refreshing them to include the new transition line was **left out on purpose**: the react
generator's test reads the normalized golden and hard-codes `expect(nodes.length).toBe(32)`
(`packages/generators/react/tests/generate.test.ts`). Regenerating the golden forces that assertion to 33,
which is a change inside `packages/generators/` — and M3-C's rule is *no generator work*. The refresh (and
its one-line test-count update) is a deliberate, separate follow-up. The regenerated documents are
available for review; nothing in the analyzer or its tests depends on the stale golden.

## Diagnostics added

- **`BRG1308` — Navigation names a route that does not exist** (warning). A concrete navigation path that
  matches no declared route, by exact path or parameterized pattern; the edge is dropped, never guessed.
