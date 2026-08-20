# M7-N — Local store instances and member resolution

## Summary

M7-M stopped before implementing `FavoritesStore`'s fix, having found that the honest refusal
(`BRG3002` on `new FavoritesStore()`) hid a deeper gap: no mechanism in this codebase resolved a
`.member` access against a store-typed receiver, and building only the instantiation half would trade
one honest refusal for a silent `tsc` failure or a wrong property read. M7-N decided that architecture
first — [ADR-27](../adr/0027-local-store-instances-and-member-identity.md) — then implemented it,
proved it end to end through a real fixture and a real browser, and closed the `FavoritesStore` gap in
`hello_bridge` completely: construction *and* every reachable member access.

`hello_bridge`'s generation errors: **6 → 5. `BRG3002` on `FavoritesStore`: 1 → 0**, with no partial fix
— `.favoriteCount` resolves, and the manual `addListener`/`removeListener`/`dispose()` wiring is erased
as redundant, exactly as `notifyListeners()` already was.

## What was proven, precisely

- **Declaration identity**: unchanged — `app.Store{origin:'declared'}` already worked (M7-F).
- **Instance identity**: a new `app.StoreInstance` node, symbol-addressed per field, so two fields of the
  same store type (`left`, `right`) get distinct ids even though the `logic.New` construction they share
  is one content-addressed node.
- **Member identity**: a new, optional `target` on `logic.PropertyAccess`/`logic.MethodCall`, resolved by
  the member's own resolved element (`GetterElement`/`MethodElement`) — never by name — computed via the
  same `Symbols`/`RawRef` mechanism that already resolves any other cross-file reference in this codebase.
- **Two same-type instances distinguished**: `left.count`/`right.count` share one `target` (the same
  declared member) but have distinct receivers, and the generator subscribes per `PropertyAccess` node id,
  not per member — proven directly in the real fixture's generated output (`_left_count$`/`_right_count$`,
  two separate `useSignal(...)` calls) and in the browser (mutating `left` never moves `right`).
- **Two different store types, same member name**: distinct `target`s (verified at the analyzer level: a
  dedicated Dart test constructs `AStore`/`BStore`, both with `count`/`increment`, and asserts the targets
  differ).
- **Ordinary classes stay refused**: `Point`'s `.x` gets no `target` — eligibility is
  `registry.isStoreBase` on the *resolved* receiver type, from the existing catalog, never a class name.

## A real regression found and fixed mid-milestone

`isStoreBase` matches any `ChangeNotifier` descendant — including the framework's own `ValueNotifier`,
`TextEditingController`, `FocusNode`, `AnimationController`. The first implementation used `isStoreBase`
alone for both the field-classification check and the `addListener`/`removeListener`/`dispose` erasure,
which meant:

1. A `ValueNotifier<int>` field (M4-H's own fixture, `layout_proof.ndjson`) would have been misclassified
   as `app.StoreInstance` — caught by the real analyzer crashing on that exact fixture (`RunStatus.invalidGraph`
   the first time; a content mismatch the second, after the first fix).
2. A `TextEditingController`'s own `.dispose()` — a real resource that must be disposed — would have been
   silently erased, exactly the leak the catalog's own doc comment already warned against.

Both are fixed the same way: eligibility additionally requires `Symbols.storeIn`/the receiver's declaring
library to resolve inside *this project* — `Symbols.pathOf` already returns `null` for
`package:flutter/...`, which is exactly the fact that separates a user's own store class from a framework
notifier type. `build_proof_test.dart`'s committed golden (unrelated to this milestone, never intentionally
touched) is what caught both regressions before they reached a commit — it is now also the regression test
for this exact defect class, and two new, dedicated Dart tests (`extraction_test.dart`) pin it explicitly:
`ValueNotifier`/`TextEditingController` fields never become `app.StoreInstance`, and `.dispose()` on the
latter is never erased.

## Implementation

- **Schema** (`x-uir-version` 1.6.0 → 1.7.0, additive only): `app.StoreInstance` (new node kind);
  `logic.PropertyAccess.target`/`logic.MethodCall.target` (new optional `NodeId` field, same shape as
  `logic.Ref.target`); `ui.Component.localSignals`'s description broadened (structurally unchanged — it
  already accepted any `NodeId`) to note it now also carries `app.StoreInstance` ids.
