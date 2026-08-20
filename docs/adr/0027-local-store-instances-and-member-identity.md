# ADR-27 — Local store instances and member identity

- **Status:** Accepted, implemented (M7-N). Amends `logic.PropertyAccess`, `logic.MethodCall`; adds
  `app.StoreInstance`.
- **Date:** 2026-07-13

## Context

M7-M traced `hello_bridge`'s `FavoritesStore` refusal to its root and stopped before implementing
(`docs/m7/m7m-user-class-construction.md`). `FavoritesStore`'s own class declaration already extracts
correctly and completely as `app.Store{origin:'declared', signals, derived, actions}` — that machinery
(ADR-4, M7-F) is not the gap. The gap is `_HomeScreenState`'s own field:

```dart
final FavoritesStore _favorites = FavoritesStore();
```

extracted today as an ordinary component-scoped `sig.Signal{initial: logic.New{FavoritesStore()}}`,
because `ChangeNotifier` is in the catalog's `stateHolders` list (a field of that type "can change", the
same rule that correctly makes a `TextEditingController` field reactive). The generator refuses the
`initial` construction — correctly, since nothing tells it `FavoritesStore` is a store rather than an
arbitrary user class — and even fixing that refusal alone would not fix the program: every use of
`_favorites` (`.favoriteCount`, `.toggle(id)`) is a plain `logic.PropertyAccess`/`logic.MethodCall` whose
`property`/`method` is an unresolved string, with no link to the store's own `sig.Derived`/`sig.Action`
declarations.

## Evidence this ADR rests on

- ADR-15's own motivating example is `final CartStore cartStore = CartStore();` — the *exact* idiom.
  ADR-15's decision — `app.Store` nodes become provider-scoped instances via the runtime's state facade —
  already names the destination. The facade (`defineStore`/`instantiateStore`,
  `packages/runtimes/react/src/internal/state/store.ts`) already exists, already works, and its internal
  `useStoreInstance` (used by `StoreProvider`) is already the per-mount, `useState`-based lifetime this ADR
  needs — it was simply never exposed for a component to use directly, without a provider.
