# Riverpod — measured usage and the supported-subset design

Status: **inventory measured; design proposed; a first real slice implemented and verified (§4a).** This is the input
to an ADR, not the ADR.
Numbers come from `tools/riverpod-inventory/inventory.mjs` (a textual count of `.dart` files, tests excluded), run on
disposable copies of the two real applications used as a corpus (raw output: `riverpod-usage-A.json`,
`riverpod-usage-B.json`). A textual count sizes the feature and names files; the compiler's own recognition must be
analyzer-based (resolved type identity from `package:flutter_riverpod` / `package:riverpod`), never spelling.

## 1. What the two applications use

| Construct | App A (240 files) | App B (476 files) |
|---|---:|---:|
| Dart files importing Riverpod | 29 | 173 |
| `Provider(` | 11 | 65 |
| `Provider.family` | – | 2 |
| `StateProvider` | – | 51 |
| `StateNotifierProvider` / `extends StateNotifier` | 9 / 9 | 2 / 2 |
| `NotifierProvider` | – | 2 |
| `FutureProvider` | – | 149 |
| `StreamProvider` | – | 24 |
| `.family` modifier | 3 | 88 |
| `.autoDispose` modifier | – | 222 |
| `ProviderScope` | 1 | 2 |
| `overrides:` / `.overrideWith` (lib code) | – | 1 / 4 |
| `ConsumerWidget` | 1 | 137 |
| `ConsumerStatefulWidget` + `ConsumerState` | 12 + 12 | 93 + 93 |
| `Consumer(` builder | – | 5 |
| `ref.watch` | 29 | 667 |
| `ref.read` | 25 | 254 |
| `ref.listen` | – | 14 |
| `ref.invalidate` | – | 295 |
| `ref.refresh` | – | 4 |
| `ref.onDispose` | 2 | 4 |
| `.notifier` | 20 | 78 |
| `.future` | – | 54 |
| `.select(` | – | 170 |
| `.when(` / `.maybeWhen(` / `.whenData(` | – | 70 / 8 / 6 |
| `AsyncValue` (named) | – | 59 |
| `.valueOrNull` / `.requireValue` | – | 272 |

Not used by either (so out of the first subset, and refused with a precise diagnostic rather than approximated):
`@riverpod` code generation, `AsyncNotifier`/`StreamNotifier`, `ChangeNotifierProvider`, `HookConsumerWidget`,
`ref.keepAlive`, `ref.exists`, `UncontrolledProviderScope` in lib code, `ProviderContainer` in lib code.

`overrides:` and `ProviderContainer` are dominated by **tests** (hundreds of uses) and are not part of the compiled
application; in `lib/` they are limited to a handful of `ProviderScope(overrides: …)` sites.

### What the shapes look like

- **App A** is the small-surface shape: a `StateNotifier<S>` holding a sealed state class, exposed by a
  `StateNotifierProvider<N, S>((ref) => N(repository: ref.watch(repoProvider)))`, read by `ConsumerStatefulWidget`s
  with `ref.watch(p)` (state) and `ref.read(p.notifier).method()` (commands). The dependency graph is a two-level chain:
  repository `Provider` → controller `StateNotifierProvider` → screen.
- **App B** is the async-data shape: `FutureProvider.autoDispose.family<T, Arg>` per query, screens read
  `ref.watch(p(arg))` and branch on `.when(data:, loading:, error:)` or `.valueOrNull`, and mutations end with
  `ref.invalidate(p)` (295 sites — the single most used operation after `watch`). `StateProvider` holds UI filters;
  `select` narrows rebuilds.

## 2. The semantic model that has to be preserved

A provider is not a store field. The behaviours below are observable in a running application, and each one must have a
test against the real `flutter_riverpod` before it is claimed:

1. **Lazy creation.** A provider's body runs on first read, not at declaration.
2. **One value per (provider, family argument).** Two reads of `p(1)` are the same instance; `p(1)` and `p(2)` are
   different. Family arguments are compared by `==`/`hashCode`, so value-equal records and enums must collide and
   identity-distinct objects must not.
3. **Dependency graph via `ref.watch` inside a provider.** When a watched provider changes, the dependent is
   disposed and re-created, and its own watchers are notified. `ref.read` inside a provider creates no edge.
4. **`ref.watch` in a widget subscribes; `ref.read` does not.** A widget rebuilds when a watched provider's value
   changes (by `==`, except `AsyncValue` transitions and `StateNotifier` state), never when a read one does.
5. **`select`** narrows a subscription to a projection compared by `==`.
6. **`ref.listen`** runs a callback with `(previous, next)` on change and does not rebuild.
7. **Lifetime.** Without `autoDispose` a provider lives as long as its container. With it, it is disposed one frame
   after its last listener leaves, and `ref.onDispose` callbacks run then; re-reading re-creates it.
