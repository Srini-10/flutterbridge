# M7-M — User-class construction / `logic.ClassDecl` lowering: architecture boundary

## Status: investigated, not implemented. Documentation only.

This milestone traced `FavoritesStore`'s `BRG3002` refusal to its exact root, and found the refusal is
**correct given the current architecture** — not a generator gap that a small fix closes. A faithful lowering
requires a member-access resolution mechanism that does not exist anywhere in this codebase today, and
building it is a genuinely new capability, not the smallest fix. Per this milestone's own stop conditions
(6 and 12), this document stops at the architecture decision rather than implementing past it.

## Phase 1 — the exact, traced shape

```dart
// lib/state/favorites_store.dart
class FavoritesStore extends ChangeNotifier {
  final Set<int> _favoriteIds = <int>{};
  int get favoriteCount => _favoriteIds.length;
  bool isFavorite(int id) => _favoriteIds.contains(id);
  void toggle(int id) { ...; notifyListeners(); }
}

// lib/screens/home_screen.dart, inside _HomeScreenState
final FavoritesStore _favorites = FavoritesStore();
```

Traced through the real analyzer (`dart run bin/bridge_analyzer.dart`), real `bridge normalize`, real
generator:

- **`FavoritesStore`'s own class declaration** is extracted correctly and completely, as
  `app.Store{origin: 'declared', name: 'FavoritesStore', signals: [d18f644e...], derived: [36ad5c5c...],
  actions: [2e10c8ec...]}` — one `sig.Signal{scope:'store'}` (`_favoriteIds`), one `sig.Derived`
  (`favoriteCount`), one `sig.Action` (`toggle`). This is `signal_extractor.dart`'s existing `isStore`/
  `_store` path, unchanged, working exactly as designed.
- **`_favorites`, the field**, is a *separate* extraction: `_HomeScreenState` is an ordinary `State` class,
  and its fields go through `signal_extractor.dart`'s field-reactivity loop with `storeScope: 'component'`.
  `_favorites` is `final`, never reassigned, but its type (`FavoritesStore`) matches
  `registry.isStateHolder(...)` — `ChangeNotifier` is in the catalog's `stateHolders` list (alongside
  `AnimationController`, `ScrollController`, `TextEditingController`) — so it is classified `reactive` and
  extracted as an *ordinary component-scoped signal*: `sig.Signal{scope: 'component', type: FavoritesStore,
  initial: logic.New{typeName: 'FavoritesStore'}}`.
- **The generator** (`declareLocalSignals`) tries to lower every component signal's `initial` through the
  ordinary expression emitter, which reaches `logic.New{typeName: 'FavoritesStore'}` and refuses it exactly
  as it would refuse `new Point(1, 2)` or any other unmapped user type: `BRG3002`, "one of this
  application's own classes... this generator does not emit class declarations."

**What is unsupported, precisely**: not "class construction" as a category. It is that a field typed as a
program-declared store class is misclassified at extraction as an ordinary reactive *value* signal, when it
is actually a *handle* to a separately-modelled store. The refusal fires at the generator, but the defect is
upstream of it.

## Phase 2 — probe matrix, and what it actually shows

Every shape in the requested probe matrix was checked against real analyzer output (`hello_bridge` and
targeted minimal fixtures, never hand-authored UIR):

| Shape | Extracted as | Reaches generator as |
|---|---|---|
| `int count = 0;` (mutable field) | `sig.Signal{scope:'component'}` | correct, works today |
| `CounterStore(this.initial)` (positional ctor arg, primitive) | untested directly — see note below | — |
| `void increment() { count += 1; }` | `sig.Action` (component-scope) | correct, works today (M4-F) |
| `int get doubled => count * 2;` | `sig.Derived` | correct, works today |
| `Future<void> incrementLater() async { ... }` | `sig.Action{isAsync:true}` | correct (M7-L) |
| `final FavoritesStore _favorites = FavoritesStore();` (store-typed field) | `sig.Signal{initial: logic.New{...}}` — **misclassified** | `BRG3002` |
| `_favorites.toggle(id)` / `.favoriteCount` (member access on a store-typed value) | `logic.MethodCall`/`logic.PropertyAccess` with an **unresolved member name** — only the receiver resolves | would compile to `<local>.toggle(id)` against whatever `<local>` turns out to be, which is wrong regardless of the field fix (see Phase 6/16) |
| `class Point { Point(this.x, this.y); final int x; final int y; }`, constructed and never mutated | `logic.New{typeName:'Point'}` at the call site; `Point`'s own class reaches extraction as `logic.ClassDecl` (not a component, not a store) | `BRG3002`, same generic refusal — **not a Duration/EdgeInsets-style kit value type**, because nothing in the runtime kit exports a `Point` |