- `logic.New` is **content-addressed** (ADR-17): `CounterStore()` with no arguments is *one* node, reused
  by every field that constructs it. Verified directly: a probe with `store`, `left`, `right` all doing
  `= CounterStore();` produced **one** shared `logic.New` node referenced from **three** distinct
  `sig.Signal` nodes (their own ids differ because a *declaration*'s id is symbol-derived, not
  content-derived — ADR-17's own table). This is why instance identity cannot live on the construction
  expression: it must live on the *declaring field*, which already has it, for free.
- The symbol/reference system (`Symbols`, `RawRef`, the canonical builder's two-phase declare-then-resolve)
  already resolves references **across files**, by construction — `Symbols.componentIn`/`pathOf` already
  exist for exactly this (a route in one file naming a component another file declares). ADR-17/ISSUE-8:
  *"Do not manufacture synthetic symbols to satisfy a sentence"* — and *"References stay embedded as
  `RawRef` values inside fields... the canonical builder resolves references structurally, with zero
  per-kind knowledge."* This ADR adds no new resolution machinery — it computes the same symbols the
  store's own class extraction already computes, from the other side, and lets the existing builder link
  them.
- `sig.Signal`/`sig.Derived`/`sig.Action` carry no name of their own (ADR-17: symbol-addressed
  declarations). Every readable name in emitted output today is recovered from a `logic.Ref{target, name}`
  elsewhere in the program (`nameIndex`, `pipeline.ts`). `favoriteCount`/`toggle` are never referenced from
  *within* `FavoritesStore`'s own body, so nothing today gives them a name — building only construction
  lowering would silently emit `value_<hash>` keys the call site's `.favoriteCount` could never match.

## Decision

### 1. Store declaration identity

Unchanged. `app.Store{origin:'declared'}` remains the sole representation of a store *class*, produced
exactly as it is today (`declaration_extractor.dart`'s `_store`).

### 2. Store instance identity

A **new node kind**, `app.StoreInstance`, symbol-addressed exactly as `sig.Signal` is:

```json
{
  "kind": "app.StoreInstance",
  "store": "<RawRef to the app.Store this instantiates>",
  "scope": "component"
}
```

Emitted by `signal_extractor.dart`'s field-classification loop **instead of** `sig.Signal` when a
component-scoped field's static type `registry.isStoreBase`s. Its own NodeId is symbol-derived
(`sig:$path#$owner.$name`, the *signal* symbol scheme, reused — `app.StoreInstance` is a declaration a
class owns exactly the way a `sig.Signal` is one, so it earns the same identity guarantee: `store`, `left`,
`right` each get their own instance-declaration id, `logic.New`'s content-addressing notwithstanding — this
is *why* the identity lives on the declaring field, per the evidence above, and not on the construction
expression it happens to share. A dedicated kind rather than an optional field on `sig.Signal` was chosen
over reusing `sig.Signal{store: ...}` because the two are semantically different things — one holds a
value, the other holds a live store handle — and conflating them would make `declareLocalSignals` branch
on a field's presence rather than dispatch cleanly on kind (Phase 5's Option A/B comparison; Option B, a
dedicated node, won).

`FavoritesStore()`'s own `logic.New` construction is **not retained** on `app.StoreInstance` — there is no
"initial value" to construct; `instantiateStore`'s `setup` function *is* the construction, already wired
through `app.Store`. Keeping the construction expression around would be a second, redundant fact.

### 3. Member identity

A new, **optional** `target` field on `logic.PropertyAccess` and `logic.MethodCall` — the same shape
`logic.Ref.target` already has ("the declaration referred to, when it is in the program"). Populated by
`expression_extractor.dart` when, and only when, the receiver's resolved static type `isStoreBase`s: the
member's own resolved element (`propertyName.element`/`methodName.element` — never the spelling) determines
which symbol scheme to compute —

- a `MethodElement` (a call, *or* a tear-off with no parens — both are the receiver's method, resolved
  identically) → `Symbols(declaringPath).action(name, owner: className)`;
- a non-synthetic `PropertyAccessorElement` (an explicit getter) → `.derived(name, owner: className)`;
- a synthetic `PropertyAccessorElement` (the implicit getter Dart generates for a plain field) →
  `.signal(name, owner: className)`;

where `declaringPath` is `Symbols.pathOf(receiverType.element.library.identifier, packageName: ...)` — the
exact helper `componentIn` already uses for a cross-file component reference, extended with sibling
`derivedIn`/`actionIn`/`signalIn` methods. The `target` is a `RawRef` — a promise the canonical builder
resolves the same way every other symbol resolves, or reports `BRG1201` if nothing keeps it (a method that
never writes state, and so was never extracted as a `sig.Action`, correctly refuses this way rather than
silently emitting a property TypeScript cannot find).

**This never uses the receiver's textual name or the property/method's spelling to decide eligibility.**
Only the receiver's resolved static type and the member's own resolved element decide it — the same
discipline ADR-18's "recognized by resolved element, never by spelling" already established for `mounted`.

### 4. Schema representation

- `app.StoreInstance` — new node kind, `l1.json` (or wherever `app.*` lives), symbol-addressed like
  `sig.Signal`.
- `logic.PropertyAccess.target` — new optional `NodeId` field, same shape as `logic.Ref.target`.
- `logic.MethodCall.target` — same.

Additive only. `x-uir-version` bumps a minor version. No existing field changes shape or meaning.

### 5–8. Ownership

- **Analyzer**: recognizes eligibility (`isStoreBase` on a field's/receiver's resolved type) and computes
  identity (symbols, via the existing `Symbols`/`RawRef` machinery). Owns the entire decision — the
  generator never infers eligibility from anything but a `target` being present.
- **Normalization**: untouched. No N-pass needs to run for this; the analyzer's output is already the
  correct final shape, and N1–N11 have nothing to contribute (verified: the fixed point holds with zero
  passes reporting a change for the new fixture).
- **Generator**: purely mechanical. `logic.PropertyAccess`/`logic.MethodCall`'s existing lowering
  (`receiver.property` / `receiver.method(args)`) is **unchanged** — it was already correct, once the
  receiver resolves to the right local and the store's own emitted object uses the right keys. The only
  generator change is (a) a new `declareLocalStoreInstance`-style hoisting step, alongside
  `declareLocalSignals`, for `app.StoreInstance` nodes, and (b) extending `nameIndex` to also recover names
  from `logic.PropertyAccess{target, property}`/`logic.MethodCall{target, method}`, not only `logic.Ref`.
- **Runtime**: one new export, `useLocalStore`, a thin public wrapper around the kit's existing (internal)
  `useStoreInstance` — the same `useState(() => instantiateStore(...))` plus StrictMode-safe dispose
  `StoreProvider` already uses, without the context-provider half (unneeded: nothing in this milestone's
  evidence shares a locally-owned instance with descendants via `InheritedWidget`/`Provider` syntax).
  `defineStore`/`instantiateStore`/`StoreProvider`/`useStore` are **unchanged**.

### 9. Component-local lifetime

One `app.StoreInstance` per owning class, `useLocalStore(definition)` called unconditionally at the
component's top level (Rules of Hooks, exactly as `declareRouter`/`declareMounted`/`declareLocalSignals`
already hoist their own hooks). `useState`'s own per-mount semantics give it: stable across renders,
independent per component instance, disposed on unmount (the existing `useStoreInstance` effect), and
Strict-Mode-safe (the existing effect already handles the disposed-then-remounted case `StoreProvider`
needed). No new runtime primitive was written for any of this — it is `useStoreInstance`'s body, exported.

### 10. Multiple instances

Two fields of the same store type on the same class (`left`, `right`) each get their own
`app.StoreInstance` (distinct symbols: `sig:path#Owner.left` vs `sig:path#Owner.right` — the *field* name
disambiguates, not the store type), each lowering to its own `useLocalStore(...)` call and its own local
JS variable. `left.increment()`/`right.increment()` remain ordinary JS property access on two different
objects — JavaScript's own object identity does the isolating; no per-instance member-id scheme was needed
(see "why member identity does not need instance identity" below).

### 11. Cross-file stores

No special case. The symbol scheme is path-scoped by construction; `Symbols.pathOf` already handles
resolving a `package:` URI back to a project-relative path for any file in the project. Verified directly
against a two-file probe (store class and consuming class in separate files).

### 12. Action tear-offs

`store.increment` (no parens) reaches the analyzer as the *same* `PropertyAccess`/`PrefixedIdentifier`
shape a getter read does; the distinguishing fact is the resolved element's kind (`MethodElement` vs
`PropertyAccessorElement`), not the syntax. Both a tear-off and a call resolve to the identical `act:`
symbol.

### 13. Signal subscription behaviour

Not owned by this ADR. `favorites.count` in render position vs. handler position follows exactly the rule
M7-F already established for promoted/provided store consumption (`useSignal` in render position, a
non-subscribing `.get()`-equivalent in handler position) — `useLocalStore` returns the same shape
`useStore` does (a store's `state`, `{signal, derived, action}` fields), so the *consuming* code
(`declareStoreConsumption`, `useSignal` wiring) needs no change at all to treat a locally-owned instance's
members the same way it already treats a provided one's.

### 14. Unsupported: store pass-through and aliasing

Only **direct, local field ownership** is supported — a class's own field, constructed inline, used only
within that class's own body (render tree and actions). Not supported, and not addressed by this ADR:

- passing a store instance as a parameter to a child component (`Child(store: store)`);
- a factory function returning a store instance (`CounterStore makeStore() => CounterStore(); final s =
  makeStore();`);
- collections of store instances (`List<CounterStore>`, `Map<String, CounterStore>`).

None of these preserve instance identity through the current UIR (a parameter is a value binding with no
concept of "this specific store instance", a function return value has no identity beyond its type, and a
collection element has no per-position identity at all). Implementing any of them would require either
alias analysis (explicitly out of scope — Phase 16) or a schema extension this ADR does not make. They
remain unsupported, precisely, by falling through to the pre-existing generic refusal.

### 15. Ordinary classes stay refused

Eligibility is `registry.isStoreBase(type)` — the exact, existing, catalog-driven check
(`storeBases: ['ChangeNotifier', 'Notifier', 'StateNotifier']`) that already decides whether a *class
declaration* gets `app.Store` treatment. A class not in that set — `Point(1, 2)` — never enters either new
code path: its field is still an ordinary (non-reactive, since nothing mutates it) field binding, and its
member accesses are still ordinary unresolved `logic.PropertyAccess`/`logic.MethodCall`, refused by the
generator exactly as before. Eligibility is a resolved-type fact from the catalog, never a class name.

## Why member identity does not need a separate instance-identity scheme

A signal's/derived's/action's own `sig.*` node is **one declaration per store class**, shared by every
instance (`CounterStore.count`'s `sig.Derived` is the same node whether read through `store`, `left`, or
`right`) — exactly as a JavaScript class's prototype method is shared by every instance. What varies per
instance is *which object* `.count` is read off, and that is carried entirely by the **receiver** — already
a `logic.Ref` to the field's own (per-instance, symbol-unique) `app.StoreInstance` node, resolving to that
instance's own local JS variable. `target` on the `PropertyAccess`/`MethodCall` only needs to say *which
member*, never *which instance* — the receiver already says that, for free, the same way Dart's own
`store.count` syntax does.

## Rejected alternatives

- **Extend `logic.New` with a `target` to the `app.Store`** (Phase 5 Option A): solves declaration identity
  but not instance identity, because `logic.New` is content-addressed and collapses across instances
  (proven directly, see Evidence) — and does not solve member identity at all. Rejected as insufficient on
  its own.
- **Have the analyzer rewrite eligible construction into an existing binding/store construct without a new
  node kind** (Option C): considered, but `sig.Signal` already means "a value," and giving it an alternate
  meaning when a `store` field is present would make every consumer of `sig.Signal` (which today assumes a
  plain value) branch on a field it did not expect. A dedicated kind keeps each node kind meaning one
  thing.
- **Resolve member access by receiver name + property string, searching `app.Store.members`** (Phase 6's
  explicitly forbidden shape): rejected outright — this is exactly the name-matching this platform's own
  precedent (ISSUE-18, ADR-18) has already been burned by once.
- **A second store consumption mechanism, parallel to M7-F's provided/promoted one**: rejected.
  `useLocalStore` returns the identical shape `useStore` does and is consumed by the identical
  `declareStoreConsumption`/`useSignal` machinery; only the *acquisition* of the instance (own vs.
  provided) differs, not member meaning.

## Consequences

- `FavoritesStore`-shaped code (a locally-owned `ChangeNotifier` field, its signal/derived/action members
  read via `.member`) is now representable end to end, without inventing a second object model or any
  textual matching.
- Store pass-through (parameters, factory returns, collections) remains unsupported, honestly, pending
  either alias analysis or a further schema decision neither of which this ADR makes.
- Ordinary, non-store user classes remain unsupported by design, unchanged.
- `store.ts` (the generator's `app.Store` emitter) needed no changes at all — it already emits a correct
  `defineStore(...)` for `origin: 'declared'` stores; this ADR only makes their *consumers* resolvable.