8. **`AsyncValue`.** `FutureProvider`/`StreamProvider` yield `AsyncLoading` → `AsyncData`/`AsyncError`. A refresh keeps
   the previous value (`isRefreshing`, `hasValue`, `valueOrNull` still answers) — the property `.valueOrNull` (272
   uses in B) depends on.
9. **`invalidate` / `refresh`.** Invalidate marks the provider for re-creation on next read (or immediately if it has
   listeners); refresh does it and returns the new value.
10. **`StateProvider`/`StateNotifier`** notify on `state = x` when the new value is not `==` the old.
11. **Scopes and overrides.** `ProviderScope(overrides: [...])` substitutes providers for its subtree; nested scopes
    inherit.

## 3. Where it fits in the frozen architecture

No new UIR node kind is needed for the subset below, so no spec amendment. It follows the shape that worked for `dio`
(ADR-0075): a **runtime library + a package adapter + one generator rule**.

- **Runtime kit** (`packages/runtimes/react`): a small `ProviderContainer` implementing §2 — providers as plain objects
  `{ kind, create(ref), family?, autoDispose }`, a per-container cache keyed by provider identity + family key, a
  dependency graph, and `useSyncExternalStore`-based hooks `useWatch(provider)` / `useListen(provider, fn)`;
  `ProviderScope` is a React context holding a container. `AsyncValue` is a runtime class with the real API
  (`when`, `maybeWhen`, `whenData`, `valueOrNull`, `requireValue`, `isLoading`, `hasValue`, `isRefreshing`).
- **Analyzer adapter**: recognises providers, consumers and `ref` operations by the **resolved element** (library
  `package:riverpod`/`flutter_riverpod`), the way the dio adapter recognises `Dio`. A provider declaration becomes a
  top-level `logic.New` of the runtime class with its `(ref) => …` closure, so the existing top-level-value and
  lambda emission carries it. `ConsumerWidget.build(context, ref)` and `ConsumerState.ref` bind `ref` as the
  component's container handle.
- **Generator rule (the one hard part).** `ref.watch(p)` in a `build` is a *subscription*, i.e. a hook. ADR-0048 inlines
  build-locals so each use would become its own hook call, with conditionally-executed ones violating the rules of hooks.
  The rule: every `ref.watch`/`ref.listen` reachable from a `build` is **hoisted to the top of the component**, in
  source order, exactly as `declareLocalSignals` already hoists signal subscriptions, and reads inside the body use the
  hoisted value. A `ref.watch` whose provider argument depends on a value only known later in the body (a family
  argument computed from a local declared after a conditional) cannot be hoisted and is **refused with a diagnostic naming
  the source span**, not approximated.
- **Inside providers and notifier methods** `ref` is the container-side ref — no hooks, direct calls.

## 4. Proposed supported subset (v1)

SUPPORTED: `Provider`, `StateProvider`, `StateNotifierProvider` (+ `extends StateNotifier`), `FutureProvider`,
`StreamProvider`, `NotifierProvider` (+ `extends Notifier`); `.family` (single argument: primitive, enum, record of
primitives, or a value class with `==`); `.autoDispose`; `ConsumerWidget`, `ConsumerStatefulWidget`/`ConsumerState`,
`Consumer`; `ref.watch`, `ref.read`, `ref.listen`, `ref.invalidate`, `ref.refresh`, `ref.onDispose`, `.notifier`,
`.future`, `.select`; `AsyncValue` and its `when`/`maybeWhen`/`whenData`/`valueOrNull`/`requireValue`;
`ProviderScope` with `overrides:` using `overrideWithValue`/`overrideWith`.

DOCUMENTED DIFFERENCE (to be measured, then written down): disposal timing (Flutter disposes after a frame; the runtime
uses a microtask/`queueMicrotask` after the last unsubscribe), `Duration`-based `cacheFor`, error reporting to the
zone.

EXPLICITLY REFUSED with a precise diagnostic: `@riverpod`/`riverpod_generator`, `AsyncNotifier`/`StreamNotifier`/
code-generated families, `ProviderContainer` constructed in application code, `ref.keepAlive`, `ref.exists`,
`ref.state` outside a notifier, dynamic family arguments that are not comparable, `ref.watch` that cannot be hoisted.

## 4a. Implemented (this milestone) — real, verified, committed

The runtime side of §3 is fully built and oracle-verified (`packages/runtimes/react/src/internal/riverpod/`,
`fixtures/riverpod_oracle`): `ProviderContainer`, `AsyncValue`, `ProviderScope`/`useWatch`/`useRead`/`useListen`. See
its own commit for the 28 recorded scenarios and 19 killed mutations.

