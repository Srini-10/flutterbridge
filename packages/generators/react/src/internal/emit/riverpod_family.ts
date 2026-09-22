// Riverpod's `.family`/`.autoDispose` static-builder chain — `Provider.family<T, A>(create)`,
// `FutureProvider.autoDispose.family<T, A>(create)`, `StateNotifierProvider.family<N, S, A>(create)`, …
// (docs/m14/riverpod-usage-matrix.md §"Family and autoDispose").
//
// ## What this recognizes, and why by type rather than by name
//
// `Provider.family` and `FutureProvider.autoDispose` are Dart **static getters** — the analyzer resolves a
// bare access to one as a `logic.Ref` whose own `name` happens to carry the dotted source spelling
// (`"Provider.family"`) but whose `type` is the real fact: a `riverpod` **builder** class
// (`package:riverpod/src/builders.dart`), one per combination — confirmed directly against real analyzer
// output for every shape the real corpora use (`ProviderFamilyBuilder`, `AutoDisposeProviderFamilyBuilder`,
// `AutoDisposeFutureProviderFamilyBuilder`, `AutoDisposeStreamProviderFamilyBuilder`,
// `StateNotifierProviderFamilyBuilder`, `AutoDisposeProviderBuilder`, `AutoDisposeFutureProviderBuilder`).
// A further `.family` on an *instance* of one of those (`FutureProvider.autoDispose.family`) is an ordinary
// `logic.PropertyAccess`, not a second `Ref` — but its own `type` is `AutoDisposeFutureProviderFamilyBuilder`
// just the same, so recognizing the outer `.call(...)`'s receiver type, whichever node shape produced it, is
// the one check that covers both — never the receiver's `name`, which is a debug label the analyzer happens
// to preserve, not a contract.
//
// This is what "do not implement family using string replacement; do not special-case provider names" means
// structurally: two programs that both declare `final xProvider = Provider.family<String, String>(...)` and
// `final yProvider = Provider.family<String, String>(...)` reach the identical code path for an identical
// reason — the *type* of what `.call` is invoked on — regardless of what either author named their provider.

/** A `TypeRef`, loosely typed — the same convention `expression.ts` itself uses. */
type Node = Record<string, unknown>;

/** The runtime `ProviderKind` string (`container.ts`) a Dart provider class lowers to. */
export type RiverpodProviderKind = 'provider' | 'state' | 'stateNotifier' | 'notifier' | 'future' | 'stream';

/** Dart's own provider class name → the runtime kind it declares (`container.ts`'s own `ProviderKind`). */
const DART_CLASS_TO_KIND: Readonly<Record<string, RiverpodProviderKind>> = {
  Provider: 'provider',
  StateProvider: 'state',
  StateNotifierProvider: 'stateNotifier',
  NotifierProvider: 'notifier',
  FutureProvider: 'future',
  StreamProvider: 'stream',
};

/** The runtime kit's own value-class name for a plain (non-family) construction of `kind` (`container.ts`). */
export const RIVERPOD_VALUE_CLASS: Readonly<Record<RiverpodProviderKind, string>> = {
  provider: 'Provider',
  state: 'StateProvider',
  stateNotifier: 'StateNotifierProvider',
  notifier: 'NotifierProvider',
  future: 'FutureProvider',
  stream: 'StreamProvider',
};

const RIVERPOD_BUILDERS_LIBRARY = 'package:riverpod/src/builders.dart';

/** What a `.family`/`.autoDispose` static-builder chain declares. */
export interface RiverpodBuilderShape {
  readonly kind: RiverpodProviderKind;
  readonly autoDispose: boolean;
  readonly family: boolean;
}

/**
 * Recognizes a `<Kind>[.autoDispose][.family]` static-builder chain from the **resolved type** of what the
 * chain's trailing `.call(create)` invokes — `undefined` for anything else, including a plain
 * `Provider(create)` construction (a `logic.New`, already handled by `package_kit.ts`'s own table) and a
 * riverpod type this generator does not (yet) recognize the builder shape of.
 *
 * @param receiverType - the `TypeRef` of the `.call(...)` node's own `receiver` — a `logic.Ref` for
 *   `Provider.family`/`Provider.autoDispose` (a static getter on the class itself), a `logic.PropertyAccess`
 *   for `.family` on an `.autoDispose` builder instance (`FutureProvider.autoDispose.family`). Either shape's
 *   own `type` is what this function reads; the node kind is the caller's concern, not this function's.
 */
export function riverpodBuilderShapeOf(receiverType: Node | undefined): RiverpodBuilderShape | undefined {
  if (receiverType?.['library'] !== RIVERPOD_BUILDERS_LIBRARY) return undefined;
  let name = String(receiverType['name'] ?? '');
  if (!name.endsWith('Builder')) return undefined;
  name = name.slice(0, -'Builder'.length);
  let family = false;
  if (name.endsWith('Family')) {
    family = true;
    name = name.slice(0, -'Family'.length);
  }
  let autoDispose = false;
  if (name.startsWith('AutoDispose')) {
    autoDispose = true;
    name = name.slice('AutoDispose'.length);
  }
  const kind = Object.hasOwn(DART_CLASS_TO_KIND, name) ? DART_CLASS_TO_KIND[name] : undefined;
  return kind === undefined ? undefined : { kind, autoDispose, family };
}

/**
 * Whether `type` is a Riverpod **family value** — `ProviderFamily<T, A>`, `AutoDisposeFutureProviderFamily<T,
 * A>`, `StateNotifierProviderFamily<N, S, A>`, … — what `defineFamily`/`defineStateFamily`/
 * `defineStateNotifierFamily` (`container.ts`) return, and so what `itemByIdProvider` itself is typed as.
 *
 * `family(arg)` — applying a family to its argument, `itemByIdProvider('a')` — reaches the analyzer as
 * `logic.MethodCall{method: 'call', receiver: <the family, resolved to one of these types>}`, the identical
 * shape Dart gives *any* callable-class value applied with `()` (`operator call`, confirmed directly: real
 * analyzer output for `itemByIdProvider('a')` and for an ordinary `Function`-typed `f(x)` are the same node
 * shape, method `'call'`). The existing "a function value invoked via `.call()`" lowering
 * (`expression.ts`, `isFunctionType`) only recognizes Dart's own `Function` type, never a project's or a
 * package's own callable class, so a family application needs this check beside it — recognized, like
 * {@link riverpodBuilderShapeOf}, purely by the *value's own resolved type*, never by which field the
 * program happened to read it from.
 */
export function isRiverpodFamilyValue(type: Node | undefined): boolean {
  const library = type?.['library'];
  if (typeof library !== 'string' || !library.startsWith('package:riverpod/')) return false;
  const name = String(type?.['name'] ?? '');
  return name.split('<')[0]?.endsWith('Family') === true;
}