- **Catalog**: `storeLifecycleCalls` (`addListener`, `removeListener`, `dispose`) — the manual
  `ChangeNotifier` idiom's own vocabulary, erased only on a project-own store-typed receiver.
- **Analyzer**:
  - `Symbols` gained `storeIn`/`signalIn`/`derivedIn`/`actionIn`, siblings of the existing `componentIn`.
  - `signal_extractor.dart`'s field loop recognizes a store-typed field (project-own, per the fix above)
    and emits `app.StoreInstance` instead of `sig.Signal`.
  - `expression_extractor.dart` gained `_storeMemberTarget`, called from both `PropertyAccess`/
    `PrefixedIdentifier` cases and from `_invocation`'s `MethodCall` branch — resolved-element-based,
    computing the exact symbol the store's own class extraction independently computes for the same
    member.
  - `adapter.dart`/`flutter_adapter.dart`/`gap_adapter.dart`/`adapter_registry.dart` gained
    `isStoreLifecycleCall`, mirroring `isChangeNotification`'s exact discipline (resolved element, then
    the project-own-type guard above).
  - `statement_extractor.dart` erases a store-lifecycle call the same way `notifyListeners()` already is,
    in both statement positions that erasure already covers.
- **Compiler (N1–N11)**: untouched. Verified: the fixed point holds for the new fixture with zero passes
  reporting a change beyond N10's ordinary theme derivation.
- **Generator**: `nameIndex` (`pipeline.ts`) extended to recover a name from `logic.PropertyAccess`/
  `logic.MethodCall`'s `target`, exactly as it already does for `logic.Ref` — without this, `store.ts`'s
  emitted object would use unreadable synthetic keys (`value_<hash>`) that the call site's `.count` could
  never match; this was the first thing the real fixture's own `tsc` proof caught. `component.ts` gained
  `declareLocalStoreInstances` (hoists `useLocalStore(...)` per instance) and `declareStoreInstanceReads`
  (hoists `useSignal(...)` per (instance, member) — keyed by the `PropertyAccess` node's own id, since the
  member alone cannot distinguish two instances). `EmitScope` gained `storeExports` and `storeAccessRead`;
  the default (`defaultStoreAccessRead`) is the non-subscribing `.get()` fallback every handler-position
  read already needs, inherited automatically by `actionScope`'s existing `...parent` spread — no new
  plumbing needed there. The `logic.PropertyAccess`/`logic.MethodCall` emitters themselves needed **no**
  change for actions or tear-offs — `receiver.property`/`receiver.method(args)` was already correct once
  the receiver and the store's own keys resolve correctly.
- **Runtime**: one new export, `useLocalStore` — a two-line wrapper around the kit's existing (internal)
  `useStoreInstance`, the same primitive `StoreProvider` already used. `defineStore`/`instantiateStore`/
  `StoreProvider`/`useStore` are unchanged.

## Evidence

- **Real fixture** (`fixtures/apps/local_store`): a declared `CounterStore`, two independent instances
  (`_left`, `_right`) on one component, a signal, a derived value, a parameterless action (read both as a
  call and as a tear-off), and a parameterized action. Flutter → real analyzer → real `bridge normalize` →
  real generator → real `tsc`, no hand-authored UIR (`local_store_build.test.ts`, 5 tests, all passing).
- **Dart tests** (`extraction_test.dart`, 7 new, all against the real analyzer): field classification,
  member-target resolution for signal/derived/action/tear-off, two-instance receiver distinctness, two
  different stores' same-named members staying distinct, `Point` staying refused, cross-file resolution,
  and the `TextEditingController` regression guard.
- **Runtime tests** (`react.test.ts`, 5 new): creation with no provider, re-render on write, two
  independent instances from two `useLocalStore` calls against the same definition, disposal on unmount,
  Strict Mode survival.
- **Browser proof** (`local-store.spec.ts`/`.dev-only.spec.ts`, 10 tests, production and development):
  server-render and hydration, an action tear-off updating only its own instance, a parameterized action
  doing the same, repeated interaction accumulating independently, the derived value tracking on every
  update, Strict Mode's mount→cleanup→remount replay leaving both instances live and still isolated, zero
  hook-order violations, zero console output beyond React's own DevTools banner.