The **compiler** side is real but narrower than §4's proposal — a first slice, chosen to be everything a provider's
own dependency graph needs plus enough widget-side consumption to be reachable at all, while leaving the one hook
(literally, React's) undone rather than rushed:

- **SUPPORTED**: `Provider`, `StateProvider`, `StateNotifierProvider` as plain constructions (`package_kit.ts`, the
  same mechanism `dio` uses — ADR-0075) — including as an argument to another provider's own `ref.watch`/`.read`, so a
  dependency chain (`doubledProvider` reads `baseProvider`, `labelProvider` reads `doubledProvider`) lowers correctly.
  Inside a provider's own `create` closure, `ref.watch`/`.read`/`.listen`/`.invalidate`/`.refresh`/`.onDispose` are
  plain calls onto the runtime's own `Ref` (recognized structurally, by the parameter's resolved type —
  `package:riverpod/…` — never by the name `ref`, `expression.ts`'s `isRiverpodProviderRef`). From a
  `ConsumerWidget`/`ConsumerState`, `ref.read`, `.invalidate`, `.refresh` and `.onDispose` are supported the same way,
  through one `const ref = useProviderContainer();` the component emitter hoists once, only when the tree needs it
  (`component.ts`'s `declareRiverpodRef`, the same pattern `useRouter()`/`useMounted()` already use). A provider's own
  `.notifier`, `.future` and `.select` are supported wherever a provider value is read, in either context. `providers.tsx`
  wraps the application root in the kit's `ProviderScope` whenever the program uses Riverpod at all — unconditionally,
  like `ThemeProvider`/`RouterProvider` already are, never derived from the program's own (unmodelled) `ProviderScope`
  construction, since root discovery starts from `MaterialApp` and never sees it.
- **`StateNotifier` subclasses**, including every real shape both corpora's own controllers use: a zero-arg
  constructor (`CounterController() : super(0);`), a constructor-injected dependency (positional or named
  field-formal), a defaulted parameter, a `sealed`/enum-of-classes `state` type read through `switch`/pattern
  matching, an `async` method that awaits before writing `state`, and `@override void dispose() { …; super.dispose();
  }`. A `class X extends StateNotifier<S>` is extracted as an ordinary **general class** (ADR-0055) — *not* an
  `app.Store` (a `StateNotifier` was removed from `catalog/widgets/material.json`'s `storeBases`, the same table
  `ChangeNotifier` is still in: its own `state` is inherited, not a field the subclass declares, so the `app.Store`
  extraction that suits a `ChangeNotifier`'s own declared fields cannot see it, and Riverpod's own consumption
  constructs a *value* — a `StateNotifierProvider<N, S>((ref) => N(...))`'s create closure — which is what a general
  class's own `logic.New` already means and what `app.Store`'s own `defineStore` deliberately does not, ADR-15/19).
  `dart_classes.ts` gives a class extending a **kit-provided** superclass a real `constructor()` that calls a real
  `super(...)` first (JavaScript's own rule) and then the class's usual `$init` (`docs/m14/riverpod-usage-matrix.md`
  §4a); `package_kit.ts`'s `kitSuperclassMembers` is what maps a bare, inherited `state`/`mounted` read to
  `this.state`/`this.mounted`. Two real, narrow generator gaps this surfaced and fixed along the way, both general
  (not Riverpod-specific): a kit-provided generic type's own type argument that is a *project* class could not
  resolve through the analyzer's own text-only fallback for an external type's arguments (`raw_node_emitter.dart`'s
  `typeRef` now carries a real, structured `typeArguments` array for a class's own `superclass` field, the one
  caller that needs it); and a TypeScript class with a `#private` field of its own type parameter is not a
  structural subtype of the identical class instantiated at `unknown` (contravariance) — the runtime's
  `StateNotifierProvider<N extends StateNotifier<any>>` bound, not `<unknown>`, is why.
- **EXPLICITLY REFUSED, precisely** (not silently dropped): `ref.watch`/`ref.listen` from a `ConsumerWidget`/
  `ConsumerState` — a real subscription needs to become a hook, hoisted to the top of the component exactly as
  ADR-0048 already hoists a signal read, and that hoisting is not built (`expression.ts` reports this by name, before
  `ref` is even evaluated, distinct from the generic "not declared" message). A class extending a kit superclass with
  more than one constructor, or only a factory one (JavaScript allows exactly one real `constructor()`), or with a
  `super(...)` call passing a named argument or forwarding a `super.` parameter — none observed in either corpus.
  `.family`, `.autoDispose`, `FutureProvider`, `StreamProvider`, `NotifierProvider`, `Consumer`, `select`/`listen`/
  `when` and `ProviderScope(overrides: …)` remain covered only by the blanket `BRG3020` "no adapter" warning — real,
  but not yet differentiated the way `dio`'s `onlyClasses` differentiates its own remaining gaps.

Verified: `fixtures/apps/riverpod_basic` + `riverpod_state_notifier` + `packages/generators/react/tests/
riverpod_build.test.ts` + `riverpod_state_notifier_build.test.ts` — real analyzer output, real `bridge normalize`,
real generator, real `tsc --strict` against the real kit, real `next build`, and manual Chromium runs (server-
rendered values match real Dart's answer for the same program; a click that writes `state` through `.notifier`
completes with no console error).

### Known gaps found while implementing this (named, not fixed)

- **A statement-bodied top-level provider closure, referenced transitively from a *second* emitted component's own
  module, loses its own local variables.** `final base = ref.watch(baseProvider); return base * 2;` as a top-level
  `Provider<int>`'s `create` reports `` `base` is not declared `` — but *only* when (a) the body is a block, not a
  single expression, *and* (b) the program has more than one `ui.Component` and the provider is reached from other
  than the first one emitted. The identical closure, referenced directly from the program's only/first component,
  lowers correctly (confirmed directly: `fixtures/riverpod_oracle`-adjacent probes in `/tmp` during this session,
  not committed as fixtures, isolated the exact trigger — see the session record if this needs reproducing). This is
  not Riverpod-specific — nothing in this milestone's own lowering code touches locals inside a lambda — so it is a
  pre-existing gap in top-level-constant emission this work exposed, not one it introduced. `riverpod_basic`'s own
  fixture is deliberately expression-bodied throughout to avoid it, and its own file header says so. **Next step**:
  isolate with a non-Riverpod, minimal top-level-constant fixture (a project class taking a statement-bodied
  callback, constructed at top level, referenced from a second component) and root-cause in `pipeline.ts`'s top-level
  value emission.
- **`ref.watch`/`ref.listen` hook-hoisting.** The real, hard remaining piece: every `ref.watch`/`ref.listen`
  reachable from a `build` must be hoisted to the top of the component, in source order, unconditionally — the same
  rule `declareLocalSignals` already applies to a signal read (ADR-0048) — and a `ref.watch` whose provider argument
  depends on a value known only later in the body must be refused, not approximated. Deliberately not attempted this
  pass: it touches the same component-emission core as signals do, and rushing it risked a *wrong*, silently-passing
  hook-order bug rather than a clean refusal — worse than what shipped instead.

## 5. How it will be verified

1. **Oracle against the real package.** A Dart test using `flutter_riverpod` records, for each scenario, the sequence of
   `(provider, value|AsyncState, build count, dispose count)` events; the generated runtime is driven through the same
   scenario and the traces are compared — the same fixture-oracle method used for widgets. Scenarios: lazy creation,
   watch chain A→B→C with a change at A, `read` vs `watch`, family equality (records, enums, identity-distinct
   objects), `select` narrowing, `listen` previous/next, `autoDispose` with a re-read after the last listener leaves,
   `invalidate` with and without listeners, `AsyncValue` refresh keeping the previous value, `StateNotifier` no-op
   assignment, nested scope override.
2. **Mutation tests** (skipped = killed): drop the dependency edge; make `read` subscribe; key family by identity; never
   dispose; drop `isRefreshing`'s previous value; notify on equal assignment; ignore overrides; hoist out of order.
3. **Browser.** A fixture app run in Chromium: a screen with a `FutureProvider.autoDispose.family` list, filter
   `StateProvider`, `invalidate` after a mutation, `.when` branches for loading/error/data, driven with a real click and
   a fulfilled/failed network route.
4. **Real-app measurement.** Re-run the taxonomy on A (which uses only the StateNotifier/Provider/Consumer subset) and B
   after each stage; a Riverpod-related error count must fall and no new silent loss may appear.

## 6. Order of work

1. Runtime `ProviderContainer` + `AsyncValue` + hooks, with the oracle scenarios (no compiler changes; testable alone).
2. Analyzer recognition and top-level provider emission for `Provider`/`StateNotifierProvider` + `ConsumerStatefulWidget`
   — this is all App A needs.
3. Hoisting rule for `ref.watch` in `build`; `ConsumerWidget`; `.select`, `.listen`.
4. Async family: `FutureProvider`/`StreamProvider`, `.family`, `.autoDispose`, `invalidate`, `.when`.
5. `ProviderScope` overrides; refusal diagnostics for the unsupported list; documentation and an ADR (number to be
   assigned when written — coordinate with whoever holds the ADR sequence).
