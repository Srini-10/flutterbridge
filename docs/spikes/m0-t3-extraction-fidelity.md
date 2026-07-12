# M0-T3 — Extraction fidelity memo

**Task:** M0-T3 (spike extractor, 30 MVP widgets, `hello_bridge`).
**Deliverable:** this memo. The spike code (`spikes/m0-extractor/`) is disposable and is deleted at M1-T7.
**Audience:** whoever implements M1 (UIR schema + `dart/bridge_analyzer`).

---

## 1. What was built

A Dart CLI on `package:analyzer` 14.0.0 that loads `hello_bridge` through
`AnalysisContextCollection`, walks **resolved** ASTs, and emits ad-hoc JSON: components, state
fields, stores, widget trees, navigation calls, endpoints, plus an opaque-node census and MVP widget
coverage. No schema, no tests — per the task definition.

## 2. Results

| Metric | Value |
| --- | --- |
| Files analyzed | 7 |
| Components extracted | 3 (`BridgeApp`, `LoginScreen`, `HomeScreen` — all stateful) |
| Stores extracted | 1 (`FavoritesStore`) |
| Widget nodes | 38 (10 const / 28 non-const) |
| Tree nodes total | 93 |
| **Opaque nodes** | **0 (0.0 %)** |
| Navigation calls | 1 (`Navigator.push` → `HomeScreen`) |
| Endpoints | 1 (`GET` `$apiBaseUrl/posts?_limit=12`) |
| MVP widgets exercised | 16 / 28 |

Prop bindings by kind: `const` 13, `ref` 10, `value` 9 (`ThemeData`, `EdgeInsets`, `TextStyle`,
`InputDecoration`), `expr` 4, `interp` 2.

**Every acceptance criterion is met**: the JSON captures the widget tree, the state fields, and the
navigation calls for both screens. Extraction fidelity on the MVP subset is high enough that the
opaque count is zero — but see §4, because "zero opaque" is not the same as "zero risk".

Structural widgets resolved exactly as the frozen normalization passes assume:

```
HomeScreen.build
└─ Scaffold
   ├─ appBar: AppBar { title: interp "Items (${_favorites.favoriteCount} starred)", actions: [IconButton] }
   └─ body:   FutureBuilder<List<Item>>          →  N4  →  UIAsync
              props:  future                          (source)
              slots:  builder (closure: BuildContext, AsyncSnapshot<List<Item>>)
                      ├─ when snapshot.connectionState == ConnectionState.waiting  → CircularProgressIndicator
                      ├─ when snapshot.hasError                                    → Center(Text)
                      ├─ let  final List<Item> items = snapshot.data ?? <Item>[]
                      └─ default                                                   → ListView.builder
                                                    →  N3  →  UIList
                                                    props: itemCount
                                                    slots: itemBuilder (closure: BuildContext, int)
```

The `waiting / hasError / data` branch shape is **mechanically recognizable**, which confirms N4 can
pattern-match `FutureBuilder` rather than interpret it. Same for `ListView.builder` → N3.

## 3. Findings that change how M1 is implemented

None of these require an architecture change. All are expressible in the frozen UIR. **F1 is the one
exception and is escalated as an open issue in §5.**

**F1 — A `void Function()` crosses a route boundary.** `Navigator.push` passes
`onToggleTheme: void Function()` (and `isDark: bool`) into `HomeScreen`. In Flutter this is ordinary
prop drilling. In Next.js App Router `/home` is a URL, and **a closure cannot cross a URL boundary**.
The extractor captured this precisely (`navigation[0].propsPassed`), which is exactly why the spike
was worth doing. See §5, ISSUE-1.

**F2 — `writes` cannot be computed from assignments alone.** `FavoritesStore.toggle` came back with
`writes: []` and `notifies: true`, because it mutates through `_favoriteIds.add/remove` — method
calls on a collection, not `AssignmentExpression`s. An assignment-only write analysis silently
produces an **empty dependency edge set**, which would generate React state that never updates.
*M1-T9 requirement:* the `writes` computation must also treat mutating method calls on state-owned
collections (`add`, `remove`, `clear`, `[]=`, …) as writes, resolved via the receiver's element, not
its spelling. This directly feeds risk R3.

