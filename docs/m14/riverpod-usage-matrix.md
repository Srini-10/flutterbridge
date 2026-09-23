# Riverpod — measured usage and the supported-subset design

Status: **inventory measured; design proposed; real, verified slices implemented incrementally (§4a: `Provider`/
`StateProvider`/`StateNotifierProvider`/`StateNotifier` subclasses; §4b: `.family`/`.autoDispose`, plain
`FutureProvider`/`StreamProvider`; §4c: `ref.watch`/`ref.listen` hook-hoisting; §4d: `AsyncValue<T>`
consumption outside widget position; §4e: `Notifier`/`AutoDisposeNotifier`/`NotifierProvider`,
non-family/non-async only; §4f: `Consumer(builder: ...)` erasure; §4g: `ref.watch(provider.select(...))`,
verified already working; §4h: `ProviderScope(overrides: [...])` at the application root, self-contained
overrides only; §4i: raw `dart:async` Stream construction investigated, not implemented — every real site is
gated on an unimplemented Supabase realtime adapter, not on `dart:async` itself; §4j: `AsyncValue.when(...)`
placed directly as widget content; §4k: statement-bodied builders — leading locals then one `return` — for
every builder-shaped callback, `Consumer` and `AsyncValue.when` branches included).** This is the input to an
ADR, not the ADR.
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

## 4e. Implemented (this milestone) — `Notifier`/`AutoDisposeNotifier`/`NotifierProvider`

Riverpod 2's own successor to `StateNotifierProvider` — real-corpus inventory, done before any implementation:
**exactly 2 declarations in all of App A + App B combined**, both real App B sites
(`features/orders/lib/src/application/discover_providers.dart`), both the identical shape —
`NotifierProvider.autoDispose<N, S>(N.new)` with `class N extends AutoDisposeNotifier<S>` overriding `build()`.
App A uses `StateNotifierProvider` exclusively (already supported, §4a). **Not found anywhere in either real
corpus**: `.family`, plain (non-`autoDispose`) `Notifier`, `AsyncNotifier`/`AsyncNotifierProvider` — none
implemented, per this phase's own "do not implement from names alone" discipline.