- **hello_bridge**: 6 → 5 generation errors. `BRG3002` (FavoritesStore): 1 → 0. `BRG3007`/`BRG3013`×2/
  `BRG3016` (ui.Async, multi-hop, themeMode) unchanged in count and message — none touched, none weakened.
  Golden fixtures (`fixtures/uir/hello_bridge.*`) regenerated from the real analyzer; the only content
  change is `_favorites`'s own field (now `app.StoreInstance`) and its `.favoriteCount` read (now carries
  `target`) — the raw record count holds at 82.

## Protected and unaffected

- `ui.Async`, `BRG2305`/multi-hop, `themeMode`, named-route work, `Future.delayed`'s callback overload,
  general `Future<T>` — none touched, none required.
- M7-L (`Duration`/`delay`, async `sig.Action` emission): unaffected — `promoted-counter`/`inline-push-props`/
  `async-push-guard`'s golden UIR is byte-identical (only `hello_bridge`'s and the new `local_store`'s
  changed).
- M7-F's own member-resolution mechanism (`referencedStoreMembers`/`declareStoreConsumption`,
  provided/promoted stores via `useStore()`): untouched. `useLocalStore` returns the identical shape
  `useStore` does and is consumed by the identical downstream machinery; only *acquisition* differs.

## Explicitly out of scope (per ADR-27)

Only direct, local field ownership is supported. Not addressed, and not silently broadened into:

- passing a store instance as a component parameter (`Child(store: store)`);
- a factory function returning a store instance;
- collections of store instances (`List<CounterStore>`, `Map<String, CounterStore>`);
- a local variable (not a field) constructing a store inside a method body — this already falls through to
  a separate, pre-existing limitation (a `build()` method with statements before its return is opaque
  outright, independent of this milestone).

## Final report

1. **Commit hash**: (this commit)
2. **Pushed status**: pushed
3. **Files changed**: see `git diff --stat` at commit time — schema (4), catalog (1) + codegen (2) +
   generated (4), analyzer (9 source + 1 test), generator (5 source + 3 test), runtime (2 source + 1
   test), e2e (2 config + 2 spec), fixtures (1 new app + 3 new golden files), 1 new ADR, 1 new doc, 3
   `hello_bridge` golden updates
4. **hello_bridge baseline diagnostics**: 6 (M7-M)
5. **FavoritesStore declaration shape**: `class FavoritesStore extends ChangeNotifier { ... favoriteCount
   getter, toggle/isFavorite methods ... }` — unchanged since M7-M
6. **FavoritesStore instance shape**: `final FavoritesStore _favorites = FavoritesStore();` on
   `_HomeScreenState`
7. **Raw construction UIR**: no longer a `logic.New` inside `sig.Signal.initial` — now `app.StoreInstance{
   store: <app.Store id>, scope:'component'}`, symbol-addressed per field
