// Package classes the runtime kit provides — the library-adapter table (ADR-0075).
//
// A package with a browser equivalent is mapped by a runtime class of the same name and shape (`Dio` → `fetch`), and this table is the whole of what
// the generator needs to know: which package classes exist in the kit. It is keyed by the class's *resolved library* (never a spelling), so a project's
// own `Dio` is untouched. With an entry, a class is imported from the kit like any framework value type; its named arguments become one trailing options
// object (the kit's convention, see `runtime.ts`); a member read of it is a property of the runtime class; and a `catch` clause naming it is `instanceof`.

/** `package name → Dart class name → the runtime export that mirrors it`. */
export const KIT_PACKAGE_CLASSES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  dio: {
    Dio: 'Dio',
    BaseOptions: 'BaseOptions',
    Options: 'Options',
    Response: 'Response',
    DioException: 'DioException',
    DioExceptionType: 'DioExceptionType',
    LogInterceptor: 'LogInterceptor',
  },
  // The shapes a program constructs as a plain value (`Provider(...)`, `StateProvider(...)`,
  // `StateNotifierProvider(...)`, `FutureProvider(...)`, `StreamProvider(...)`) — the same subset
  // `docs/m14/riverpod-usage-matrix.md` §4 documents as supported. A `.family`/`.autoDispose` static-builder
  // chain (`Provider.family(...)`, `FutureProvider.autoDispose(...)`) is not a construction of one of these
  // classes at all — it is a `.call(...)` on a *builder* property-access chain — and is recognized separately,
  // by its own resolved type (`riverpod_family.ts`, `expression.ts`'s `lowerRiverpodBuilderConstruction`);
  // this table only ever sees the plain, no-builder constructor call.
  riverpod: {
    Provider: 'Provider',
    StateProvider: 'StateProvider',
    StateNotifierProvider: 'StateNotifierProvider',
    FutureProvider: 'FutureProvider',
    StreamProvider: 'StreamProvider',
    // `AsyncValue<T>` (`package:riverpod/src/common.dart`, confirmed directly against real analyzer
    // output) — what a `FutureProvider`/`StreamProvider` watcher reads. A `kit`-provided *value* type, not
    // a construction most real code performs (`AsyncValue.data(x)`/`.loading()`/`.error(e, st)` exist —
    // this table gives them "for free," `logic.New`'s own named-constructor path — but neither real corpus
    // this generator is measured against calls one outside a test); what real code actually does is read
    // its properties (`.valueOrNull`, `.hasError`, `.hasValue`, `.isLoading`, `.value`, `.error`,
    // `.stackTrace`, `.requireValue`) and call `.when`/`.maybeWhen`/`.whenData` — a plain member read and a
    // named-argument method call respectively, both already the *generic* lowering this table's own header
    // comment describes ("a member read of it is a property of the runtime class"; "named arguments become
    // one trailing options object") for every other kit-provided type, so this one row is the whole of
    // what `AsyncValue` consumption needs at the expression level. `docs/m14/riverpod-usage-matrix.md`
    // §4d has the full account, including the one real shape this row does *not* reach: `.when(...)`
    // embedded directly as widget-tree content is `ui.Opaque` before the generator ever sees it — a
    // pre-existing, general ("a widget returned by a call"), non-Riverpod limitation in the render-tree
    // extractor, not a new gap this row introduces or could close.
    AsyncValue: 'AsyncValue',
  },
  // `class MyController extends StateNotifier<S>` — `flutter_riverpod` re-exports the class, but the analyzer resolves it
  // to its true declaring library, `package:state_notifier/state_notifier.dart` (confirmed directly against real analyzer
  // output). A row here is what lets `dart_classes.ts` recognize it as a *superclass* a project class may extend, the
  // same `kitPackageClass` lookup `logic.New`/member-call recognition already uses for a value construction — see
  // `kitSuperclassMembers` below for the second, narrower thing extending one additionally needs.
  state_notifier: {
    StateNotifier: 'StateNotifier',
  },
};

/** The runtime export mirroring `name` from `library`, if the kit provides it. */
export function kitPackageClass(library: unknown, name: unknown): string | undefined {
  if (typeof library !== 'string' || typeof name !== 'string' || !library.startsWith('package:')) return undefined;
  const pkg = library.slice('package:'.length).split('/')[0] as string;
  const classes = Object.hasOwn(KIT_PACKAGE_CLASSES, pkg) ? KIT_PACKAGE_CLASSES[pkg] : undefined;
  const bare = name.replace(/\?$/, '').split('<')[0] as string;
  return classes !== undefined && Object.hasOwn(classes, bare) ? classes[bare] : undefined;
}

/**
 * The instance members a **kit-provided superclass** exposes with no member model of their own — so a project subclass's
 * bare, untargeted read of one of these names (`state`, never `this.state`; Dart forbids `this` before `super()` in an
 * initializer, and a method body's own bare identifier is the same unresolved shape `context`/`ref` already are — ADR-0055,
 * `docs/m14/riverpod-usage-matrix.md`) means *this*, not "not declared" (`BRG3006`).
 *
 * Keyed by the runtime **export name** (`KIT_PACKAGE_CLASSES`'s own value), not the Dart name — one project class can
 * extend at most one kit superclass, so there is no ambiguity a library/name pair would resolve better. A future kit
 * superclass (were one added) adds one row here; nothing about *how* a bare name resolves to `this.<name>` is specific to
 * `StateNotifier`, which is why this stays a table rather than a name check in `dart_classes.ts` itself.
 */
export const KIT_SUPERCLASS_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  // `state` — the reactive value (get/set); `mounted` — false once `dispose()` has run (both real getters on the runtime's
  // own `StateNotifier`, `packages/runtimes/react/src/internal/riverpod/container.ts`).
  StateNotifier: ['state', 'mounted'],
};

/** The instance members {@link KIT_SUPERCLASS_MEMBERS} lists for the kit class `runtimeName` names, or none. */
export function kitSuperclassMembers(runtimeName: string): readonly string[] {
  return Object.hasOwn(KIT_SUPERCLASS_MEMBERS, runtimeName) ? (KIT_SUPERCLASS_MEMBERS[runtimeName] as readonly string[]) : [];
}
