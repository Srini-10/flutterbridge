// Context providers — where ADR-15's "provider-scoped, never a module singleton" actually happens.
//
// ## The rule these providers exist to keep
//
// ADR-15, on evidence from a real application:
//
// > `final CartStore cartStore = CartStore();` — an idiom so ordinary in Flutter that it is unremarkable. In
// > Flutter that singleton is **one user**. In a Next.js server process, **a module is shared across every
// > request**. If a component that touches such a store is server-rendered, **one user can be served another
// > user's cart.**
//
// The store is created *here*, inside a component, once per client root / per request. Nothing about a
// `StoreDefinition` at module scope holds state (see `store.ts`), so the shape ADR-15 forbids cannot be
// written by accident — the provider is the only thing that can make an instance.
//
// ## Why one registry context and not one context per store
//
// A context per store would mean `defineStore` calling `createContext`, which would put React inside the
// framework-agnostic store module and break the layering the whole package is arranged around. Instead one
// context carries a `definition → instance` map, and nesting merges: an inner `StoreProvider` shadows an
// outer one for its own definition and leaves the rest reachable. Stores are keyed by definition identity,
// which is exactly the identity the generator has at the call site.
//
// ## No JSX
//
// `createElement`, not JSX. `tsconfig.base.json` sets no `jsx` option and every `include` glob is
// `src/**/*.ts`; authoring `.tsx` here would mean a `jsx` compiler option, widened globs in two tsconfigs,
// and a DOM lib this package does not otherwise need. Three `createElement` calls are cheaper than that, and
// this is the only file that renders anything.

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { createRouter, type RouterDescriptor, type RouterInstance } from '../nav/router.js';
import { createTheme, type ThemeDescriptor, type ThemeInstance, type ThemeOptions } from '../theme/theme.js';
import {
  instantiateStore,
  type StoreDefinition,
  type StoreInstance,
  type StoreOptions,
} from '../state/store.js';

/** Every store reachable at a point in the tree, keyed by the definition that made it. */
type StoreRegistry = ReadonlyMap<StoreDefinition<object>, StoreInstance<object>>;

const StoreRegistryContext = createContext<StoreRegistry | null>(null);
const ThemeContext = createContext<ThemeInstance | null>(null);
const RouterContext = createContext<RouterInstance | null>(null);

function missingProvider(what: string, provider: string): RuntimeError {
  return new RuntimeError(
    RuntimeDiagnosticCode.MissingProvider,
    `${what} was read outside a <${provider}>. State is provider-scoped, never a module singleton ` +
      `(ADR-15), so there is no ambient instance to fall back to`,
    [provider],
  );
}

/**
 * Creates the instance, and keeps it alive across React's development remount.
 *
 * StrictMode mounts, unmounts and remounts every component in development, specifically to surface state
 * that does not survive it. Our unmount disposes the store — correctly — but React preserves the `useState`
 * value across the remount, so the remounted tree would hold a disposed store and every dispatch would
 * throw `BRG4003`. Noticing it is disposed and rebuilding is what makes dispose-on-unmount and StrictMode
 * coexist; the discarded first instance is development-only and owns nothing but its own signals.
 */
function useStoreInstance<T extends object>(
  definition: StoreDefinition<T>,
  options: StoreOptions | undefined,
): StoreInstance<T> {
  // Held in a ref so that passing a fresh `options` object every render — the common case, since it is
  // usually a literal — does not rebuild the store.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [instance, setInstance] = useState<StoreInstance<T>>(() =>
    instantiateStore(definition, optionsRef.current ?? {}),
  );

  useEffect(() => {
    if (instance.disposed) {
      setInstance(instantiateStore(definition, optionsRef.current ?? {}));
      return undefined;
    }
    return () => {
      instance.dispose();
    };
  }, [instance, definition]);

  return instance;
}

/** Props for {@link StoreProvider}. */
export interface StoreProviderProps<T extends object> {
  /**
   * The store to provide. Must be stable for the provider's lifetime — in generated output it is a
   * module-scope `defineStore` constant, which is stable by construction.
   */
  readonly definition: StoreDefinition<T>;
  /** Observability hooks, passed to `instantiateStore`. */
  readonly options?: StoreOptions;
  /** The subtree that can reach this store. */
  readonly children?: ReactNode;
}

/**
 * Creates a store and provides it to a subtree — one instance per mount (ADR-15).
 *
 * The store is disposed when the provider unmounts: every effect it owns is cleaned up and further
 * dispatches throw `BRG4003` rather than mutating state nothing is watching.
 *
 * Nest freely. An inner provider for the same definition shadows an outer one; other stores stay reachable.
 *
 * @param props - see {@link StoreProviderProps}.
 * @returns the subtree, with the store in scope.
 *
 * @example
 * ```ts
 * createElement(StoreProvider, { definition: cartStore }, children);
 * ```
 */