**F3 — The store-subscription idiom is not an action.** `HomeScreen._onFavoritesChanged` is
`setState(() {})` — one `setState` call, zero writes. Its "write" happens elsewhere (in the store).
Modeled naively it becomes a `sig.Action` that writes nothing, i.e. dead code, and the store→UI edge
disappears. *M1-T9 requirement:* recognize `addListener`/`removeListener` (+ empty `setState`) as a
**store subscription**, and emit a reactivity-graph edge from `app.Store` to the component — not an
action. The `initState`/`dispose` pair is the subscribe/unsubscribe.

**F4 — `_itemsFuture` is a query source, not a signal.** It is `late Future<List<Item>>`, assigned
once in `initState` and consumed by `FutureBuilder`. If the mount effect is lowered generically it
becomes a `useEffect` that refetches. *M1 note:* an `initState` assignment whose static type is
`Future<T>` **and** whose only consumer is a `UIAsync.source` should be extracted as the query
source, not as a mount effect + component signal.

**F5 — Slot vs. handler must be decided by resolved parameter type, not expression shape.** The spike
classified any `FunctionExpression` argument as a slot, so `onChanged:` closures landed next to
`builder:` closures. They are different things: `builder` is a `UINode` producer, `onChanged` is a
`bind.Expr` → `Lambda` prop. *M1 note:* use `Argument.correspondingParameter` (analyzer resolves it)
and branch on whether the parameter type is `Widget`-producing or not. The same API also gives the
**real names of positional arguments** (`Text('Sign in')` → `data:`), which the spike could only
record as `$positional`.

**F6 — A broken environment degrades silently, and that is the dangerous failure mode.** With
`.dart_tool/package_config.json` missing, `getResolvedUnit` still returns a `ResolvedUnitResult` —
but every Flutter type resolves to `InvalidType`, `_isWidget` returns false everywhere, and the
extractor cheerfully emits a tree of opaque nodes. First run of the spike produced *38 widgets → 0
widgets* purely from a missing `pub get`, with no error. *M1 requirement (INV-5):* the analyzer must
hard-fail (exit 3, no output) on a missing package config or any unresolved import, rather than emit
a confident partial extraction. The spike now does this; `bridge_analyzer` must too.

**F7 — Widget identification needs no element API.** `staticType.allSupertypes` string-matched against
`Widget` is sufficient, and is stable across analyzer versions. Recommended for M1 over the
`Element`/`Fragment` API, which is where the churn lives (F8).

**F8 — analyzer 14 is a significant AST redesign.** Budget for it in M1-T7/T8. What changed versus
the API most Dart tooling documentation still shows:

| Was | Now (analyzer 14) |
| --- | --- |
| `ClassDeclaration.members` | `ClassDeclaration.body.members` |
| `ClassDeclaration.name` | `ClassDeclaration.namePart.typeName` |
| `NamedExpression` (`.name.label.name`, `.expression`) | `NamedArgument` (`.name` Token, `.argumentExpression`) |
| `ArgumentList.arguments : List<Expression>` | `List<Argument>`; `Expression implements Argument` (positional args are bare Expressions) |
| `SimpleFormalParameter.type` | `FormalParameter.type` / `.name` (unified sealed class) |

`MethodDeclaration`, `FieldDeclaration`, `VariableDeclaration`, `ConstructorName`,
`InstanceCreationExpression`, `IfElement`, `MethodInvocation` are unchanged. *M1 requirement:* pin the
analyzer version exactly and keep the Dart beta channel in CI from M1 (risk R6 — this finding is that
risk showing up on day one).

**F9 — Non-widget value objects are all const-foldable.** `EdgeInsets`, `TextStyle`, `InputDecoration`
and the `ThemeData` literals all appear as `const` constructions. N6 (const-fold) and N10
(theme-tokenize) have exactly the input they were designed for. No surprises.