`CounterStore`-with-a-constructor-argument was not independently probed beyond this: the moment `_favorites`
`.toggle(id)`/`.favoriteCount` proved unresolved, further probing (constructor args flowing into a
`defineStore` setup closure, async actions on a locally-instantiated store, two-instance isolation, same-
member-name collisions) would all be testing the **consuming end** of a mechanism that does not exist yet —
building fixtures to probe it would be probing the fix, not the problem. Phases 6–15 below are therefore
answered from the architecture, not from an executed fixture, and are marked as such.

## Phase 3 — what `logic.ClassDecl` means, decisively

`logic.ClassDecl` is **not intended to survive into a generator**, for either a component or a store class
(`declaration_extractor.dart`'s `_class`: `if (isComponent) { components.extract(...) } else if (isStore) {
_store(...) }` — both branches emit `app.Store`/`ui.Component` *and* the plain `logic.ClassDecl` record, but
`semantic = isComponent || isStore` suppresses `_methods()` for both, meaning the class's *behaviour*
(getters, methods) is deliberately extracted once, through the store/component path, never twice as
free-standing `logic.FunctionDecl`s). `logic.ClassDecl` for a store or component is metadata the
canonical-builder/normalizer may consult (e.g. `superclass`), not something a generator is ever meant to
construct an instance of directly.

For an **ordinary, non-component, non-store class** (`Point`), `logic.ClassDecl` genuinely is the only
representation — and correctly so: `expression.ts`'s own comment (`case 'logic.New'`) states this plainly:
*"M3-B does not emit `logic.ClassDecl`... The value side had no such check: `const Wonder('Petra', …)`
emitted `new Wonder(…)` referring to a class the generator had not written, and nothing said so."* Refusing
`new Point(...)` is intentional, documented, pre-existing behaviour — not a defect this milestone found, and
not one it should touch. **A user-declared, non-store, non-component class stays unsupported by design.**

So: `logic.ClassDecl` is correctly ignored by the generator in both cases. `FavoritesStore`'s problem is not
that `logic.ClassDecl` needs a new consumer — it is that the *field construction* referencing the store
never gets recognized as "construct this store" in the first place.

## Phase 4 — the existing store architecture already anticipated this

ADR-15's own motivating evidence is `final CartStore cartStore = CartStore();` — the *exact* idiom
`_favorites` uses (a `ChangeNotifier` field, constructed inline). ADR-15's decision: *"`app.Store` nodes are
emitted as provider-scoped instances created per client root / per request via the runtime's state facade
(`createStore`)"* — and the runtime kit (`packages/runtimes/react/src/internal/state/store.ts`) already has
exactly that facade: `defineStore`/`instantiateStore`, plus `StoreProvider`/`useStore()` built on top of them
(M7-F). `instantiateStore`'s own module doc even states the ADR-15 idiom by name in its header comment. This
machinery is real, tested, and **already fully sufficient** for the *instantiation* half of this problem —
nothing about ADR-15 or ADR-4/ADR-19/ADR-20 needs revisiting for that part. Preferring it over inventing a
second mechanism (Phase 4's own instruction) is not a judgment call; the primitives already exist and were
built for this.

**What ADR-15 does not address, and no other ADR does either, is member access.** `_favorites.toggle(id)`
and `_favorites.favoriteCount` are `receiver.member` expressions. Searched exhaustively:
`packages/compiler/src/internal/passes/` — only N11 touches `app.Store`, and N11 operates on **parameter
identity** across a route boundary (a promoted signal keeps the same conceptual identity as the parameter it
replaces), never on dot-notation member access. `expression_extractor.dart` has exactly one precedent for
"a receiver's identity changes how a member resolves" — `widget.onToggleTheme`, resolved via
`binding_extractor.dart` checking the receiver is *literally* named `widget` and bound as `Binds.parameter`
(the fixed, Flutter-framework `State.widget` contract, not a general receiver-type mechanism). There is no
general "this receiver's static type is a store-base class, so resolve `.member` against that class's own
signal/derived/action symbols" capability anywhere in the analyzer, the compiler passes, or the generator.

## Phase 5 — lifetime, decided

`_favorites` is a `_HomeScreenState` **instance** field: Flutter gives it component-instance lifetime — a
second, independently-mounted `HomeScreen` would get its own, isolated `FavoritesStore`. This is *not*
subtree-shared state (nothing passes `_favorites` down to descendants via `InheritedWidget`/`Provider`
syntax in the Dart source), so `StoreProvider`/`useStore()` — M7-F's mechanism, designed for a store an
ancestor provides to a subtree of *consumers* — is the wrong shape to force this into: two `HomeScreen`
instances under one `StoreProvider` would incorrectly share one store, violating ADR-15/INV-19 exactly the
way Phase 5 warns against.

The correct primitive already exists, one layer down: `useStoreInstance` (internal to
`packages/runtimes/react/src/internal/react/context.ts`) is `const [instance, setInstance] =
useState(() => instantiateStore(definition, options))` plus a small StrictMode-safe dispose effect — no
context, no provider, one instance per component mount. `StoreProvider` calls it and then *also* publishes
the result via context, for the subtree-sharing case. `_favorites`'s case needs only the first half: a
component that constructs its own store and never shares it. Exposing that half as a public hook (tentatively
`useLocalStore`) is a direct, minimal extension of an already-tested internal mechanism — not a second store
architecture, and not a change to `StoreProvider`/`useStore()`'s existing, working semantics.

## Phase 6 — why this alone is not the fix

Suppose only the field classification and `useLocalStore` wiring are built (a genuinely small change): the
`BRG3002` on `FavoritesStore()` disappears, `HomeScreen` gets `const [favorites] = useLocalStore(...)`.
`_favorites.favoriteCount`/`.toggle(id)` still lower to `favorites.favoriteCount`/`favorites.toggle(id)`
*verbatim*, by property/method name, because that is the only information the current `logic.PropertyAccess`/
`logic.MethodCall` extraction carries — `property`/`method` are plain strings, never resolved to the store's
own `sig.Derived`/`sig.Action` ids.

Whether that accidentally works depends entirely on what name the store's own emitted object uses for that
member — and `sig.Signal`/`sig.Derived`/`sig.Action` **carry no name of their own** (ADR-17: symbol-addressed
declarations; a name is recovered only from a `logic.Ref` that reads the declaration, elsewhere in the
program — `EmitScope.declaredName`'s own doc: *"a store emits `value_d18f644e` where the source said
`_favoriteIds`, which compiles and is unreviewable"* names this exact failure mode). `favoriteCount` and
`toggle` are never referenced from *within* `FavoritesStore`'s own body (no method calls another), so nothing
currently gives the store emitter a name for either — `store.ts` would fall back to an unreadable synthetic
name (`value_36ad5c5c`, `value_2e10c8ec`), and the external call site's `favorites.favoriteCount` would
reference a property the emitted store object does not have. That is not a diagnostic-suppressing half-fix;
it is a `tsc` failure exchanged for a *different* `tsc` failure, or worse, a property access that happens to
exist by coincidence on the wrong member. Building only the construction half would trade one honest refusal
for a dishonest "success" — exactly the "compiles around the hole" outcome the severity rule in this codebase
exists to forbid.

## Phase 9/16 — classification

**Category B, not C.** M7-L's report labelled this a generator blocker; it is not. The store class itself is
correctly and completely extracted (`app.Store` is right, unchanged, working). The generator's refusal is a
symptom, correctly triggered by a genuinely unresolved reference — not a bug in the refusal. The actual
defect is upstream: (1) an analyzer-side field-classification defect (a store-typed field should never have
become a `sig.Signal` at all), compounded by (2) a genuinely absent capability — member-access resolution
against a store-typed receiver — that exists nowhere in the pipeline today, analyzer or compiler or
generator.

**No schema change is needed for the instantiation half** (`app.Store`, `sig.Signal`/`Derived`/`Action`
already carry everything). **A schema change may be needed for the member-access half** — something has to
record, on the reference itself, which store member `.favoriteCount`/`.toggle` resolves to; today no
`logic.PropertyAccess`/`logic.MethodCall` variant carries a `target`. That is a load-bearing schema/ADR
decision this milestone does not make.

## Why this stops here (Phases 17, and stop conditions 6/12)

- **Stop condition 6** ("member identity would require name matching"): the resolution *can* be built on
  fully resolved elements (a receiver's static type, a method/getter's resolved declaration) rather than
  textual guessing — so it would not be *unsound* — but the mechanism to do it, end to end (resolve the
  receiver's type is a store base → find that class's own declaring file → compute the matching
  `sig.Derived`/`sig.Action` symbol → thread a name back through so the store's own emitted object uses a
  readable key → verify this composes correctly for two instances and for two different classes sharing a
  member name, per Phases 10/11) is real, new, multi-file work — not the smallest fix, and risky to build
  under this milestone's own time-boxed evidence-gathering budget without a design that has had scrutiny
  first.
- **Stop condition 12** ("a second store architecture alongside M7-F"): not quite triggered in the strict
  sense — `useLocalStore` reuses `instantiateStore` directly, it does not invent a parallel object model —
  but it *is* a second **consumption pathway** (local-instance vs. provided-from-context) that M7-F never
  needed and that deserves the same scrutiny `StoreProvider`/`useStore()` got before being trusted.

## What would need to be true before implementing (recommendation for the next milestone)

1. **An ADR** deciding how a `.member` access on a store-typed receiver becomes a resolved reference —
   likely a small schema addition (a `target` on `logic.PropertyAccess`/`logic.MethodCall`, populated only
   when the receiver's resolved type is a program-declared store, recognized by `registry.isStoreBase` on
   the receiver's static type, never by name) — and how that reference's target symbol is computed
   cross-file using the *already-existing* `Symbols.pathOf`/`componentIn` pattern (extended with
   `signalIn`/`derivedIn`/`actionIn` siblings), so a name reaches `declaredName` and the store's own emitted
   object gets readable keys.
2. **`useLocalStore`** (or an equivalent name) exposed from the runtime kit, built directly from the
   existing, tested `useStoreInstance` internals — no new reactive primitive, no change to
   `StoreProvider`/`useStore()`.
3. **A real fixture** built once that mechanism exists — construction, a primitive constructor argument, a
   derived read, an action, two independent instances of the same store class, and two different store
   classes sharing a member name (Phase 10/11's exact tests) — proven through the real analyzer, real
   normalize, real generator, real `tsc`, and a browser proof for the reactive read/write/re-render cycle.
4. Ordinary, non-store, non-component user classes (`Point`) remain **out of scope permanently** by the
   existing, documented `logic.ClassDecl` design (Phase 3) — this is not a gap to close later; it is a
   correct, intentional boundary.

## Answers to the phases that do not require new code

- **Phase 7 (mutability)**: the analyzer already classifies mutable observable *state* correctly
  (`sig.Signal`, the `final` + mutated-by-`add`/`remove` rule `signal_extractor.dart` documents at length).
  The defect is not "invent reactivity" — it is "stop treating a store-typed field as if its value were the
  reactive thing," which is the opposite problem from the one this phase warns against.
- **Phase 12 (ordinary value classes)**: probed and confirmed unsupported by existing, intentional design —
  see Phase 2/3 above. Refused precisely, not swept into a reactive-store treatment.
- **Phase 13 (inheritance)**: `FavoritesStore extends ChangeNotifier` is framework-class inheritance, already
  a first-class, deliberate case (`isStoreBase`/`storeBases`, unrelated to this gap). User-to-user class
  inheritance was not evidenced in either fixture and is not addressed; it remains unsupported, correctly,
  by the same `logic.ClassDecl` boundary as Phase 3.
- **Phase 14 (constructor side effects)**: not evidenced — `FavoritesStore()`'s constructor is implicit
  (no body). Not probed further, since it is downstream of the member-resolution blocker.
- **Phase 15 (identity/equality)**: not evidenced — nothing in either fixture compares `FavoritesStore`
  instances or relies on `operator==`/`hashCode`. Not claimed supported.

## Final report

1. **Commit hash**: (this commit)
2. **Pushed status**: pushed, docs-only
3. **Files changed**: 1 (`docs/m7/m7m-user-class-construction.md`)
4. **hello_bridge baseline diagnostics**: 6 (unchanged from M7-L: `BRG3002`×2 — `FavoritesStore`, one
   named-arg + one own-class message on the same node — `BRG3007`×1, `BRG3013`×2, `BRG3016`×1, `BRG3005`×1
   roll-up)
5. **Exact FavoritesStore source shape**: see Phase 1
6. **Raw UIR shape**: `sig.Signal{scope:'component', type:FavoritesStore, initial:logic.New{...}}` for the
   field; `app.Store{origin:'declared', signals, derived, actions}` for the class — two disconnected parts
7. **Normalized UIR shape**: unchanged by N1–N11 (no pass touches this)
8. **Current refusal point**: `expression.ts`'s `logic.New` case, generic "own class" `BRG3002`, correctly
   triggered
9. **`logic.ClassDecl` intended ownership**: consumed by the store/component extraction path (metadata),
   never constructed directly by a generator; for non-component/non-store classes it is the sole, correctly
   unsupported representation
10. **Selected architecture**: not implemented — see recommendation above (`useLocalStore` +
    member-resolution ADR)
11. **Why that architecture is correct**: reuses `defineStore`/`instantiateStore` (already built for exactly
    this ADR-15 idiom) rather than inventing a parallel object model; the member-resolution half reuses the
    existing `Symbols.pathOf`/cross-file symbol pattern rather than name-guessing
12. **Supported constructor forms**: none implemented this milestone
13. **Unsupported constructor forms**: all, pending the above
14. **Lifetime/ownership rule**: component-instance-scoped for a field constructed inline on a `State`/
    component class (decided, not yet implemented)
15. **Mutable-field/reactivity rule**: unaffected — existing `sig.Signal` classification for ordinary fields
    remains correct; this gap is specifically about store-*typed* fields
16. **Action lowering result**: not attempted — blocked on member resolution
17. **Action-parameter result**: not attempted
18. **Derived-member result**: not attempted
19. **Async-action result**: not attempted (though M7-L's `sig.Action{isAsync}` handling would apply
    unchanged once reachable)
20. **Multiple-instance isolation result**: not proven in code; architecturally expected to hold via
    `useState`'s per-mount semantics, same as ordinary component signals
21. **Same-member-name collision result**: not proven in code; the recommended `Symbols`-based resolution
    is collision-safe by construction (path + owner scoped), same guarantee the existing symbol scheme
    already gives every other declaration kind
22. **Ordinary value-class result**: confirmed unsupported, by existing intentional design, not a gap
23. **Inheritance result**: framework-class inheritance (`ChangeNotifier`) already supported via
    `isStoreBase`; user-to-user inheritance unaddressed, unsupported
24. **Constructor-side-effect result**: not evidenced, not probed
25. **Identity/equality result**: not evidenced, not claimed
26. **Schema changes**: none made; one likely needed for the member-resolution half (future ADR)
27. **ADR changes**: none made; a new ADR recommended before implementation
28. **Analyzer changes**: none
29. **Compiler changes**: none
30. **Runtime changes**: none
31. **Generator changes**: none
32. **New diagnostics/refusals**: none — the existing `BRG3002` refusal is correct and was not touched
33. **Real fixture tsc result**: n/a — no fixture built (Phase 2's note explains why)
34. **Browser production result**: n/a
35. **Browser development result**: n/a
36. **hello_bridge diagnostics after**: 6 — unchanged
37. **hello_bridge files emitted**: 0 — unchanged
38. **M7-L regression**: none possible — no code touched; `Duration`/`delay`/async-action emission untouched
39. **M7-K/J/H/G/F regression**: none possible — no code touched
40. **CI result**: not re-run beyond confirming a clean tree (no code changed to invalidate a prior green run)
41. **Determinism result**: n/a — no code changed
42. **Fixed-point result**: n/a — no code changed
43. **Remaining blocker categories**: `FavoritesStore`/user-class construction (this milestone's target,
    now precisely bounded rather than closed), `ui.Async`, multi-hop (`BRG2305`/`BRG3013`), `themeMode`,
    ordinary non-store user classes (permanently out of scope)
44. **Recommendation for M7-N**: write the member-access-resolution ADR this document specifies (receiver-
    type-based, symbol-scheme-based, no name-guessing), decide the schema addition it requires, *then*
    implement `useLocalStore` plus that resolution together as one milestone — implementing `useLocalStore`
    alone first would remove a diagnostic while introducing a worse, silent failure, which this milestone
    declined to do.