**The architecture**: `Notifier`/`AutoDisposeNotifier` are registered as **kit-provided superclasses**
(`package_kit.ts`'s `KIT_PACKAGE_CLASSES`, the identical mechanism `StateNotifier` already uses, ADR-0055) — a
project subclass is an ordinary general class (its own `build()`/other methods extracted exactly like any other
instance method, its zero-argument `constructor()` synthesized by the pre-existing, fully generic
`dart_classes.ts` machinery with zero changes), and `NotifierProvider`/`.autoDispose` is recognized by
`riverpod_family.ts`'s existing builder-shape table (`riverpodBuilderShapeOf`), exactly like `Provider.autoDispose`
— never by spelling. Two things were genuinely new:

1. **The runtime's own `Notifier<S>`** (`packages/runtimes/react/src/internal/riverpod/container.ts`) —
   deliberately its own class, not built by extending or composing the already oracle-verified `StateNotifier<S>`,
   because `Notifier`'s own construction is a two-step protocol `StateNotifier`'s is not: a zero-argument factory
   builds the bare instance, the container attaches `ref` to it, and only then calls the project's own overridden
   `build()` — `StateNotifier`'s own constructor instead takes the initial state directly, as an ordinary argument.
   What the two classes share is the identical notify-on-change contract (`state`, `mounted`, `dispose()`, the same
   `[ATTACH]` hook), not a common base class.
2. **`this.ref`, not a bare `ref`** — a `Notifier` subclass's own `ref` reaches the generator already
   `this.`-qualified (confirmed directly against real analyzer output), unlike `StateNotifier`'s own bare `state`.
   `expression.ts`'s new `kitSuperclassMemberText` is the `PropertyAccess` sibling of the pre-existing *bare*-read
   resolution (`functions.ts`'s `paramInScope`, built for `StateNotifier`'s own `state`, never `this.state`).

- **SUPPORTED**: `NotifierProvider<N, S>`/`NotifierProvider.autoDispose<N, S>(N.new)` (a constructor tear-off,
  pre-desugared by the analyzer itself into a zero-param lambda — no special-casing needed); a subclass's `build()`
  reading/writing `state`, reading `ref` (`ref.watch`, `ref.listen`, `ref.onDispose`, all as ordinary calls through
  `this.ref`); ordinary instance methods (not just `build()`) reading/writing `state`, including after an `await`;
  `.notifier` read from a widget the ordinary way (`ref.read(p.notifier).method()`).
- **NOT IMPLEMENTED, refused precisely, never silently misfired**: `NotifierProvider.family`/
  `.autoDispose.family` — the runtime's own `'notifier'` case in `container.ts`'s `run()` invokes its factory with
  *zero* arguments unconditionally (it has no family-argument threading, unlike `defineFamily`/
  `defineStateNotifierFamily`), so a family construction reaching it silently would mis-invoke the factory. Recognized
  by the identical `riverpodBuilderShapeOf` table (`{kind: 'notifier', family: true}`, verified at the unit level in
  `riverpod_family_shape.test.ts`) and explicitly refused in `lowerRiverpodBuilderConstruction` with its own
  diagnostic, before the generic `defineFamily` fallback could ever be reached. `AsyncNotifier`/
  `AsyncNotifierProvider` are not registered in `KIT_PACKAGE_CLASSES` at all, so a project that declares one hits the
  pre-existing, general "extends a class this generator does not emit" refusal (`BRG3013`) — the same refusal any
  other unsupported framework/package superclass gets, not a silent misclassification.

Verified: `fixtures/apps/riverpod_notifier` reproduces both real App B shapes exactly (`DeckNotifier`: `build()`
watches another provider, registers `ref.onDispose`, `ref.listen`s a third provider and writes `state` from the
listener's own callback — App B's own `DiscoverDeck`; `HintSeenNotifier`: an ordinary method, called from outside
`build()`, writing `state` after an `await` — App B's own `DiscoverSwipeHintSeenNotifier`) +
`riverpod_notifier_build.test.ts` (real analyzer output, real `bridge normalize`, real generator, real `tsc --strict`
against the real kit, 7/7, including the whole emitted project typechecking) + `riverpod_notifier.test.ts` (4/4
runtime-only: `build()` computes initial state; `ref` throws before `build()` runs and is available inside it;
`.notifier` exposes the concrete subclass and mutation notifies watchers; `autoDispose` constructs a fresh instance
after the last watcher leaves and a new one reads) + `riverpod_family_shape.test.ts` (the `.family` recognition
edge, so the refusal above can fire). Mutation-tested directly against the **real corpus**, not just the fixture:
stashing every Phase-3 source change (`container.ts`, `index.ts`, `package_kit.ts`, `riverpod_family.ts`,
`expression.ts`) and re-running `bridge generate` on a fresh disposable copy of App B reproduces exactly the errors
this fix removes — `DiscoverDeck`/`DiscoverSwipeHintSeenNotifier` both "extends a class this generator does not emit
(AutoDisposeNotifier<…>)", both providers' initializers "`NotifierProvider.autoDispose` is not declared in this
program" — restoring the changes removes every one of them, with no other App B diagnostic content changing. App
B's generator-error count moves from 4510 (Phase-3 changes reverted) to 4506 (restored) on the same disposable copy
— a real, direct, fully-attributed 4-error reduction, not a taxonomy-bucket coincidence (unlike §4d's own AsyncValue
fix, this one is not dominated by a downstream blocker: both real declaration sites fully typecheck and generate).
App A is unaffected (348 generator errors before and after — it declares no `NotifierProvider`). The coarse
"Riverpod" taxonomy bucket moves from 860 (as recorded at the end of §4d) to 857 — consistent with, but not
identical to, the 4-error reduction above, for the same reason §4d's own account gives: the bucket is a rollup
across many unrelated root causes and is not a reliable unit for a narrow fix's own size. Determinism: three
in-process `reactGenerator.generate()` runs over the fixture's own normalized document produce byte-identical
output (file paths and contents, sha256-compared).

## 4f. Implemented (this milestone) — `Consumer(builder: ...)` erasure

Real-corpus inventory, done before any implementation: **exactly 5 `Consumer` declarations in all of App A +
App B combined**, all App B, all the identical shape — a plain `StatelessWidget` (never `ConsumerWidget`/
`ConsumerState`, which is the whole point of using `Consumer`: narrow, scoped `ref` access without making the
enclosing widget Riverpod-aware), `builder: (context, ref, _)`, the `child` parameter always discarded, no site
anywhere passing an explicit `child:` argument to `Consumer` itself. Two of the five sit directly in a class's
`build()` (`customer_form_page.dart`, `onboarding_page.dart`), two in a small `StatelessWidget`'s `build()`
that a list itself constructs per item (`discover_page.dart`'s `_SwipeCard`), one reached directly from a
`GridView.builder`'s own `itemBuilder` (`search_page.dart`'s `_Results`). App A uses none.

**The architecture**: `Consumer` is a **rebuild-scoping wrapper** — INV-22's own text names it explicitly,
alongside `setState`/`context.watch`, as exactly the class of framework machinery extraction erases rather than
renders (`docs/m4/m4i-widget-surface-and-packages.md` §3, quoted in full in §2 above): *"their meaning is
already carried by UIR constructs."* `Builder`/`ListenableBuilder`/`ValueListenableBuilder` already get this
treatment (`catalog/widgets/material.json`'s `rebuildBuilders`, `widget_extractor.dart`'s
`_inlineRebuildBuilder`, M4-I) — `Consumer` never had, simply because M4 predates Riverpod being in scope at
all. **The fix, in full**: one new catalog row, `"Consumer": { "builderProp": "builder" }` (no `valueProp` —
unlike `ValueListenableBuilder`'s `value`, `Consumer`'s `ref` is not bound from a single named outer
listenable), regenerated through `catalog-codegen` into `material_catalog.dart`. Nothing else changed.
Once erased, the builder's own `ref` parameter is an ordinary `WidgetRef`-typed local, and every downstream
mechanism that already resolves and hoists a `ConsumerWidget.build`'s own `ref` is already structural — keyed
on the value's own resolved type (`isWidgetRefType`), never on which class declared it
(`expression.ts`'s `name === 'ref' && isWidgetRefType(...)` resolution; `component.ts`'s
`declareRiverpodRef`/`declareRiverpodWatches`/`declareRiverpodListens`, whose own `collectRiverpodRefCalls`
walks the whole render tree regardless of the enclosing Dart class). Confirmed directly against real analyzer
output before writing a line of the fix: a `Consumer`'s inlined `ref.watch(...)` reaches UIR as the exact same
`logic.MethodCall{method:'watch', receiver: logic.Ref{name:'ref', type: WidgetRef}}` shape a `ConsumerWidget`'s
own would. No new generator or runtime code beyond the one catalog row.

- **SUPPORTED, proven end to end**: a `Consumer` whose own `builder` is expression-bodied, a block of
  exactly one `return` statement, **or (§4k) leading single-variable local declarations followed by one
  `return`**, in an unconditional render position — the wrapper is fully erased (no trace
  of `Consumer` anywhere in the emitted file), its `ref.watch` hoists to `useWatch` at the top of *whichever*
  component it is reached from, even a plain `StatelessWidget` with no `ref` of its own
  (`fixtures/apps/riverpod_consumer`'s own `Footer`, proven independently of `HomeScreen` — each component
  gets its own hoisted watch, not only the first one reached).
- **NOT REACHED, precisely, not silently — two separate, both pre-existing, both general**:
  1. **A block body whose control flow or side effects decide the return** — App B's `if (resolved == null)
     return const SizedBox.shrink(); return AppPrice(...);` shape (2 of its 5 real `Consumer` sites). *(This
     entry originally described "a block with a `final` local before its `return`" — App B's dominant real
     shape, 3 of the 5 sites — as unsupported, because `_widgetOfBody` inlined a block of exactly one
     statement. §4k closed that: the leading-locals shape is now inlined, through `Binding.inlineValue`, in the
     one shared `_bindLeadingLocalsAndReturn`. What remains is genuinely different: an `if`/`switch`/loop
     deciding what is returned has no `ui.*` representation, and guessing which branch runs would be
     inventing.)* The body stays `ui.Opaque('builder body with statements')` (`BRG3004`). Shared identically by
     `Builder`/`ListenableBuilder`/`ValueListenableBuilder`, `ListView.builder`/`GridView.builder`'s
     `itemBuilder` and `FutureBuilder`/`AsyncValue.when` bodies alike.
  2. **`Consumer` reached only from inside a list item template** — `search_page.dart`'s own `_Results` shape.
     Refused by the identical, already-existing mechanism a bare `ref.watch` in the same position already
     gets (`declareRiverpodWatches`'s own `collectRiverpodRefCalls`, which never walks into a `logic.Lambda`
     or a `ui.List`'s own `template` — ADR-0048), verified directly with an isolated probe (an
     expression-bodied `itemBuilder` wrapping an expression-bodied `Consumer`, so limitation 1 above is not
     also in the way): `BRG3013`, *"`ref.watch` subscribes this widget to a provider, which needs to become a
     hook... but this one is reached only from inside a callback or a list item template."*

Verified: `fixtures/apps/riverpod_consumer` (both `HomeScreen` and the independent `Footer`; real analyzer
output, real `bridge normalize`, real generator, real `tsc --strict` against the real kit, 8/8, including "no
trace of `Consumer`" and "the whole project typechecks") + `fixtures/apps/riverpod_consumer_unsupported_body`
(the paired **negative** fixture — its `BlockBody` was a leading local + one `return` until §4k made that shape
supported; it is now the `if`-decides-the-return shape: both limitations above, each with its own precise
diagnostic, `BRG3004` and `BRG3013` firing together with no third, unrelated construct silently failing alongside them). Mutation-tested
directly against the **real corpus**: with the catalog row reverted and a genuinely fresh `bridge analyze` +
`bridge generate` (not a cached `normalized.ndjson` — this fix is analyzer-side, so, unlike §4d/§4e's own
generator-only fixes, only a fresh re-analyze can exercise it), App B reports exactly 2 `` `Consumer` is not a
Flutter widget this generator has a mapping for `` errors (`BRG3001`); restoring the row and re-analyzing fresh
removes both, to 0, with no other diagnostic content changing. **The aggregate generator-error count does not
move** (4507 before and after, on the same fresh disposable copy) — stated plainly rather than left to be
inferred: every one of the 5 real sites was already failing overall (the whole program fails when any node
does), and after this fix it still fails, for the *other*, pre-existing reason above — the *specific*,
attributable change is 2 fewer `BRG3001`s and a matching rise in `BRG3004`/cascading counts, not a net
reduction, exactly the same honest pattern §4d's own account established for `AsyncValue`. App A is unaffected
(348 generator errors, unchanged — it declares no `Consumer`). Determinism: three fresh, independent `bridge
analyze` runs over `riverpod_consumer` produce a byte-identical `uir.ndjson` (sha256-compared), and three
in-process `reactGenerator.generate()` runs over its normalized document produce byte-identical emitted files.

## 4g. Verified (this milestone) — `ref.watch(provider.select((v) => ...))`, already working

Real-corpus inventory, done before any implementation: **10 genuine `provider.select(...)` sites**, all App B
(App A has none). App B's own *textual* `.select(` count is 170, per §1's table above — almost all of it is
Supabase's own query-builder method of the identical name (`_client.from('orders').select('*, products(name)')`);
filtering for a receiver that is actually a provider leaves 10. Every real site is
`ref.watch(provider.select((x) => …))` — a bare field read (`brandConfigProvider.select((b) =>
b.companyName)`), a null-aware chain (`authStateChangesProvider.select((s) => s.valueOrNull?.session)`), or
both — **never** `ref.listen` with a selector, **never** a selector with a side effect. Two sites select off a
*family* application (`visibilityTargetsForFirmProvider(product.firmId).select(...)`); three read *inside
another provider's own body*, not a widget (`notificationsProvider`, `tenantBrandingProvider`,
`brand_providers.dart`'s own resolution chain).

**This phase changed no generator or runtime code.** Three pieces, each built for a different, earlier
reason, already compose correctly:

1. `Provider`/`FutureProvider`/`Provider.family`/… are already **kit-provided types**
   (`package_kit.ts`'s `KIT_PACKAGE_CLASSES`, the mechanism `dio` and, this milestone, `AsyncValue` already use).
2. `expression.ts`'s existing kit-method lowering (the `logic.MethodCall` case's `kitReceiver` branch) already
   handles an arbitrary method call on a kit-registered receiver **generically** — positional arguments
   together with named ones, not only named-argument calls — so `provider.select(fn)` (one positional lambda)
   was already reachable as `<providerText>.select(<fnText>)`, with no dedicated case for `select` at all.
3. The runtime's own `ProviderInstance.select(fn)` (`container.ts`) — returning a `SelectView` whose own
   `same()` compares the *projected* value with `dartEquals`, real Riverpod's own narrowing-rebuild semantics
   (a component re-renders only when the *selected* value's own equality changes, not on every change to the
   whole provider), never a "watch everything, then read a field" approximation — already existed,
   oracle-shaped, simply unreached by the generator until this inventory pointed at it. `useWatch` (`react.ts`)
   already accepts any `Listenable<T>` generically, subscribing by `.source` (the stable underlying provider,
   not the fresh `SelectView` object `provider.select(fn)` constructs on every render — `react.ts`'s own
   `Latest` wrapper exists for exactly this, predating this milestone).

`component.ts`'s `declareRiverpodWatches` already passes whatever `ref.watch`'s own argument is through the
ordinary, general `emitExpression` — a `provider.select(fn)` reaches it exactly the same way a bare
`logic.Ref` to a plain provider does, so hoisting, the family case, and a null-aware chain inside the selector
body all fall out of machinery already exercised for other reasons.

- **SUPPORTED, proven end to end**: a bare field selector; a null-aware chain inside the selector; `.select`
  chained off a family application; `ref.watch(provider.select(...))` used inside *another provider's own
  body* (an ordinary runtime call there, never hoisted — providers are not React components, and ADR-0048's
  hoisting rule does not apply to a provider body; this is the pre-existing, protected behavior, confirmed
  still correct with a `.select(...)` argument, not reopened).
- **`ref.listen` with a selector, and a selector with a side effect**: not found anywhere in either real
  corpus, so not implemented or exercised — consistent with this phase's own "do not implement from
  assumptions" discipline, not a known gap.

**A pre-existing, unrelated bug found while building this verification's own fixture, not fixed**: a top-level
Riverpod provider field whose own declared generic argument is a **nullable project-defined class**
(`final p = FutureProvider<Session?>((ref) async => …);`) gets an incorrect, `tsc`-failing type annotation —
`FutureProvider<unknown | null>` instead of `FutureProvider<Session | null>` — because whatever resolves a
project class's own name for a top-level field's *explicit* type annotation (`functions.ts`'s `fieldClassOf`,
keyed off `classModules`) does not yet find it, and the field falls back to `unknown`. A *non-nullable*
project-class argument (`FutureProvider<Session>`) happens to self-heal: `typeTextOf` returns the *bare*
string `'unknown'` for that case, which `functions.ts`'s own `fieldType === 'unknown' ? '' : …` check
recognizes and *omits* the explicit annotation entirely, so TypeScript infers the correct type from the
factory call instead — but a *nullable* one produces `'unknown | null'`, which does not match that check, so
the broken explicit annotation is emitted and fails `tsc`. **Confirmed to have nothing to do with `.select`**:
it reproduces identically with a plain `ref.watch(provider).valueOrNull?.field`, no selector involved.
`riverpod_select`'s own fixture was adjusted to avoid this exact shape (a non-nullable `FutureProvider<Session>`
with the nullability instead on one of `Session`'s own fields, `nickname`) precisely so this verification's own
build-proof exercises `.select` itself, not this separate defect. Not reproduced by real App B's own 10 sites
(none selects off a `FutureProvider`/`StreamProvider` whose own top-level declared generic argument is a
nullable project class — `authStateChangesProvider`'s own `AuthState` is a Supabase SDK type, a different
resolution path). Next step: root-cause `fieldClassOf`'s own resolution/ordering against `classModules` for a
nullable project-class type argument specifically.

Verified: `fixtures/apps/riverpod_select` (every shape above — real analyzer output, real `bridge normalize`,
real generator, real `tsc --strict` against the real kit, 6/6). Not mutation-tested in the usual sense (no
code changed to revert): instead, each of the three pre-existing mechanisms above was traced to its own
existing doc/oracle-verification from the milestone that built it, and the fixture's own emitted output was
read directly against the runtime's real `SelectView`/`useWatch` implementation to confirm the composition,
not merely that `tsc` was silent. Determinism: three in-process `reactGenerator.generate()` runs over the
fixture's normalized document produce byte-identical output.

## 4h. Implemented (this milestone) — `ProviderScope(overrides: [...])` at the application root

Real-corpus inventory, done before any implementation: **exactly 1 real `ProviderScope(overrides: ...)`
construction in App A + App B combined.** App A's own single `ProviderScope(child: ...)` carries no overrides;
App B's "admin" app (a sibling in the same monorepo) is the same. App B's own "customer" app has the one real
site, at the root of `main()` — `runApp(ProviderScope(overrides: [...], child: CommerceApp()))` — never
nested, with 4 overrides: `compiledBrandDefaultsProvider.overrideWithValue(BrandConfig.neutral.copyWith(appName:
'Commerce'))`, `appPreferencesProvider.overrideWithValue(AppPreferences(prefs))` (`prefs` from `final prefs =
await SharedPreferences.getInstance();`, `main()`'s own local), and two `.overrideWith(createFn)` via
zero-argument top-level helper functions (`loginAsHintSeed()`/`loginRoleCheckSeed()`, each returning
`loginAsHintProvider.overrideWith((ref) => ref.watch(appPreferencesProvider).loginAsHint)` or its sibling).
`overrideWithProvider` (Riverpod 1's own API) and a family override: not found in either real corpus.

**Before this milestone, `overrides:` was silently dropped, with no diagnostic at all.** `project.ts`'s own
`needsRiverpod` doc already explained why, before this phase even started: root discovery deliberately starts
from `MaterialApp`, never from `runApp`'s own argument — a program's own `ProviderScope(...)` construction was
never read for *any* purpose. Confirmed directly, before writing a line of the fix: a probe with a real
override generated a clean, silently-wrong `<ProviderScope>` — no `overrides` prop, no warning, nothing.

**What the runtime already had, unused**: `ProviderScope`'s own React binding (`react.ts`) already accepts an
`overrides?: readonly Override[]` prop and threads it straight into `new ProviderContainer({ overrides,
parent })` — nested-scope parenting included. `ProviderInstance.overrideWithValue(value)`/`.overrideWith(create)`
(`container.ts`) already exist, returning a plain `Override` value. None of this was reachable from a Dart
source's own `overrides:` list before this phase, for the architectural reason above, not a runtime gap.

**The fix**: `provider_scope_overrides.ts` reads exactly one shape — `main()` calling `runApp` with a *direct*
`ProviderScope(overrides: [...])` construction (the only shape either real corpus uses) — and lowers each
override element with the *ordinary*, general `emitExpression`, no special-casing of `.overrideWithValue`/
`.overrideWith`: both are plain method calls on a kit-registered `ProviderInstance`, already generically
supported the identical way `.select` was found to be in §4g. The result splices into `app/providers.tsx`'s
own `<ProviderScope overrides={[...]}>`, its dynamic imports rendered by a scratch `ModuleBuilder` the same
way `app/page.tsx`'s own route-argument imports already are (`module.ts`'s `importLines()`, whose own doc
already named exactly this shape of problem, unused for it until now). `functions.ts`'s own `reachableFunctions`
gained one more root — the overrides list itself — so a provider or a helper function reached *only* from an
override, never from a component or an action, is still found reachable and emitted, not silently missing
(caught directly: an early version of this fixture's own `themeSeedProvider.overrideWith((ref) =>
ref.watch(accentColorProvider))` generated `` `accentColorProvider` ... could not be lowered `` — a real,
if secondary, gap this phase's own fixture surfaced and closed, not merely worked around).

**Soundness, without a second way to say it**: an override's value is lowered against a scope that has never
heard of `main()`'s own locals — no `fieldScope`-style rebinding, unlike a top-level constant's own
initializer. A reference to something only `main()` declares (`prefs`) is therefore an *ordinary* unresolved
reference, and `expression.ts`'s own existing fallback (`` `${name}` is not declared in this program ``)
reports it and refuses, exactly as it would anywhere else — nothing new had to be built to tell a sound
override from an unsound one. A refusal here is an error like any other, so the whole-program gate stops
generation the same way it would for any other unsupported construct — this phase does not make overrides
"best-effort"; a real app whose only unsupported construct is one override still fails to generate, honestly,
rather than shipping with that override silently missing.

- **SUPPORTED**: `.overrideWithValue(value)`/`.overrideWith(createFn)` at the application root, for a value or
  create-closure that is self-contained — reads only already-declared providers, classes and constants, never
  something only `main()`'s own body declares. This turned out to cover **3 of App B's own real 4 overrides**,
  not the 1 this phase expected going in: `compiledBrandDefaultsProvider`'s value, and *both* helper-function
  overrides (`loginAsHintSeed()`/`loginRoleCheckSeed()`) — the reachability fix above was what made the latter
  two work, not special handling for a function call as such.
- **NOT REACHED, precisely, not silently**: an override whose own value depends on something only `main()`'s
  own body declares — App B's own real `appPreferencesProvider.overrideWithValue(AppPreferences(prefs))`, the
  one real override of the four this phase does not close. `main()`'s own `async`/`await` initialization (here,
  `await SharedPreferences.getInstance()`) has no analogue anywhere in the generated app — nothing models
  `main()`'s own body generally, and this phase does not attempt to (a genuinely separate, deeper question:
  what does a one-time, awaited startup side effect become in a Next.js app that has no single "start" moment
  the way a Flutter `main()` does). Named here, not closed.
- Not found in either real corpus, so not implemented or exercised: a **nested** `ProviderScope` (a subtree
  scope, distinct from the root one), `overrideWithProvider`, and a family override.

Verified: `fixtures/apps/riverpod_provider_scope_overrides` (both sound shapes — a computed
`.overrideWithValue`, and an inline `.overrideWith` closure reading an otherwise-unreferenced provider — real
analyzer output, real `bridge normalize`, real generator, real `tsc --strict` against the real kit, 6/6) +
`fixtures/apps/riverpod_provider_scope_overrides_unsupported` (the paired **negative** fixture, reproducing App
B's own blocked shape exactly: `BRG3006` on the `main()`-local by name, one error, nothing else silently
failing alongside it). Mutation-tested directly: reverting `pipeline.ts`/`project.ts`/`functions.ts` and
regenerating reproduces the pre-existing bug exactly — a bare `<ProviderScope>`, **zero diagnostics**, for
*both* fixtures (the sound one and the unsound one alike: before this phase, an unsound override was not
merely unsupported, it was invisible) — restoring the changes fixes both. Verified against the **real App B
corpus** with a genuinely fresh `bridge analyze` + `bridge generate` (an analyzer-adjacent finding — the
correct `main()`, of two candidates, matters — see below): before this phase, zero diagnostics anywhere named
`prefs`/`loginAsHintSeed`/`compiledBrandDefaultsProvider`; after, exactly one new, precise error —
`` `prefs` is not declared in this program `` — and the other three overrides produce no error of their own
(consistent with them lowering correctly, though App B's own generation still fails overall, for this and many
other unrelated reasons already catalogued). Generator error count moves 4507 → 4508 on the same fresh
disposable copy — a real, attributable, named +1, not a regression: one silent drop became one precise
refusal. App A is unaffected (348, unchanged — it declares no overrides). Determinism: three in-process
`reactGenerator.generate()` runs over the fixture's own normalized document produce byte-identical output.

**A real bug this phase's own real-corpus verification caught, not a design defect**: the first version of
`findMain` picked the *first* top-level `logic.FunctionDecl` named `main` in the whole analyzed document —
correct for every committed fixture (one app, one `main`), silently wrong against real App B, whose analyzed
document carries *two*: `apps/customer/lib/main.dart`'s own, and `package:admin/main.dart`'s — a sibling app
in the same pub *workspace*, reached transitively (never called, never imported by customer's own code) but
still extracted, this analyzer's own "every declaration in the graph" discipline. Silently picking `admin`'s
own `main()` would have read *its* `ProviderScope(child: ...)` (no overrides) and correctly found nothing —
which is why this was invisible in every fixture and in the first real-corpus pass alike, and was only caught
by deliberately re-deriving the real numbers from a fresh analyze rather than trusting a plausible-looking
"no change" result (`docs/m14/riverpod-usage-matrix.md`'s own repeated caution, applied to itself). Fixed by
requiring `main()`'s own `span.file` to carry no `package:` prefix — the same "declared in the analyzed
project itself, not merely reachable through it" distinction other parts of this generator already rely on.

## 4i. Investigated, not implemented — raw `dart:async` Stream construction

Real-corpus inventory, done before any implementation, across App A + App B and App B's own local feature
packages: four genuine sites. `Stream.value(const <AppNotification>[])`
(`notifications_repository.dart`) — a real, in-scope, `dart:async`-only construction. The other three are
`async*` generator bodies: `auth_repository.dart`'s `watchAppUser()` (`yield await _resolve(); await for (...)
{ yield await _resolve(); }`) and `supabase_services/live_query.dart`'s own helper (`yield event; ... yield*
Stream<T>.error(error, stackTrace);`). (A fourth match, `orders_repository.dart`'s `_chunked`, is `sync*` over
an `Iterable` — a different Dart feature entirely, not a `Stream`, out of this phase's own scope by
definition.)

**Every one of the three `async*` sites reads from the Supabase SDK's own realtime/auth-change stream**
(`_client.auth.onAuthStateChange`, `_client.from(...).stream(...)`) **inside the generator body itself** — not
merely nearby. Supabase's realtime client has no adapter in this generator at all (a separate package
integration, unrelated to `dart:async`, and nowhere named as this milestone's own scope); an `async*`
generator whose own `await for` iterates it would still refuse on that member access even with full
`async*`/`yield`/`yield*` support built. Building that support would let the generator get *further* into
each of these three methods' own bodies, but not *past* them — so it would not make a single one of the three
sites lower successfully.

**The one remaining site, `Stream.value(...)`, lives in the same method as an already-blocked Supabase call**:
`NotificationsRepository.watch(uid)` is `if (uid == null) return Stream.value(...); return liveQuery(...);` —
its *other* branch calls `liveQuery(...)`, which is `live_query.dart`'s own Supabase-realtime-backed `async*`
generator, one of the three above. Implementing `Stream.value` in isolation would not make `watch(uid)` itself
lowerable (the method still has an unsupported branch), and no other real site uses it — so, confirmed
directly rather than assumed, there is no real-corpus site building `Stream.value` support alone would unblock.

**Not implemented.** This phase's own instruction is explicit: "only if actual application usage or
compatibility contract justifies it... do not create a broad fake Stream API merely to reduce taxonomy
counts." Real usage exists, but every site is either co-located with, or itself performs, an access this
generator has no adapter for and is not scoped to gain one for here — so no real application in either corpus
would generate one line further for the cost of building it. Revisit only alongside a Supabase realtime
adapter (a separate, substantially larger undertaking, and a different package entirely), which is the actual
blocker at all four sites, not `dart:async` itself.

## 4j. Implemented (this milestone) — `AsyncValue.when(...)` placed directly as widget-tree content

App B's own **dominant** real `BRG3004` shape ("widget returned by a call") is `body: async.when(loading:
..., error: ..., data: ...)` — a fresh, real-corpus inventory (done before any implementation, per this
phase's own instruction) found 106 of App B's 252 total `BRG3004` occurrences named this exact reason, the
single largest of eleven distinct sub-categories `BRG3004` covers (a coarse diagnostic **code**, not one
semantic shape — "local function declaration" 66, "build body with statements" 26, "unrecognised widget
expression" 23, "builder body with statements" 18, "yield" 5, "assert" 3, "widget without a build method" 2,
"collection-if"/"collection-for" 2 each, "PropertyAccess"/"PrefixedIdentifier" 1 each).

§4d's own account, written before this phase, said closing this "needs a new render-tree construct
(conceptually `ui.Cond` keyed on three states instead of a boolean) — a real UIR addition, and so an ADR,
not a generator fix." Half right: a real UIR addition was needed, but not a *new* one — `ui.Async`
(`l2.json`), "the normalized form of `FutureBuilder`," already has exactly this shape (`source`, `loading`,
`error`, `data`). It was built for `FutureBuilder`/`StreamBuilder`, whose own three branches live inside
*one* shared closure body (`if (snapshot.hasData) …`) that a normalization pass (N4) has to recover — "partial
by design" per its own doc — which is why `component.ts`'s own `ui.Async` case unconditionally refused:
nothing had ever populated `loading`/`error` at extraction time, only `source`/`data`.

`AsyncValue.when(...)` needs no such recovery: Dart's own syntax already separates the three branches as
three distinct, named closures. `widget_extractor.dart`'s own new `_asyncValueWhen` — recognized
structurally, by the receiver's own resolved type being `AsyncValue<T>` from
`package:riverpod/src/common.dart` (the identical library `package_kit.ts`'s own non-widget-position
registration already uses, never by name) — populates `loading`/`error`/`data` directly, the same way
`_async` already populates `data` alone for `FutureBuilder`. `component.ts`'s own `ui.Async` case now
renders when all three are present — calling the runtime's own, already oracle-verified `.when(...)` method,
each branch now producing JSX instead of an arbitrary value — and keeps refusing, unchanged, when they are
not (a `FutureBuilder`/`StreamBuilder` node N4 never finished recovering). Two schema fields carry this, not
a new node kind: `errorParam`/`stackTraceParam`, the error callback's own two parameter names — the
identical role `dataParam` already had.

- **SUPPORTED**: `async.when(loading: () => W1, error: (e, st) => W2, data: (v) => W3)` placed directly as
  widget-tree content, each branch a closure written at the call site whose own body is a single expression
  (or a block of exactly one `return` statement) — the same restriction `_widgetOfBody` already applied to
  `FutureBuilder`'s own `data` branch, unweakened. *(§4k has since widened `_widgetOfBody` itself, for every
  caller, to leading locals followed by one `return`.)*
- **NOT REACHED, precisely, not silently, narrower than before**: a branch whose own body is a block of more
  than one statement — App B's own real shape (many branches read through a `final` local or perform a
  side effect, like `debugPrint`, first) — still refused (`BRG3004`, "builder body with statements") when
  this phase landed, the identical, pre-existing, general limitation named throughout this milestone (§4d,
  §4f). *§4k has since closed the leading-locals half of it; a branch that performs a side effect first still
  refuses, precisely, as before.* The refusal is now precise **per branch**: before this fix
  the *whole* `.when(...)` call was one opaque blob; now a component whose `loading` and `data` branches are
  simple, and only `error` reads through a local, is refused for exactly that one branch, not the other two.
- Not attempted: `.maybeWhen`/`.whenData` in widget position (one real `.maybeWhen(...)` site in App B,
  none for `.whenData`; `.maybeWhen`'s own `orElse` fallback is a materially different shape this milestone
  does not model from one real site) — named, not silently folded into `.when`'s own recognition.

Verified: `fixtures/apps/riverpod_async_value_widget_position` (originally this milestone's own **negative**
fixture for this exact gap — its own `pubspec.yaml` has the full before/after account — now **positive**:
real analyzer output, real `bridge normalize`, real generator, real `tsc --strict` against the real kit) +
`fixtures/apps/riverpod_async_value_widget_when_unsupported` (the paired **negative** fixture, reproducing
App B's own dominant block-bodied-branch shape exactly: `BRG3004` on the *one* affected branch, not the
whole call) — `riverpod_async_value_widget_when_build.test.ts`, 5/5. Mutation-tested both halves
independently: reverting `component.ts`'s own rendering alone restores the unconditional refusal (all 5
tests fail, the negative one for a *different* reason — `BRG2104`, not `BRG3004`, since the whole node is
refused again rather than one branch inside it); reverting `widget_extractor.dart`'s own recognition alone
(plus the schema, since nothing populates the new fields without it) reproduces the original, wide "widget
returned by a call" opaque error exactly, on the whole `.when(...)` call. Both restored, both pass.

Verified against the **real App B corpus** with a genuinely fresh `bridge analyze` + `bridge generate`:
`BRG3004`'s own "widget returned by a call" sub-count moves 106 → 59 (−47, real sites now recognized and,
where every branch is simple, fully rendered); its "builder body with statements" sub-count moves 18 → 54
(+36, the block-bodied branches those same real sites' own opaque blob used to hide, now surfaced as their
own, narrower, more precise diagnostic — the *other* ten `BRG3004` sub-categories are unchanged, confirming
nothing else shifted). `BRG3004` itself moves 252 → 241 (−11, a real net reduction). The **aggregate**
generator-error count moves 4508 → 4589 (+81) — a real, attributable increase, not a regression: components
that previously failed at the very first `.when(...)` call now reach further into their own bodies and
surface constructs nothing had ever measured before (`CLAUDE.md`'s own "a generator count that goes up after
a fix can be the fix working... code that was silently dropped is reached now," ADR-0074, applied here
exactly as it names). App A is unaffected (348, unchanged — it has no `AsyncValue.when(...)` in widget
position). Determinism: three in-process `reactGenerator.generate()` runs over the fixture's own normalized
document produce byte-identical output; three fresh, independent `bridge analyze` runs over
`riverpod_async_value_widget_position` produce a byte-identical `uir.ndjson`.

## 4k. Implemented (this milestone) — statement-bodied builders: leading locals, then one `return`

App B's `BRG3004` "builder body with statements" (18 occurrences at the start of this milestone, 54 once §4j
reached the `AsyncValue.when` branches that used to hide inside one opaque blob) all came from one function.
`widget_extractor.dart`'s `_widgetOfBody` is the single place a callback body becomes a widget, and it is shared
by `_inlineRebuildBuilder` (`Builder`/`ListenableBuilder`/`ValueListenableBuilder`/`Consumer`, via the catalog's
`rebuildBuilders`), `_lazyList` (`ListView.builder`/`GridView.builder` `itemBuilder`), `_async` (`FutureBuilder`'s
`data`) and `_asyncValueWhen` (§4j). It inlined an expression body, or a block of *exactly one* `return`, and
called anything else `ui.Opaque('builder body with statements')`. The dominant real block shape is
`final p = products[i]; return ProductCard(product: p);` — a local, then a `return`.

**No new representation.** `Binding.inlineValue` (M8-B) already binds a name to its initializer and re-extracts
it lazily at every read site — it is what `_inlineHelper` has always done for a *method's* block body — and it
is sound for the reason it was always sound: Flutter's `build` must be pure, so an initializer read twice may
be evaluated twice. No UIR node, no schema field and no generator change: the read site simply carries the
initializer's own extracted expression (`bind.Expr` wrapping the initializer's `logic.*`, the read site's own
span outside and the initializer's inside). One shared function, `_bindLeadingLocalsAndReturn`, now serves both
`_inlineHelper` and `_widgetOfBody`, so the shape is accepted in exactly one place. The alternative that was
considered and rejected: a "prelude" node kind (locals, then a widget) threaded through all four call sites —
a schema change carrying a new evaluation-order obligation for a shape the existing mechanism already covers.

- **SUPPORTED**: a callback body that is `{ <local>; <local>; …; return <widget>; }` — every statement before the
  final `return` a single-variable declaration **with an initializer** (`final`, `var` or typed; the shape has no
  assignment slot, so `var` is no less sound than `final`), and every such local **read** by a later
  initializer or by the returned expression. A later initializer may read an earlier local (a chain). Contexts:
  `Builder`, `Consumer`, `ListenableBuilder`, `ValueListenableBuilder`, `ListView.builder`/`GridView.builder`
  `itemBuilder` (the proven `C[i]` template is unchanged), `FutureBuilder`'s `data` builder, and each branch of
  `AsyncValue.when`. `Consumer`'s `ref.watch(...)` inside such a local still hoists to a `useWatch` at the top of
  the component (§4c), still `watch`, never demoted to `read`.
- **REFUSED, precisely** — `BRG3004`, "builder body with statements", on the one affected body, whole-program
  generation gated (`BRG3005`) exactly as before: an `if`/`switch`/loop deciding the return (App B's
  `if (resolved == null) return const SizedBox.shrink();`); any statement that is not a declaration (a call for
  its side effect, an assignment, `debugPrint(...)`); a local function declaration; a multi-variable declaration
  (`final a = 1, b = 2;`); a local with no initializer (`late final x;`); and a **local nothing reads**.
- **Why an unread local is refused.** A local nothing reads has no read site to re-extract its initializer at, so
  inlining would drop the initializer — and with it any side effect it carried. `final unused = ref.watch(p);`
  is a *provider subscription*: dropping it is silent loss of a dependency, with no diagnostic anywhere. So
  `_bindLeadingLocalsAndReturn` refuses it. "Read" is decided by the resolved `Element`
  (`_ElementCollector`), not by spelling: a closure parameter that merely shadows the local's name
  (`final x = …; return ListView(children: ['a'].map((x) => Text(x)).toList());`) is a different element and
  does not count as a read, so it is refused too. Mutation-tested (below): without the check, the unsupported
  fixture's `final unused = 'dropped'` is silently accepted.
- Known, deliberate, and not a defect: because each read site re-extracts the initializer, a local read *n*
  times that contains a `ref.watch` yields *n* hoisted `useWatch` calls on the same provider
  (`riverpod_builder_body_locals`: `w$0`…`w$2`, every read uses the last). They resolve to one provider and one
  value, so it is redundant, not wrong; the hoister emitting one call per extracted node is pre-existing
  behaviour for nodes of identical content (the id is a content hash).
- Not attempted, still named: control flow deciding the return, side-effect statements, local function
  declarations (66 in App B), multi-variable locals, `.maybeWhen`/`.whenData` in widget position, and a
  `Consumer` reached only from a list item template (`BRG3013`, §4f).

Verified. Real analyzer output → real `bridge normalize` → real generator → real `tsc --strict` against the real
kit:
`fixtures/apps/builder_body_locals` (plain Dart: one local read once; one local read twice; a two-local chain; an
`itemBuilder` reading its item through a local) — `builder_body_locals_build.test.ts`, 11/11;
`fixtures/apps/builder_body_locals_unsupported` (the paired **negative** fixture — an unread local, an `if`
deciding the return, a side-effect statement, a local function declaration: four distinct shapes, exactly four
`BRG3004` and one `BRG3005`, zero files); `fixtures/apps/riverpod_builder_body_locals` (three `Consumer` sites with
a `ref.watch` local, and an `AsyncValue.when` `data:` branch with a local) —
`riverpod_builder_body_locals_build.test.ts`, 7/7 (each `ref.watch` is still a hoisted `useWatch` of its own
provider, each read is the watched value, no local name survives as a dangling identifier). Dart:
`extraction_test.dart` "a builder body of leading locals then one return", 11 tests, including the shadowing and
determinism cases. `fixtures/apps/riverpod_consumer_unsupported_body` was App B's original block-with-local
negative; it now uses the `if`-decides-the-return shape (its `pubspec.yaml` and the header of
`riverpod_consumer_build.test.ts` carry the account), still `BRG3004` + `BRG3013`.

Mutation-tested both halves directly. (1) `widget_extractor.dart` reverted to HEAD: the four accepted-shape Dart
tests fail (the refused-shape ones still pass), and a genuinely fresh `bridge analyze` + `bridge generate` of both
positive fixtures reports four `BRG3004` "builder body with statements" and one `BRG3005` each; restored
byte-identical, all pass. (2) Only the read check removed: the "unread local" and "shadowing parameter" tests
fail, and `builder_body_locals_unsupported` reports **3** errors instead of 4 — `final unused = 'dropped'` was
silently accepted — which is the failure the check exists to prevent; restored, all pass.

Determinism: three fresh, independent `bridge analyze` runs over each of `builder_body_locals`,
`builder_body_locals_unsupported`, `riverpod_builder_body_locals` and `riverpod_consumer_unsupported_body` produce a
byte-identical `uir.ndjson`, equal to the committed `fixtures/uir/*.ndjson`; three fresh `bridge generate` runs over
each positive fixture produce identical emitted trees (file list and per-file bytes).

Browser: `fixtures/apps/builder_locals_e2e`, an eleventh e2e application (ports 3331/3332, production and
development). A plain `Builder` with a two-local chain; a `Consumer` whose only `ref.watch(countProvider)` is a
local's initializer, read twice and feeding a second local; a button that writes the provider; a `ListView.builder`
reading its item through a local. `tsc` passing is necessary and not sufficient here — a dropped or one-shot
`useWatch` would still typecheck and render `count: 0` forever — so the test clicks and requires both reads and
the derived local to follow the provider (`count: 3` / `doubled: 6` after three clicks, `count: 0` gone). 7/7 in
Chromium (4 production, 3 development: hydration, hook order across four re-renders, key warnings, a silent
console). Full gates after §4k: Dart analyzer 698/698 (687 + the 11 above), generator 898/898, runtime 683/683, `just lint`,
`just typecheck`, `just codegen-check` and `just lint-negative` clean. Full `just e2e` is now 109 tests (the
previous 102 plus these 7; 11 applications, production and development). The first full run passed 108 of 109:
`async-push-guard`'s "the button disables while submitting" missed its window — that fixture awaits a real 30 ms
`Future.delayed`, and the assertion first ran after the button had already navigated away. It is not caused by
this change (that fixture's analyzer output is byte-identical between the pre-§4k and §4k analyzers, so its
generated project cannot differ; it passed 7 of 8 in isolation with `--repeat-each=8`) and the full run repeated:
**109/109**. `just determinism`: all 11 applications × 3 complete pipeline runs (`flutter pub get` → analyze →
normalize → generate) byte-identical, `builder-locals` included. A differential over the fixture corpus —
every `fixtures/apps/*` project analyzed with the pre-§4k analyzer (extracted from `HEAD`) and with this one —
found identical `uir.ndjson` bytes for 105 of the 108 that analyze standalone; the three that differ are exactly the
three new fixtures whose builders have leading locals. (`cross_package_app` and `module_emission` need a local
path dependency and cannot be analyzed alone.) `just ci` stops, as it did before this change, at
`analyzer-lint`: `dart/bridge_analyzer/test/route_argument_positions_test.dart:419` `avoid_escaping_inner_quotes`
(introduced by `6ad4738`, unrelated, deliberately left); every recipe before it passes and the ones after it
(`analyzer-test`, `dart-analyze`) were run directly and pass.

Measured against the **real corpora**, genuinely fresh (copies with no `.bridge/`; `bridge analyze` →
normalizer → `bridge generate`, `normalized.ndjson` deleted before generating; the `uir.ndjson` hashes were
reproduced by two independent runs). `BRG3005`'s summary line excluded throughout:

| App B (`tools/taxonomy` rules, first match) | session start | after §4j | after §4k |
| --- | ---: | ---: | ---: |
| **total generator errors** | 4507 | 4588 | **4653** |
| `BRG3004` (all) | 251 | 240 | **218** |
| — "builder body with statements" | 18 | 54 | **30** |
| — "widget returned by a call" | 106 | 59 | 61 |
| — "local function declaration" / "build body with statements" / "unrecognised widget expression" | 66 / 26 / 23 | same | same |
| opaque-expression | 249 | 238 | 216 |
| Riverpod (`riverpod-ref` + `riverpod-provider-initializer`) | 876 | 960 | 983 |
| unresolved-reference | 652 | 655 | 658 |
| package-named-args | 463 | 464 | 482 |
| theme-material-role | 484 | 484 | 487 |
| theme-extension-context (`context`) | 289 | 289 | 310 |
| package-class-emission | 354 | 356 | 366 |
| top-level-function-cascade | 98 | 98 | 104 |
| FutureProvider-specific / interpolation / sliver | 0 / 1 / 9 | same | same |

**What §4k eliminated: exactly 24 occurrences, all of them "builder body with statements"** (54 → 30; the multiset of
error lines before and after differs by exactly those 24 removed and 89 added, nothing else). By construct: 9
`final c = context.palette;` theme-palette locals, 8 other leading computed locals (`where`/`fold`/`isEmpty`
filters and the like), 5 `final x = list[i];` item locals, 2 leading `ref.watch(...)` locals. **The aggregate
rose by 65 (−24 + 89), and that is the fix working, not a regression** (`CLAUDE.md`, ADR-0074): those 24 bodies
used to fail as one opaque blob, and their contents are now *reached*, so what they contain is reported for the
first time — 89 errors: 34 `BRG3013` (22 Riverpod: top-level provider initializers and `ref.watch` hoists of the
providers those bodies use, plus 1 more provider initializer; 6 helper-function cascades — `int.toString`, a
snack-bar host; 3 package callees with named arguments; 1 helper whose body constructs a `StringBuffer`; 1
`CheckboxListTile`), 24 `BRG3002` (15 named-argument calls to package callees, 9 project-class constructions),
24 `BRG3006` (21 `context.<palette>` extensions, 3 undeclared names), 3 `BRG3010` (a Material role), 2 `BRG3001`
(`RefreshIndicator`), and 2 `BRG3004` "widget returned by a call" — `_body(...)`, a private helper returning a
widget, was a local's initializer inside two of the formerly opaque bodies and is now the precise reason instead
of being hidden by the blob (59 → 61). None of the 89 is a construct §4k newly refuses: each was already
unsupported and had simply never been reached. App A is
unaffected: the multiset of its 348 error lines is byte-for-byte the session-start one. **Neither application
reaches a successful generation, so neither reaches `next build` or Chromium**; the only browser evidence for §4k
is the `builder_locals_e2e` fixture above.

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