**F10 — `hello_bridge` exercises 16 of 28 MVP widgets, by design.** Not exercised: `Align`,
`Container`, `Divider`, `Expanded`, `Flexible`, `GestureDetector`, `Image`, `InkWell`, `Positioned`,
`Row`, `Spacer`, `Stack`, `TextButton`. This confirms the plan rather than contradicting it: whole-app
coverage comes from `hello_bridge`; **per-construct coverage must come from the G1 fixtures**
(`fixtures/uir/`, M1-T8). Do not "enrich" the fixture app to close this gap.

## 4. Why "0 % opaque" is not a fidelity guarantee

The opaque ratio is zero because `hello_bridge` was written to the MVP subset. It measures the
fixture, not the compiler. The real automation number comes from **M0-T6** (this extractor run against
two real company apps), and that is the number the M0-T7 go/no-go gate is scored on. Nothing here
should be read as evidence about real-world apps yet.

## 5. Open issue for the M0-T7 gate

**ISSUE-1 — Signal-scope promotion across route boundaries has no home in the frozen pass list.**

*The problem.* `_isDark` is a component-scoped signal in `BridgeApp`, and its mutator `_toggleTheme`
is passed by reference through `Navigator.push` into `HomeScreen`. Under a URL-based router, the
callee is a separate entry point; the closure cannot be serialized to it. Any target with URL routing
(React/Next.js, Vue, Angular, Svelte) hits this identically — so this is **target-neutral**, not a
React problem.

*The good news.* The frozen UIR already models the fix: `sig.Signal.scope` is
`"component" | "store"` (Spec §2.3). A signal captured by a widget reachable across a route boundary
is simply promoted to `scope: "store"`, and the callback becomes a store action. **No schema change
is required.**

*The gap.* The **normative** normalization pass list (Spec §3.3, N1–N10) has no pass that performs
this promotion, and Spec §3.4 legalization is per-target — this is target-neutral. So there is
nowhere in the frozen pipeline that this work is currently assigned.

*Options (I am not choosing one — this is an architecture decision, and the architecture is frozen):*

1. **Add a normalization pass** (`N11 promote-cross-route-signals`), fed by the existing `nav-graph`
   analysis. Target-neutral, runs once, benefits every generator. Cost: amends the normative pass
   list in Spec §3.3.
2. **Handle it per-target inside each ui generator's transform** (e.g. `react.lower-signals`). No spec
   amendment. Cost: every future ui target re-implements it — precisely the duplication ADR-1 exists
   to prevent.
3. **Declare it out of scope for MVP** and require the *fixture* to hoist theme state into a store.
   Cheapest, but it moves a real-world pattern out of the MVP subset, and `bridge_lints` (M6) would
   then have to ban prop-drilled callbacks across routes — which is a real constraint on users.

*Recommendation:* **Option 1.** It is a one-line amendment to the normative pass list, it is
target-neutral (so it belongs in normalization by the platform's own layering rules), and it uses an
analysis (`nav-graph`) that is already specified. Options 2 and 3 both push cost onto every future
target or onto users.

*Blocking?* **No.** M0-T4/T5/T6 do not depend on it, and the M2 walking skeleton can be built either
way. It must be settled **before M2-T17** (`react.lower-signals`), and the natural moment to settle it
is the M0-T7 go/no-go review.

## 6. Inputs to M1 (checklist)

- [ ] Pin `analyzer` exactly; Dart beta channel in CI (F8, R6).
- [ ] Schema: `sig.Action.writes` must be able to name signals mutated via method calls (F2).
- [ ] Schema/extraction: store subscription as a reactivity edge, not an action (F3).
- [ ] Extraction: `Future`-typed `initState` assignment → `UIAsync` source (F4).
- [ ] Extraction: slot-vs-prop decided by `correspondingParameter` type; positional arg names from the
      same API (F5).
- [ ] Extraction: hard-fail (exit 3, no output) on unresolved element model (F6, INV-5).
- [ ] G1 fixtures must cover the 13 MVP widgets `hello_bridge` does not exercise (F10).
- [ ] Resolve ISSUE-1 before M2-T17.