export function StoreProvider<T extends object>(props: StoreProviderProps<T>): ReactElement {
  const instance = useStoreInstance(props.definition, props.options);
  const parent = useContext(StoreRegistryContext);
  const registry = useMemo<StoreRegistry>(() => {
    const merged = new Map(parent ?? []);
    merged.set(props.definition as StoreDefinition<object>, instance as StoreInstance<object>);
    return merged;
  }, [parent, props.definition, instance]);
  return createElement(StoreRegistryContext.Provider, { value: registry }, props.children);
}

/**
 * Reads a store provided by an enclosing {@link StoreProvider}.
 *
 * @param definition - the same definition the provider was given. Identity is the key.
 * @returns what the store's setup function returned: its signals, derived values and actions.
 * @throws RuntimeError - `BRG4005` if no enclosing provider supplies this store.
 *
 * @example
 * ```ts
 * const cart = useStore(cartStore);
 * const total = useSignal(cart.total);
 * cart.add(item);
 * ```
 */
export function useStore<T extends object>(definition: StoreDefinition<T>): T {
  const registry = useContext(StoreRegistryContext);
  const instance = registry?.get(definition as StoreDefinition<object>);
  if (instance === undefined) {
    throw missingProvider(`store '${definition.name}'`, 'StoreProvider');
  }
  return instance.state as T;
}

/** Props for {@link ThemeProvider}. */
export interface ThemeProviderProps {
  /** The token set. */
  readonly descriptor: ThemeDescriptor;
  /** The starting brightness. */
  readonly options?: ThemeOptions;
  /** The subtree the theme applies to. */
  readonly children?: ReactNode;
}

/**
 * Creates a theme and provides it to a subtree.
 *
 * Per mount, like a store, and for the same reason: brightness is mutable state, and mutable state on a
 * shared module is one user's dark mode on another user's screen (ADR-15).
 *
 * @param props - see {@link ThemeProviderProps}.
 * @returns the subtree, with the theme in scope.
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const optionsRef = useRef(props.options);
  optionsRef.current = props.options;
  const [theme] = useState<ThemeInstance>(() => createTheme(props.descriptor, optionsRef.current ?? {}));
  return createElement(ThemeContext.Provider, { value: theme }, props.children);
}

/**
 * Reads the theme provided by an enclosing {@link ThemeProvider}.
 *
 * Reading a token from the returned theme is reactive; calling this hook is not. A component that resolves
 * a token should read it through `useSignal`/`useDerived` to re-render on a brightness change.
 *
 * @returns the theme.
 * @throws RuntimeError - `BRG4005` if there is no enclosing `ThemeProvider`.
 *
 * @example
 * ```ts
 * const theme = useTheme();
 * const primary = useDerived(() => theme.color('primary'));   // re-renders when brightness flips
 * ```
 */
export function useTheme(): ThemeInstance {
  const theme = useContext(ThemeContext);
  if (theme === null) throw missingProvider('the theme', 'ThemeProvider');
  return theme;
}

/** Props for {@link RouterProvider}. */
export interface RouterProviderProps {
  /** The route table. */
  readonly descriptor: RouterDescriptor;
  /** The subtree that can navigate. */
  readonly children?: ReactNode;
}

/**
 * Creates a router and provides it to a subtree.
 *
 * This is the kit's own routing state, not a binding to the host's. Binding it to Next's App Router
 * (`next/navigation`) is deliberately not M3-A: ADR-16 pins `next@15.5.x` as the peer range and re-decides
 * at the M3-T6 freeze, so a Next surface committed now would pre-empt a decision that was explicitly
 * sequenced.
 *
 * @param props - see {@link RouterProviderProps}.
 * @returns the subtree, with the router in scope.
 */
export function RouterProvider(props: RouterProviderProps): ReactElement {
  const [router] = useState<RouterInstance>(() => createRouter(props.descriptor));
  return createElement(RouterContext.Provider, { value: router }, props.children);
}

/**
 * Reads the router provided by an enclosing {@link RouterProvider}.
 *
 * @returns the router.
 * @throws RuntimeError - `BRG4005` if there is no enclosing `RouterProvider`.
 */
export function useRouter(): RouterInstance {
  const router = useContext(RouterContext);
  if (router === null) throw missingProvider('the router', 'RouterProvider');
  return router;
}
