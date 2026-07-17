# M3-B — corpus evaluation

**Date:** 2026-07-17. **Generator:** `@bridge/gen-react` at M3-B. **Input:** `fixtures/uir/hello_bridge.normalized.ndjson`.

## Summary

| app | source | UIR | generated | verdict |
| --- | --- | --- | --- | --- |
| **hello_bridge** | `fixtures/apps/hello_bridge`, 7 files, 369 LOC | **minted, committed** | **0 files, 4 errors** | outside M3-B's surface, and says so |
| **compass_app** | **not in this repository** | — | not run | see §3 |
| **wonderous** | **not in this repository** | — | not run | see §3 |

One genuine schema gap was found, is documented in §4, and is **not worked around**.

## 1. The first real UIR in this repository

Before M3-B there were **zero** UIR documents committed anywhere — `fixtures/uir/` held only a README, and
every compiler test built its programs by hand. That is worth stating because a generator validated only
against hand-written fixtures is validated against its own assumptions.

The document was minted with the real toolchain, at the ADR-14 pin (Dart 3.11.3, Flutter 3.41.5):

```bash
cd dart/bridge_analyzer
dart run bin/bridge_analyzer.dart --project ../../fixtures/apps/hello_bridge --out hello_bridge.ndjson
bridge normalize hello_bridge.ndjson --out hello_bridge.normalized.ndjson
```

- **Extraction:** 30 records, 5 warnings (all `BRG1302` — constructs with no UIR representation, preserved as
  opaque per INV-4).
- **Normalization:** 30 → 32 nodes. **Only N5 changed the program** (it lifted two closures). Two warnings:
  `BRG2103` (un-expanded repeated UI) and `BRG2104` (a `ui.Async` with neither a loading nor an error branch).
