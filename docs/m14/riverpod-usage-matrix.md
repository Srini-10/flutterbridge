# Riverpod — measured usage and the supported-subset design

Status: **inventory measured; design proposed; real, verified slices implemented incrementally (§4a: `Provider`/
`StateProvider`/`StateNotifierProvider`/`StateNotifier` subclasses; §4b: `.family`/`.autoDispose`, plain
`FutureProvider`/`StreamProvider`; §4c: `ref.watch`/`ref.listen` hook-hoisting; §4d: `AsyncValue<T>`
consumption outside widget position).** This is the input to an ADR, not the ADR.
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
- **`ref.watch`/`ref.listen` from a `ConsumerWidget`/`ConsumerState`'s own render position are now supported**
  (§4c, a later milestone than this one — hoisted to the top of the component, ADR-0048's own rule) — a call
  reached only from inside a callback or a `ui.List` item template still refuses, precisely, since a hook
  cannot run there either way. A class extending a kit superclass with more than one constructor, or only a
  factory one (JavaScript allows exactly one real `constructor()`), or with a `super(...)` call passing a
  named argument or forwarding a `super.` parameter — none observed in either corpus.
  `NotifierProvider`, `Consumer`, `select` and `ProviderScope(overrides: …)` remain covered only by the
  blanket `BRG3020` "no adapter" warning — real, but not yet differentiated the way `dio`'s `onlyClasses`
  differentiates its own remaining gaps (`.family`/`.autoDispose`/plain `FutureProvider`/`StreamProvider`
  construction are supported as of §4b; `AsyncValue.when`/`.valueOrNull`/… consumption outside widget
  position is supported as of §4d, below — widget-position `.when(...)` remains a separate, general,
  non-Riverpod gap, §4d's own account).

Verified: `fixtures/apps/riverpod_basic` + `riverpod_state_notifier` + `packages/generators/react/tests/
riverpod_build.test.ts` + `riverpod_state_notifier_build.test.ts` — real analyzer output, real `bridge normalize`,
real generator, real `tsc --strict` against the real kit, real `next build`, and manual Chromium runs (server-
rendered values match real Dart's answer for the same program; a click that writes `state` through `.notifier`
completes with no console error).

## 4b. Implemented (this milestone) — `.family`, `.autoDispose`, plain `FutureProvider`/`StreamProvider`

Real-corpus inventory, done before any implementation (per this milestone's own discipline): App A has exactly
3 `.family` declarations, all `StateNotifierProvider.family<N, S, Arg>`, zero `.autoDispose`, args `String`/
`String`/an enum — consumed as `final p = xProvider(widget.prop); ref.watch(p); ref.read(p.notifier)`. App B has
~8 `.family`/`.autoDispose.family` declarations across `Provider.family`, `Provider.autoDispose.family`,
`FutureProvider.autoDispose.family` (dominant), `StreamProvider.autoDispose.family`, `StateProvider.autoDispose.family`
(`customersFirmFilterProvider`/`customersAgentFilterProvider`, read through both `ref.watch` and
`ref.read(p(arg).notifier).state = v`) — all `String`/`String?` arguments, plus one real family-depends-on-family
chain (`resolvedPriceProvider`'s body calls `ref.watch(productRevisionProvider(productId))`, the same argument
passed through). No object/record/multi-parameter/named-parameter family keys in either corpus.

**What `.family`/`.autoDispose` actually are, structurally**: `Provider.family` and `FutureProvider.autoDispose`
are Dart *static getters* returning a **builder** value (`package:riverpod/src/builders.dart` —
`ProviderFamilyBuilder`, `AutoDisposeFutureProviderFamilyBuilder`, …, one per kind×autoDispose×family
combination, confirmed directly against real analyzer output for every shape either corpus uses); the trailing
`(create)` is a `.call` on that builder. Recognition (`riverpod_family.ts`'s `riverpodBuilderShapeOf`) reads the
combination off the builder's own **resolved type name** — never the source spelling (`Provider.family` vs
`itemByIdProvider`), so two differently-named providers of the same kind reach the identical code path, per
this milestone's own "do not special-case provider names" constraint. A family *applied* to its argument
(`itemByIdProvider('a')`) reaches the analyzer as the same `method: 'call'` shape Dart gives any callable-class
value (`operator call`) — recognized separately (`isRiverpodFamilyValue`), by the *value's* own resolved type
(`ProviderFamily<T, A>`, …), since the pre-existing "function value invoked via `.call()`" lowering only ever
recognized Dart's own `Function` type, not a package's callable class.

**Lowering**: a non-family shape (`Provider.autoDispose<T>(create)`) reuses the *identical* runtime value class
a plain `Provider(create)` already uses (`package_kit.ts`'s `logic.New` path) — `new Provider(create, {
autoDispose: true })` — now joined by `FutureProvider`/`StreamProvider` classes (added this milestone,
mirroring `Provider`/`StateProvider` exactly) for the plain, no-builder-chain construction case. A family shape
becomes a runtime **function**: `defineFamily<T, A>('kind', create, options)` for `provider`/`future`/`stream`
(`T`/`A` read off the field's own declared type, `ProviderFamily<T, A>` — a `future`/`stream` value is
`AsyncValue<T>`, what a watcher actually reads, not `create`'s own return); `defineStateFamily`/
`defineStateNotifierFamily` for `state`/`stateNotifier`, added this milestone as the family analogue of the
already-existing `StateProvider`/`StateNotifierProvider` value classes — both needed because `.notifier` must
stay concretely typed (`StateController<T>` / the notifier's own class, not `unknown`), the identical reason
their non-family siblings exist as their own classes rather than a generic `defineProvider` call. Neither new
family function takes an explicit type argument: both `T` and `A` (and, for `defineStateNotifierFamily`, the
notifier class `N`, with the state type `S` derived from it via `infer`) are inferred from `create`'s own
signature, exactly as `StateProvider`/`StateNotifierProvider` already infer theirs.

- **SUPPORTED**: `Provider.family`, `Provider.autoDispose`, `Provider.autoDispose.family`,
  `StateProvider.autoDispose.family`, `FutureProvider.autoDispose.family`, `StateNotifierProvider.family`, plain
  (non-builder-chain) `FutureProvider(create)`/`StreamProvider(create)` — every shape either real corpus
  declares, plus (generically, from the same table, untested against a real corpus instance because neither
  uses it) `StreamProvider.family`/`.autoDispose`, `StateProvider.family` (no `.autoDispose`), and
  `StateNotifierProvider.autoDispose` (reuses the existing `StateNotifierProvider` class with `{ autoDispose:
  true }}`, needing no new runtime code at all). A program may mix family and non-family declarations of the
  same kind freely (App A/B both do); each lowers independently.
- **Family key equality**: unchanged from the already-built, already-oracle-verified `ProviderContainer`
  (`dartEquals`/`bucketOf`, prior milestone) — this work only ever supplies the family *value* through a new
  typed surface, never touches key comparison. Proven again here with a fresh differential: two `family(arg)`
  calls with `==`-equal (not `identical`) arguments read/mutate the same member; two different arguments do not
  (`packages/runtimes/react/tests/riverpod_family_typed.test.ts`).
- **EXPLICITLY REFUSED, precisely**: a `.family`/`.autoDispose` call passing Dart named arguments (`name:`,
  `dependencies:` — real Riverpod accepts them on some builders; not observed in either corpus, refused rather
  than guessed at, the same `refuseNamedArgs` diagnostic every other kit-provided construction already gives);
  a `.call(...)` with other than exactly one argument; any builder type name this generator's table does not
  know (an `AsyncNotifierProviderBuilder`, were one ever added to real riverpod's own public API, refuses by
  name rather than mis-lowering into some other kind).
- **NOT YET CONSUMABLE (as of §4b; `ref.watch`/`ref.listen` hoisting landed in §4c, below)**: at the time §4b
  was written, family/autoDispose declarations lowered correctly and were verified only via `ref.read`,
  since the real corpora's own dominant consumption pattern (`ref.watch(p(arg))` in a `build`) was still
  blocked on hook-hoisting. `AsyncValue.when`/`.valueOrNull`/`.hasError` (real
  App B widget code reads all three directly on a `FutureProvider`/`StreamProvider` result) has no generator
  recognition yet — the runtime's own `AsyncValue` already implements them (oracle-verified), but nothing lowers
  a Dart `.when(...)`/`.valueOrNull` call onto it. `dart:async`'s `Stream` is not yet a kit-mirrored value
  type (unlike `Future`), so a provider `create` that constructs one directly (`Stream<T>.value(x)`,
  `Stream<T>.periodic(...)`) still refuses — found live while proving `StreamProvider`'s own construction
  path, not a regression (this generator never supported constructing a `Stream` before this milestone
  either); the real corpus does not hit it (App B's own stream providers wrap a repository method's return,
  never construct one from a raw SDK `Stream` static).

**A general (non-Riverpod) bug found while building this milestone's own fixture — fixed in a later,
separate commit, root-caused in the analyzer, not the generator**: an expression-bodied `void`-returning
method (`void increment() => state = state + 1;`) lowered its assignment's own *value* as the method's
return (`return (this.state = intAdd(this.state, 1), this.state);`), which did not typecheck against its
own `void` return type. Root cause: Dart's own rule for `void f() => e;` is that `e` is evaluated for its
effect and the function returns nothing (the language does not even require `e`'s own type to be
assignable to `void`) — the analyzer's `ExpressionExtractor.bodyOf`
(`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`) unconditionally wrapped every
arrow body in `logic.Return`, regardless of the declared return type, a raw-UIR representation bug rather
than a generator one. Fixed generically across every extraction path that has a declared return type — a
general class's own method, a top-level function, an extension member, a widget's own lifecycle method and
its own action (sync and `async`) — never Riverpod-specific, and never by special-casing one fixture.
Verified: `fixtures/apps/void_expression_bodies` + `void_expression_bodies_build.test.ts` (real analyzer →
normalize → generate → `tsc --strict`) + 8 dedicated Dart-level extraction tests
(`dart/bridge_analyzer/test/extraction_test.dart`), mutation-tested (reverting the analyzer change alone
reproduces 5 of those 8 failing; restoring it passes all 8 again).

Verified: `fixtures/apps/riverpod_family` + `packages/generators/react/tests/riverpod_family_build.test.ts`
(real analyzer output, real `bridge normalize`, real generator, real `tsc --strict` against the real kit) +
`riverpod_family_shape.test.ts` (the two pure recognizers, including refusal edges) +
`packages/runtimes/react/tests/riverpod_family_typed.test.ts` (the new typed family/value wrappers, behavioral,
against the container's own already-oracle-verified semantics).

## 4c. Implemented (this milestone) — `ref.watch`/`ref.listen` hook-hoisting

"The major current App A blocker" (§3/§6) — every `ref.watch`/`ref.listen` reachable from a
`ConsumerWidget`/`ConsumerState`'s own render position is now hoisted to the top of the component,
unconditionally, in source order, exactly as `declareLocalSignals` already hoists a signal subscription
(ADR-0048).

**What "render position" means, structurally**: `component.ts`'s `declareRiverpodWatches`/
`declareRiverpodListens` walk `renderRoot(component)` (the `prelude` statements a statement-bodied `build`
runs, plus the render tree itself, ADR-0062) collecting every `ref.watch`/`ref.listen` `logic.MethodCall`,
but never descend into a `logic.Lambda` (a callback: `onPressed`, `ref.listen`'s own callback) or a
`ui.List`'s own `template` (its per-item scope) — a hook cannot run conditionally or a variable number of
times per render, and those are the two shapes in this schema where that could happen. A call reached only
from one of them is left uncollected and still hits the ordinary "cannot hoist" refusal, now naming the
actual reason (a callback or a list template, not a blanket "not built yet").

**The one real surprise, corrected mid-implementation**: this milestone's own §4b assumed a `final provider
= xProvider(widget.prop); ref.watch(provider);` local was already inlined away by the time it reaches the
generator — true of *raw* analyzer output, **false** after the full N1–N11 normalize pipeline (`bridge
generate`'s own path, and every build-proof test's `compiledFrom`): `provider` survives as a genuine
`prelude` local, and `ref.watch`'s own argument is a real `logic.Ref` targeting it. Hoisting therefore
substitutes such a reference with the local's own initializer (`substitutePreludeLocals`) before emitting
the hoisted call — recursively, so a chain of locals resolves to one self-contained expression — but only
for a **top-level** (never nested inside a conditional within the prelude) **`final`** (never a reassignable
`let`) local (`topLevelPreludeVarDecls`): exactly the shape where evaluating the initializer again, at the
top of the component instead of at its own prelude position, is sound. Anything left over that still reads a
`prelude` local after substitution — declared inside a conditional, or reassignable — is refused, by its own
span, matching this design's own original "cannot be hoisted, refused" clause; App A's own real shape
reaches this cleanly, not the refusal (`fixtures/apps/riverpod_watch` reproduces it exactly, real
`tsc --strict`-verified). The ordinary prelude-statement emission still runs afterward, unchanged — `provider`
own `const provider = …;` is still emitted (computing the same expression a second time, harmlessly, since a
family-key lookup is pure), and `count`'s own initializer becomes `const count = w$0;`, the hoisted local,
never a second subscription.

**`ref.listen`**: the identical hoisting, to `useListen(target, callback)`, with one difference — neither
real corpus ever reads a `ref.listen` call's own return value (a `Subscription`), so its usual bare-statement
position (`ref.listen(...);`, how both corpora write it) is not emitted at all once hoisted
(`statement.ts`'s `logic.ExprStmt` case), rather than a dead `undefined;` line. Supported: exactly `target`
and its `(previous, next)` callback — a `fireImmediately`/`onError` named argument refuses (neither corpus
uses one).

**§7 preserved, proven again here**: a provider watching another provider inside its own `create` closure
(`doubledProvider = Provider<int>((ref) => ref.watch(baseProvider) * 2)`) still lowers to a plain call —
`new Provider((ref) => ref.watch(baseProvider) * 2)` — never a `useWatch` hook; the distinction was already
correct before this milestone (`isRiverpodProviderRef` vs `isWidgetRefType`, §4a) and nothing about
hoisting-for-widgets touches it, which `riverpod_watch_build.test.ts` asserts directly.

Verified: `fixtures/apps/riverpod_watch` + `packages/generators/react/tests/riverpod_watch_build.test.ts` —
real analyzer output, real `bridge normalize` (the full pipeline, not raw analyzer output — see the surprise
above), real generator, real `tsc --strict` against the real kit; App A's own exact pattern
(`final provider = xProvider(widget.prop); ref.watch(provider); …; ref.read(provider.notifier).method()`),
`ref.listen` as a bare statement, and a provider-internal `ref.watch` all in one fixture.

## 4d. Implemented (this milestone) — `AsyncValue<T>` consumption

The highest-value remaining Riverpod gap by App B's own generator taxonomy at the time this milestone
started (859 occurrences in the coarse "Riverpod" root-cause bucket). Real-corpus inventory, done before
any implementation, across App B and its own local feature packages (`.when(`/`.maybeWhen(`/`.whenData(`
live mostly in `features/*`, not `apps/customer` itself — App B's own dependency graph, not a wider scan):
`.valueOrNull` (262), `.isLoading` (131), `.hasError` (82), `.hasValue` (73), `.when(` (68), `AsyncValue<`
named (59), `.maybeWhen(` (8), `.whenData(` (6), `.requireValue` (10). **Not found anywhere in either real
corpus**: `switch`/pattern-matching on `AsyncData`/`AsyncLoading`/`AsyncError`, `.unwrapPrevious`,
`.copyWithPrevious`, `.asData`, `.asError` — none implemented, per this phase's own "do not implement from
assumptions" discipline.

**The fix, in full**: one row. `AsyncValue` (`package:riverpod/src/common.dart`) is added to
`package_kit.ts`'s existing `riverpod` entry in `KIT_PACKAGE_CLASSES` (ADR-0075's own table, the mechanism
`dio` already uses) — nothing else changed. That table's own header comment already states the generic
rule every kit-provided type gets: "a member read of it is a property of the runtime class"; "named
arguments become one trailing options object." The runtime's own `AsyncValue`
(`packages/runtimes/react/src/internal/riverpod/async_value.ts`, already built and oracle-verified by a
prior milestone) already exposes `valueOrNull`/`hasError`/`hasValue`/`isLoading`/`value`/`error`/
`stackTrace`/`requireValue` as getters under the identical Dart names, and `when`/`maybeWhen`/`whenData`
as methods whose own signature is already `(cases: {data, error, loading, ...})` — exactly what "named
arguments become one options object" produces. No new generator code, no new runtime code: the existing,
general mechanism simply had never been pointed at this type.

- **SUPPORTED**: every property above, and `.when`/`.maybeWhen`/`.whenData`, **wherever the call's own
  result is not itself placed directly as widget-tree content** — assigned to a local, interpolated into a
  string, passed as a non-widget argument, chained (`.whenData(...).valueOrNull`). `ref.read(x).requireValue`
  inside a callback works the same way (type-driven recognition, not position-driven).
- **NOT REACHED, precisely, not silently**: `.when(...)` (or `.maybeWhen`) embedded *directly* as
  widget-tree content — `body: async.when(loading: () => Widget, ...)`, `child: async.when(...)` — which is
  **the dominant real shape**: re-running `bridge generate` on App B directly after this fix, every one of
  the 57 remaining `.valueOrNull`/`.when`/`.hasError`/… mentions in its own error output traces to one of
  two *pre-existing, general, non-Riverpod* causes, neither touched by this fix:
  1. **"a widget returned by a call"** (`BRG3004`, "widget returned by a call") — 106 of App B's 249 opaque-
     expression errors overall (most of the rest of that bucket, too, is a different widget-returning-call
     shape). The render-tree extractor models a widget position as a construction, a condition, a list, or
     a bound value — never an arbitrary method call whose *static type* happens to be `Widget` — so *any*
     widget-typed call in that position hits this, `AsyncValue.when` or not. Closing it needs a new
     render-tree construct (conceptually `ui.Cond` keyed on three states instead of a boolean) — a real UIR
     addition, and so an ADR, not a generator fix (CLAUDE.md's frozen-architecture rule).
  2. **"build body with statements"** (`BRG3004`) — an `if` *statement* (not a switch expression) deciding
     what a statement-bodied `build` returns (`if (banners.isEmpty) { ... } else { ... }`,
     `if (pending == null) return ...;`), which is not lowered to `ui.Cond` at all yet — also general, also
     not Riverpod-specific (AsyncValue's own `.hasError`/`.isLoading` just happen to be a common condition
     inside one), also out of this phase's own scope.

  Because of these two, **App B's aggregate generator error count does not visibly fall** from this fix
  alone — a component using both a (now-fixed) `.valueOrNull` read *and* a (still-blocked) widget-position
  `.when()`, or an `if`-statement return, still fails overall, for the *other* reason. This is stated
  plainly rather than left to be inferred from an unchanged taxonomy number (before: 4504 generator errors,
  859 Riverpod-bucketed; after: 4509, 860 — noise-level movement within a coarse, rollup bucket dominated by
  unrelated cascading causes, not a regression and not the fix "not working" — see `tools/taxonomy/`'s own
  root-cause sampling for why a single generic bucket cannot show a narrow fix's effect). The fix's own
  correctness is established directly instead: a dedicated, real-analyzer, real-`tsc`, mutation-tested
  fixture (below), not the aggregate count.

Verified: `fixtures/apps/riverpod_async_value` (every supported property and method, on a
`FutureProvider`-sourced value — the dominant real shape, 149 declarations against `StreamProvider`'s 24;
`AsyncValue`'s own consumption surface does not depend on which produced it) +
`fixtures/apps/riverpod_async_value_widget_position` (the paired **negative** fixture: `.when(...)` in
widget position still reports `BRG3004` precisely, one error, nothing silently dropped) +
`riverpod_async_value_build.test.ts` (real analyzer output, real `bridge normalize`, real generator, real
`tsc --strict` against the real kit, 8/8). Mutation-tested directly: reverting the one `package_kit.ts` row
alone fails 7 of those 8 tests (the negative-fixture test correctly stays green, proving it tests the
*other* thing); restoring it passes all 8 again.

### Known gaps found while implementing §4a (named, not fixed; carried forward from that milestone)

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
  value emission. Still open — §4c's own hoisting work did not touch this path.
- ~~`ref.watch`/`ref.listen` hook-hoisting.~~ **Resolved in §4c below** — this was the gap §4a's own text named
  here as "deliberately not attempted this pass." §4b similarly deferred `.family`/`.autoDispose` and plain
  `FutureProvider`/`StreamProvider`, resolved in §4b above.

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
