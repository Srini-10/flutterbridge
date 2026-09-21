// The React binding for the provider container: `ProviderScope`, and the hooks a `ConsumerWidget`'s `ref.watch` lowers to.
//
// ## Why this is small, and the two things it has to get right
//
// A widget that `ref.watch`es a provider is a *subscription*, so it is a hook (`useWatch`), and Riverpod's `ProviderScope` is a
// context holding a container. Two React behaviours would otherwise make the container observably wrong:
//
// 1. **StrictMode runs an effect's cleanup and then its body again on the same instance.** A scope that disposed its container in
//    that cleanup would hand the re-run a dead container. Disposal is therefore deferred a microtask and cancelled if the effect
//    runs again.
// 2. **A render can read a provider that nothing has subscribed to yet** — subscribing happens in an effect, later. An
//    `autoDispose` provider created by that read would be disposed in the gap and built twice. `useWatch` takes a hold during the
//    render and releases it once its subscription exists (or after a timeout, if the render was thrown away).

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  Listenable,
  ProviderContainer,
  sourceKeyOf,
  type Element,
  type ListenOptions,
  type Override,
  type ProviderInstance,
} from './container.js';

const ScopeContext = createContext<ProviderContainer | undefined>(undefined);

/** How long a hold taken by a render that never committed is kept before it is given up. */
const HOLD_TIMEOUT_MS = 1000;

/** Props for {@link ProviderScope}. */
export interface ProviderScopeProps {
  readonly overrides?: readonly Override[];
  readonly children?: ReactNode;
}

/** `ProviderScope` — a container for this subtree, nested inside the enclosing scope's. */
export function ProviderScope(props: ProviderScopeProps): ReactElement {
  const parent = useContext(ScopeContext);
  const [container] = useState(() => new ProviderContainer({ ...(props.overrides !== undefined ? { overrides: props.overrides } : {}), ...(parent !== undefined ? { parent } : {}) }));
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Deferred: StrictMode's simulated unmount is followed at once by a mount on the same container.
      queueMicrotask(() => {
        if (!alive.current) container.dispose();
      });
    };
  }, [container]);

  return createElement(ScopeContext.Provider, { value: container }, props.children);
}

/** The container of the nearest `ProviderScope`. */
export function useProviderContainer(): ProviderContainer {
  const container = useContext(ScopeContext);
  if (container === undefined) throw new Error('No ProviderScope found: wrap the application in a ProviderScope.');
  return container;
}

/**
 * A listenable that reads through whichever target the latest render passed.
 *
 * `provider(arg)` and `provider.select((v) => …)` make a new object on every render, and a subscription keyed by that object would be
 * dropped and re-made each time. The *provider* it reads is what identifies a subscription; the projection is looked up at the moment
 * it is applied.
 */
class Latest<T> extends Listenable<T> {
  readonly source: ProviderInstance<unknown>;
  constructor(
    first: Listenable<T>,
    private readonly current: { current: Listenable<T> },
  ) {
    super();
    this.source = first.source;
  }
  pick(element: Element): T {
    return this.current.current.pick(element);
  }
  same(a: T, b: T): boolean {
    return this.current.current.same(a, b);
  }
}

/**
 * `ref.watch(target)` in a widget: the value now, and a re-render when it changes.
 *
 * Every call is a hook, so it must run unconditionally and in the same order each render — the generator hoists a `build`'s
 * `ref.watch` calls to the top of the component for exactly that reason.
 */
export function useWatch<T>(target: Listenable<T>): T {
  const container = useProviderContainer();
  const latest = useRef(target);
  latest.current = target;
  const cache = useRef<{ value: T } | undefined>(undefined);
  const hold = useRef<{ release: () => void; timer: ReturnType<typeof setTimeout> } | undefined>(undefined);
  const held = useRef(false);

  const snapshot = (): T => {
    const value = container.read(target);
    const cached = cache.current;
    // The same value stays the same object: `useSyncExternalStore` compares snapshots with `Object.is`.
    if (cached !== undefined && target.same(cached.value, value)) return cached.value;
    cache.current = { value };
    return value;
  };

  // Taken during the first render, before the subscription an effect will make.
  if (!held.current) {
    held.current = true;
    const release = container.hold(target);
    hold.current = { release, timer: setTimeout(release, HOLD_TIMEOUT_MS) };
  }

  const key = sourceKeyOf(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const proxy = useMemo(() => new Latest<T>(target, latest), [container, key]);
  const subscribe = useCallback(
    (notify: () => void) => {
      const subscription = container.listen(proxy, notify);
      if (hold.current !== undefined) {
        clearTimeout(hold.current.timer);
        hold.current.release();
        hold.current = undefined;
      }
      return () => subscription.close();
    },
    [container, proxy],
  );

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** `ref.read(target)` in a widget: the value now, with no subscription. */
export function useRead<T>(target: Listenable<T>): () => T {
  const container = useProviderContainer();
  return () => container.read(target);
}

/** `ref.listen(target, callback)` in a widget: runs `callback(previous, next)` on a change, and does not re-render. */
export function useListen<T>(target: Listenable<T>, callback: (previous: T | null, next: T) => void, options?: ListenOptions): void {
  const container = useProviderContainer();
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const subscription = container.listen(target, (previous, next) => latest.current(previous, next), options);
    return () => subscription.close();
    // The target and container identify the subscription; the callback is read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, target]);
}