- **N10 did not fire.** It looks for a token named `seed`; `hello_bridge` sets `primaryColor` and
  `scaffoldBackgroundColor` literally and never calls `ColorScheme.fromSeed`. So the theme is **two tokens**,
  not the derived 45-role Material set ADR-13 describes. Nothing is wrong here — the pass is correct and the
  app simply does not use a seed — but it means INV-20 ("every colour a mapped Material widget paints must
  resolve to an `app.Token`") cannot hold for this app: a `Scaffold` paints colours no token accounts for.
  That is a real gap between the fixture and the invariant, and it belongs to whoever schedules N10's
  non-seed path.

Both documents are committed to `fixtures/uir/`, which was reserved for exactly this.

## 2. hello_bridge

**Result: 0 files, 4 error diagnostics.** The generator refuses the project rather than emitting one that
compiles around the holes.

| code | n | what |
| --- | --- | --- |
| `BRG3001` | 3 | `MaterialApp`, `Scaffold` ×2 — no mapping to a runtime component |
| `BRG3005` | 1 | the summary: errors were reported, so nothing is emitted |

This is the correct answer and not a disappointment. M3-B's brief says *"support the smallest complete
end-to-end application"* and *"do NOT begin implementing advanced widgets"*; the supported surface is seven
layout widgets (`Text`, `Column`, `Row`, `Center`, `Padding`, `SizedBox`, `ElevatedButton`). `hello_bridge`
is built on `MaterialApp` → `Scaffold` → `AppBar`, so its root is unmappable and everything below it is
unreachable. A generator that emitted a `<div>` for `Scaffold` would produce an application that renders,
looks nearly right, and is wrong.

**Before the refusal, the emitters ran, and what they produced is the useful part of this exercise.** Run
against the real document, the store emitter produced:

```ts
export const favoritesStoreStore = defineStore('FavoritesStore', ({ signal, derived, action }) => {
  const _favoriteIds = signal(new Set([]));
  const computed_36ad5c5c = derived(() => _favoriteIds.get().length, 'computed_36ad5c5c');
  const run_2e10c8ec = action(() => {
    if (_favoriteIds.get().contains(undefined)) { … }
  …
```

Four defects are visible in those four lines, and **every one of them was invisible to the hand-written
fixtures**, which had been written to the shape the implementation assumed:

1. **Field names were guessed and were wrong.** `logic.If` has `test`, not `condition`; `PropertyAccess` has
   `property`, not `name`; `MethodCall` has `method`/`args`, not `name`/`arguments`; `MapLit` has
   `keys`/`values`, not `entries`; `For` has `loopVariable`; `Switch` has `subject`; `VarDecl` has
   `initializer`. The first run emitted `if (undefined)` and `.get()._`. **Fixed**, against the generated
   model rather than memory.
2. **Declaration names were lost.** `sig.Signal` carries no `name` — it is symbol-addressed (ADR-17) and the
   symbol never reaches the document — so the store emitted `value_d18f644e` where the source says
   `_favoriteIds`. But every `logic.Ref` that reads it carries the name the author wrote: the program states
   it, on the reader rather than the declaration. **Fixed** by recovering names from references.
3. **A Dart `Set` was emitted as a `Map`.** `<int>{}` arrives as `logic.MapLit` with type `Set<int>`, because
   UIR has no `SetLit` and Dart's `{}` is ambiguous. `new Map()` has `.add`, `.has` and `.delete` that all
   mean something else, and the mistake compiles. **Fixed** by reading the resolved type.
4. **`notifyListeners()` leaked into the output.** It is a `ChangeNotifier` API with no referent in the
   emitted program. **Fixed**: an unresolved reference is now `BRG3006`, not a bare name that fails at
   runtime. (Under ADR-4 a signal write *is* the notification, so the call is redundant — but "redundant" is
   a judgement about `ChangeNotifier`'s semantics and belongs to whatever models them, not to a name lookup
   in the generator.)

Two remain, and are **not** fixed here:

5. **`Set.length`.** Dart's `Set` has `.length`; JavaScript's has `.size`. The generator emits `.length`
   because `PropertyAccess` is lowered structurally. Fixing it needs a type-directed member map (Dart's
   `List.length` → `.length`, `Set.length` → `.size`, `Map.length` → `.size`, `.contains` → `.has`/`.includes`),
   which is a real piece of design and is larger than M3-B's minimal surface. It is a **known, unemitted**
   defect: no supported program reaches it, because the only path to it is through unmapped widgets.
6. **`sig.Action` cannot express a parameter.** See §4 — this is a schema gap, not an implementation defect.

## 3. compass_app and wonderous — not run, and why

**Neither application's source is in this repository**, and there is no script that fetches them. What exists
is derivative: the M0-T6/C1 compat censuses (`spikes/m0-compat-report/c1/out/*.json`) and their reports, which
record measurements taken on a machine that had the apps checked out. `spikes/m0-compat-report/c1/reports/comparison.md`
names them as external clones at pins:

| app | origin | pin | files | LOC |
| --- | --- | --- | --- | --- |
| `compass_app` | google/flutter samples | `09335b0` | 111 | 9 141 |
| `wonderous` | gskinnerTeam | `ce37ddf` | 189 | 30 655 |

Running them would mean cloning both at those pins and, for `compass_app`, running `dart run build_runner
build` first (`docs/architecture/bridge-analyzer.md` records the freezed/json_serializable dependency). That
is a corpus harness, and `just corpus` is explicitly `M4` work (Blueprint §3, M4-T6); the M2 readiness report
already notes *"the corpus harness lives in a scratch directory, not the repo"*.

**What can be said without running them** is that the M3-B surface cannot generate either. Both are
`Scaffold`-based, `wonderous` navigates with `go_router` ×6, and `compass_app` declares 36 `GoRoute`s — and
`BRG3001` would fire on the first widget of both. Cloning 40k lines of Flutter to produce a longer list of
the same diagnostic would not tell us anything this report does not.

**Recommendation:** wire the corpus at M4-T6 with the harness, against a widget surface large enough for the
answer to be interesting. Doing it now would measure the surface, not the generator.

## 4. Schema gap — `sig.Action` cannot express a parameter

> **Resolved at M3-B.1 by [Spec v2.5 §A18](../spec/v2.5-amendments.md).** `sig.Action` gained an optional
> `params: ParamDecl[]`, exactly as recommended below; the schema is at 1.4.0 and the amendment is implemented
> through the analyzer, the compiler, the runtime and the generator. The section is kept as written, because
> the finding is the useful record and because it is the third instance of a shape (§A10, §A17, §A18) worth
> being able to recognise on sight. §6 of the amendment records why it stayed invisible for four milestones.

**This was a stop-and-document item, per M3-B's execution rules. It was not worked around.**

`FavoritesStore.toggle(int id)` is an ordinary Flutter store method and the second thing `hello_bridge` does.
Its `sig.Action` is:

```json
{"kind":"sig.Action","id":"…","span":{…},"writes":["…"],"body":[{"kind":"logic.If","test":{…}}]}
```

The body references `id`. **Nothing declares it.** `sig.Action`'s complete field set is `anchor`, `body`,
`ext`, `id`, `isAsync`, `kind`, `span`, `writes` — there is no `params`.

So an action's parameters are not in the model, and a `logic.Ref` to one is indistinguishable from a
reference to a top-level function, a package API, or a typo. The generator reports `BRG3006` and emits
nothing, which is correct and is also the end of the road: **no parameterised action can be generated for any
target**, and every real store has one.

**Why it must not be inferred.** The tempting fix is to treat an unresolved `Ref` inside an action body as an
implicit parameter and synthesise a signature from the names it uses. That fails on the first store that
calls a top-level function, and it fails *silently* — it would emit `action((notifyListeners) => …)`. It also
cannot recover order, type, optionality, or named-vs-positional, all of which the call site needs. This is
the same argument v2.4 §A17.2 used to refuse a synthesised route path: *"a contract that validates while
being wrong is the failure mode this project exists to avoid."*

**The precedent is exact.** §A10 amended the model when it genuinely lacked a representation for
`logic.Assign`; §A17 did it again for `app.RouteTransition`, on the finding that *"the reason it was never
emitted is not an oversight. It is that the frozen schema cannot describe what real Flutter code does."* This
is the third instance of the same shape, and it is found the same way — by pointing the tool at a real
program.

**Smallest compliant amendment.** `sig.Action` gains an optional `params: readonly ParamDecl[]`.

- `ParamDecl` **already exists** and already carries `name`, `type`, `required`, `named`, `defaultValue` —
  it is what `app.Route.params` and `ui.Component.params` use. Nothing new is defined.
- **Additive and optional**, so every existing document stays valid. `sig.Derived` needs nothing (a getter
  takes no arguments); `sig.Effect` needs nothing (it is invoked by lifecycle, not by a caller).
- Version: `1.3.0 → 1.4.0`, minor. `UIR_SCHEMA_HASH` changes, as INV-5 requires.
- Work: the analyzer's extraction of `setState` bodies and store methods populates it; N5's lifted closures
  already know their parameters; the React generator lowers it to the closure's parameter list, which
  `defineStore`'s `action` signature — `action<A extends readonly unknown[], R>(body: (...args: A) => R)` —
  already accommodates with no runtime change.

**Not implemented here.** It is a schema change, M3-B is instructed to stop for one, and it touches the
analyzer (M1) and the schema, both of which M3-B is instructed not to modify.

## 4a. Corpus re-validation after §A18 (M3-B.1)

The document was re-minted with the amended analyzer. Every action in `hello_bridge` now carries what the
source declares — **six actions, four of them parameterised**, where before the amendment none could be:

| action | source | params | note |
| --- | --- | --- | --- |
| `FavoritesStore.toggle` | `favorites_store.dart` | `(id: int)` | the node §A18 was written about |
| `onChanged` ×2 | `login_screen.dart` | `(value: String)` | **N5-lifted closures** — see below |
| `_onFavoritesChanged` | `home_screen.dart` | `(context: BuildContext)` | a Flutter type; maps to `unknown` |
| `_toggleTheme` | `main.dart` | *(absent)* | takes none, so `params` is absent, not `[]` |
| `_submit` | `login_screen.dart` | *(absent)*, `isAsync` | |

**The two lifted closures are the finding.** `onChanged: (value) => setState(() => _email = value)` is not a
store method — it is a callback N5 turns into an action. N5's `freeLocals` already treated a lambda's own
parameters as **bound**, so those closures lifted happily *before* §A18 — into actions whose bodies read an
undeclared `value`. It was not a refusal; it was a **silent drop**, in `lift()`, which built the action
without `params`. Amending the schema and the analyzer alone would have fixed `toggle` and left these exactly
as broken, while looking complete — which is what §A18.4 flagged and why `packages/compiler/tests/action_params.test.ts`
asserts the whole pipeline rather than reading eleven passes.

Generated from the real document, the store's action is now:

```ts
const run_2e10c8ec = action((id: number) => {
  if (_favoriteIds.get().contains(id)) {
    _favoriteIds.get().remove(id);
  } else {
    _favoriteIds.get().add(id);
  }
}, 'run_2e10c8ec');
```

against `action(() => { … contains(undefined) … })` before. Three things in that snippet are still wrong, all
of them already known and none of them §A18:

- **`run_2e10c8ec`.** The action is `toggle` in the source. `sig.Action` carries no `name`, the analyzer sets
  no `anchor` on it, and no `logic.Ref` names it (it is called from the widget tree, not from the store), so
  all three naming sources in §2 miss and the id is the fallback. Not a schema gap — `anchor` exists on
  `UirNodeBase` and is simply not populated for actions. It is an analyzer quality item.
- **`.contains` / `.remove` / `.length`.** Dart's `Set` API, emitted structurally. JavaScript's is `.has`,
  `.delete`, `.size`. This is §2's item 5, still open, and it **fails at `tsc`** rather than silently: no
  supported program reaches it today.
- **`hello_bridge` still emits zero files**, because `MaterialApp`/`Scaffold` remain outside M3-B's
  seven-widget surface. §A18 changed what the generator *can* express, not what it maps.

The regression is locked in `packages/generators/react/tests/action_params.test.ts` against the real fixture:
no `BRG3006` mentions `id` or `value` any more, and `notifyListeners` still does — §A18 removed the false
negatives, not the check.

## 5. What M3-B does generate

Proved by `tests/build.test.ts`, which emits a counter application — a store with a signal, a derived and an
action; a component that reads and writes it; a theme; a route — writes it to disk, and runs `tsc` against
the **real, unmocked `@bridge/runtime-react`**. It typechecks.

The store it emits is ADR-19's lowering table, exactly:

```ts
export const counterStore = defineStore('Counter', ({ signal, derived, action }) => {
  const count = signal(0);
  const doubled = derived(() => (count.get() * 2), 'doubled');
  const increment = action(() => {
    count.set(count.peek() + 1);
  }, 'increment');
  return { count, doubled, increment };
});
```

Note `count += 1` became `count.set(count.peek() + 1)` and not `count = count + 1`: the latter rebinds a local
and leaves the signal untouched — *"generated React state that never updates"*, which `sig.Action`'s own schema
documentation names as the defect to avoid. And note there is no `new CounterStore()` anywhere: the module
holds a definition, which owns no state, so ADR-15's privacy defect is unrepresentable rather than merely
forbidden.

## 6. Diagnostics the generator can produce

`BRG3xxx`, claimed by ADR-22 from the range `docs/architecture/compiler.md` reserved for generation and which
nothing had used.

| code | severity | when |
| --- | --- | --- |
| `BRG3001` | error | a widget, prop or slot has no runtime mapping |
| `BRG3002` | error | a `logic.*` expression has no faithful lowering (an unknown operator, Dart named arguments) |
| `BRG3003` | error | a statement has no faithful lowering (a multi-clause typed `catch`) |
| `BRG3004` | error | a `ui.Opaque` / `logic.Opaque*` reached the generator (INV-4) |
| `BRG3005` | error | the program is not fit to generate from; no files emitted |
| `BRG3006` | error | a reference names nothing in the program — §4's shape, and `notifyListeners`'s |
| `BRG3007` | error | a `ui.Async` with no loading or error branch (`BRG2104` says the same upstream) |
| `BRG3008` | error | an inline route destination, whose URL is a legalization decision (v2.4 §A17.6) |
| `BRG3009` | error | two nodes want one module-level symbol |
