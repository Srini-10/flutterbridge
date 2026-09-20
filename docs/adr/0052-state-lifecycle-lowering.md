# ADR-52 — `State` lifecycle: `initState`, `dispose` and `didUpdateWidget` are lowered; `didChangeDependencies` is refused

- **Status:** Accepted (M11, production-compatibility milestone). Resolves the lifecycle gap recorded at M8-Q §7 and
  reproduced at M11-I, which was closed only by *refusing* any lifecycle body with behaviour in it (BRG3013).
- **Date:** 2026-09-20

## Context

A `State`'s lifecycle methods reach UIR as `sig.Effect` (`timing`: mount / update / unmount). Nothing in the generator
read one, and the schema did not say which component owned it, so `initState() { _n = 5; }` produced a component that
started at 0 with no diagnostic. Three further defects were found while lowering it:

| Defect | Effect |
|---|---|
| `didUpdateWidget` and `didChangeDependencies` are both timing `update`; the effect's symbol was keyed by *timing* | the second was dropped as a duplicate, body and all |
| `didUpdateWidget(oldWidget)`'s parameter was not in scope when its body was extracted | `oldWidget.tag` was an unresolved reference |
| A recursive component (`TreeNode` renders `TreeNode`) imported itself | `TS2440`, a build failure |

## The decision

**D1 — Schema (three optional fields; no consumer breaks).** `ui.Component.effects: NodeId[]` (the lifecycle effects it
owns, in declaration order), `sig.Effect.method` (`initState` / `didUpdateWidget` / `didChangeDependencies` / `dispose`)
and `sig.Effect.params` (as `sig.Action.params`). The proven contradiction with "no schema change" is the one M8-Q
recorded: an effect names no component, so no generator *can* lower one. Effect symbols are now keyed by **method**.

**D2 — `initState`.** Split at the first statement that is not a *pure state assignment* (`_n = 5;`, `_m = _n + 1;`,
`_label = 'x $_n'` — literals, references, operators, conditionals, interpolations, list literals and property reads; never a
call):
- the pure prefix runs **before the first render**, in `useInitState` (React's `useState` initialiser), so the first frame
  already has it — Flutter's timing. It is idempotent by construction, which is why it may run twice under StrictMode;
- the rest runs once **after the first commit**, in `useLifecycle({ init })`. It keeps its order; nothing moves across it.

**D3 — `dispose`.** The cleanup of *the same effect* as `initState` (`useLifecycle({ init, dispose })`), so an init and its
dispose pair even where development StrictMode mounts, unmounts and mounts again (`init, dispose, init`) — the contract
Flutter already asks of a symmetric `initState`/`dispose`. It runs exactly once when the component really unmounts. Both
callbacks are read from the **latest** render, so `widget.x` in `dispose` is the current widget, as in Flutter.
`super.<lifecycle>()` and `dispose()` on a framework object (`TextEditingController`) are erased; anything else is behaviour.

**D4 — `didUpdateWidget(oldWidget)`.** `useDidUpdateWidget(props, (oldWidget) => …)`: runs after a render in which the
parent supplied a **new `props` object** — which React creates exactly when a parent re-renders it, and does not when the
component re-renders for its own state — never on the first render. That is Flutter's condition (a new widget instance, equal
or not; not `setState`). Reads off `oldWidget` are reads of the previous props.

**D5 — `didChangeDependencies` is refused when it has behaviour** (`BRG3013`, by name, with what to do instead). It fires when
an *inherited* dependency (`Theme.of`, `MediaQuery.of`, an `InheritedWidget`) changes, and once after `initState`; a function
component has no per-instance hook for either. A store's `dispose` (an effect no component owns) is refused for the same reason:
silently absent is the one thing a lifecycle body may not be.

**D6 — Reach.** A lifecycle body is walked like the render tree: an action it calls is declared, and a `mounted` read inside it
declares `useMounted` (`initState() { _load(); }` with `if (!mounted) return;` after an `await` is the idiom).

## Where the generated component differs from Flutter — pinned by tests, not hidden

1. **Order across components.** Flutter runs a parent's `initState` before its child's, and disposes a subtree's children before
   its parent. React runs a child's effect before its parent's (`init b | init a`) and a parent's cleanup first
   (`dispose a | dispose b`). `OrderHost` records Flutter's order and asserts the component's own.
2. **The effectful remainder of `initState` runs after the first commit**, so the first frame shows the declared field value for
   anything assigned after a call (`a=5` first, `a=100` after). The pure prefix is exact.
3. **`didUpdateWidget` can fire more often.** It fires on every parent re-render, and a State-field write re-renders the parent
   even without `setState` (ADR-0048), so a child that mutates a *parent-owned* collection from `didUpdateWidget` re-renders its
   parent and is updated again — in Flutter the parent would not rebuild. `setState(() {})` re-renders nothing here
   (ADR-0048), so it does not trigger a child's `didUpdateWidget` either. The fixture changes real parent state instead.
4. **Development StrictMode** runs `init, dispose, init`. A `dispose` that is not the inverse of its `initState` shows.

## Evidence

- `fixtures/apps/lifecycle_lowering` is executed **twice**: by Flutter under `flutter test` (`expected.json`) and as the generated
  component in jsdom (real `react-dom`, real kit, real analyzer output), compared after every tap — `initState` timing and
  ordering, `didUpdateWidget` on parent rebuild / equal props / own `setState` / re-mount, `dispose` exactly once per real
  unmount, a `mounted`-guarded async `_load()` started in `initState` and unmounted before it completes, and a pure `initState`
  whose value is on the **first frame** (`renderToString`, no effects). A StrictMode variant pins the pairing.
- 9 hook tests (`lifecycle_hooks.test.ts`): `useInitState` once per mount, before render; `useLifecycle` init after commit, dispose
  once, not re-run, latest closure, StrictMode pairing; `useDidUpdateWidget` not on mount, on new-but-equal props, not on own state.
- Mutations, all killed: `didUpdateWidget` firing on unchanged props; `dispose` never running; the lifecycle effect re-running every
  render; `didUpdateWidget` never advancing its previous props; no pure prefix (all of `initState` after commit); every statement
  before the first render.