8. **Raw signal-read UIR**: n/a directly (`_favoriteIds` stays internal to the store's own body, unchanged)
9. **Raw derived-read UIR**: `_favorites.favoriteCount` → `logic.PropertyAccess{property:'favoriteCount',
   target:<favoriteCount's sig.Derived id>}`
10. **Raw action-call UIR**: `_favorites.toggle(id)`/`.isFavorite(id)` remain inside the pre-existing,
    unrelated `ui.Async` opaque blob (unreachable, untouched) — proven reachable and resolving correctly
    instead via the dedicated `local_store` fixture's `store.increment()`/`store.add(2)`
11. **Declaration identity available**: yes, unchanged (M7-F)
12. **Member identity available**: yes, new (ADR-27) — resolved-element-based
13. **Selected ADR architecture**: `app.StoreInstance` + `target` on `PropertyAccess`/`MethodCall`,
    `useLocalStore`
14. **Rejected alternatives**: `logic.New` + `target` (insufficient — collapses instances); overloading
    `sig.Signal`; receiver-name + property-string search; a second store consumption mechanism — see
    ADR-27
15. **Schema amendment**: `app.StoreInstance` (new kind), `target` on `PropertyAccess`/`MethodCall` (new
    optional field) — additive
16. **UIR version change**: 1.6.0 → 1.7.0
17. **Analyzer ownership**: eligibility and identity computation, entirely
18. **Normalization ownership**: none — N1–N11 untouched, fixed point verified
19. **Generator ownership**: mechanical only — hoisting (`declareLocalStoreInstances`/
    `declareStoreInstanceReads`), name recovery (`nameIndex`); `PropertyAccess`/`MethodCall` lowering for
    actions/tear-offs unchanged
20. **Runtime ownership**: one new export (`useLocalStore`), built from an existing internal primitive
21. **Local-store lifetime rule**: component-instance-scoped, one `useLocalStore()` per field, per mount
22. **Declaration-vs-instance identity rule**: declaration = `app.Store` (one per class); instance =
    `app.StoreInstance` (one per field, symbol-addressed so two fields of the same store type differ)
23. **Member-resolution rule**: resolved element (`GetterElement`/`MethodElement`) → symbol
    (`Symbols.derivedIn`/`signalIn`/`actionIn`) → `target`, never name-matching
24. **Multiple-instance result**: proven — analyzer test, real fixture generated output, browser proof, all
    green
25. **Same-member-name collision result**: proven distinct — dedicated analyzer test
26. **Cross-file result**: proven — dedicated analyzer test, and `hello_bridge` itself (store and consumer
    in different files)
27. **Store-as-param result**: unsupported, by design, undocumented boundary honestly refused (not probed
    beyond the ADR's own reasoning — no evidence required it)
28. **Store-from-function result**: unsupported, by design (ADR-27)
29. **Collections result**: unsupported, by design, future work if ever evidenced (ADR-27)
30. **Ordinary-class boundary**: `Point`-style classes refused exactly as before, proven with a dedicated
    test
31. **Action tear-off result**: resolves correctly — proven at analyzer, generator, and browser level
32. **Action parameter result**: resolves correctly — `add(int n)`/`store.add(5)` proven at all three levels
33. **Derived result**: resolves correctly — `count`/`doubled`, proven at all three levels
34. **Async-action result**: not exercised in this milestone's fixture (M7-L's `isAsync` handling is
    orthogonal and unaffected — no interaction found or expected)
35. **Strict Mode result**: green — both `useLocalStore`'s own runtime test and the real generated app's
    browser proof
36. **Real fixture tsc result**: clean, real `tsc`, real unmocked `@bridge/runtime-react`
37. **Browser production result**: 6/6 passing
38. **Browser development result**: 4/4 passing, including the Strict Mode replay
39. **hello_bridge diagnostics after**: 5 (`BRG3007`×1, `BRG3013`×2, `BRG3016`×1, `BRG3005` roll-up)
40. **hello_bridge files emitted**: 0 — unchanged; the three remaining, protected categories still block a
    full build
41. **Protected blockers unchanged**: `ui.Async`, multi-hop, `themeMode` — same codes, same counts, same
    messages
42. **M7-L/K/J/H/G/F regression**: green — `promoted-counter`/`inline-push-props`/`async-push-guard`'s
    golden UIR byte-identical; full generator/runtime/analyzer suites green
43. **CI result**: `just ci` green
44. **Determinism result**: `just determinism` green, including the new `local-store` fixture
45. **Fixed-point result**: green, verified for the new fixture and for `hello_bridge`
46. **Remaining blocker categories**: `ui.Async` (FutureBuilder loading/error decomposition), multi-hop
    (`BRG2305`/`BRG3013`), `themeMode`, store-as-parameter/factory-return/collections (unaddressed by
    design)
47. **Recommendation for M7-O**: none of the remaining `hello_bridge` categories share a root cause with
    this milestone's target or with each other — each would be its own, separately-scoped investigation
    (`ui.Async` needs a normalization decomposition pass this platform has never built; multi-hop needs
    whole-program provenance analysis ADR-11's amendment explicitly defers; `themeMode` needs a runtime
    brightness-switching primitive). Recommend treating `hello_bridge`'s remaining diagnostics as
    permanently out of scope unless a future milestone is given a new, specific target — chasing zero
    diagnostics on this fixture was never the goal.
