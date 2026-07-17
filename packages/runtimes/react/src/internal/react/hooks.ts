// The state facade — where the signal graph meets React (ADR-4).
//
// ## Why this file is small, and has to be
//
// ADR-4: "React is, ironically, the **least** signal-native target. The mismatch is absorbed by the state
// facade in `@bridge/runtime-react` (`createStore`/`useSignal`/`useDerived` over `useSyncExternalStore`),
// not by the IR. This is a deliberate, accepted tradeoff."
//
// This file is that absorption, entire. Everything above it — the graph, stores, theme, routing — is
// framework-agnostic and tested without React. Everything React-specific is here, in three hooks and the
// providers next door. Keeping the mismatch at one boundary is what makes it reviewable, and what will let
// `@bridge/runtime-vue` reuse ADR-20's semantics without reusing any of this.
//
// ## Why `useSyncExternalStore` and not `useState` + an effect
//
// It is the only React API that is correct here. A signal is external mutable state, and React 18+ can tear
// on external state read during a concurrent render: two components reading the same signal in one pass can
// see different values. `useSyncExternalStore` exists for exactly this and is what makes the graph safe
// under concurrent rendering — the property ADR-20 R1 asserts inside the graph, extended across a render.
//
// It also gives SSR for free via its third argument. ADR-15 requires stores to be per-request; a
// server snapshot is then just the current value, because "current" is unambiguous when nothing is shared.
//
// ## Why render is never a consumer
//
// Every read here goes through `peek`, not `get`. A React render must not subscribe the graph to itself: the
// component's subscription is `subscribe`, managed by React, with a lifetime React controls. If render
// tracked, the enclosing `derived` — if a component were ever rendered inside one — would capture the
// component's reads, and the graph would hold edges React knows nothing about.

import { useCallback, useDebugValue, useEffect, useRef, useSyncExternalStore } from 'react';

import { derived, effect, subscribe, type Dispose, type ReadableSignal } from '../state/graph.js';

/**
 * Subscribes a component to a signal and returns its current value.
 *
 * The component re-renders when — and only when — the value actually changes (ADR-20 R3). Works for both
 * `signal` and `derived`, since both are readable.
 *
 * @param source - the signal to read.
 * @returns the current value.
 *
 * @example
 * ```ts
 * function Total() {
 *   const cart = useStore(cartStore);
 *   const total = useSignal(cart.total);
 *   return createElement('span', null, total);
 * }
 * ```
 */
export function useSignal<T>(source: ReadableSignal<T>): T {
  const subscribeToSource = useCallback(
    (onStoreChange: () => void): Dispose => subscribe(source, onStoreChange),
    [source],
  );
  // `peek`: reading must not subscribe the graph to the render (see this file's header). React's own
  // subscription is the edge, and it is the only one.
  const snapshot = useCallback((): T => source.peek(), [source]);
  const value = useSyncExternalStore(subscribeToSource, snapshot, snapshot);
  useDebugValue(value);
  return value;
}

/**
 * A component-local derived value, subscribed for the component's lifetime.
 *
 * The runtime form of a `sig.Derived` whose `scope` is the component. `compute` re-runs only when a
 * dependency it read has changed (ADR-20 R2, R4); the component re-renders only when the result does (R3).
 *
 * `dependencies` are React's, not the graph's — they say when to *rebuild the derivation*, which is needed
 * because `compute` is a fresh closure every render and may capture props. The graph's own dependencies stay
 * dynamic and are discovered by running it.
 *
 * @param compute - the computation. Must be synchronous and side-effect free.
 * @param dependencies - React deps controlling when the derivation is rebuilt. Defaults to `[]` — rebuild
 * never, which is right when `compute` captures nothing but signals.
 * @returns the current value.
 *
 * @example
 * ```ts
 * const visible = useDerived(() => cart.items.get().filter((i) => i.category === category), [category]);
 * ```
 */
export function useDerived<T>(compute: () => T, dependencies: readonly unknown[] = []): T {
  const source = useMemoizedDerived(compute, dependencies);
  return useSignal(source);
}

/** Rebuilds the derivation when `dependencies` change, and not otherwise. */
function useMemoizedDerived<T>(compute: () => T, dependencies: readonly unknown[]): ReadableSignal<T> {
  const ref = useRef<{ deps: readonly unknown[]; source: ReadableSignal<T> } | null>(null);
  // The compute closure is fresh every render, so the derivation calls through a ref rather than capturing
  // it. Otherwise the derivation would hold render #1's closure — and render #1's props — forever.
  const computeRef = useRef(compute);
  computeRef.current = compute;

  let entry = ref.current;
  if (
    entry === null ||
    entry.deps.length !== dependencies.length ||
    entry.deps.some((dep, index) => !Object.is(dep, dependencies[index]))
  ) {
    entry = { deps: dependencies, source: derived(() => computeRef.current(), 'useDerived') };
    ref.current = entry;
  }
  return entry.source;
}

/**
 * Runs a graph effect for the component's lifetime — the runtime form of a `sig.Effect`.
 *
 * Unlike `useEffect`, this tracks its dependencies **dynamically**: it re-runs when a signal it read changes,
 * with no dependency array to keep in sync. `dependencies` here control only when the effect is *rebuilt*,
 * for the same reason as {@link useDerived}.
 *
 * The returned cleanup runs before each re-run and once on unmount — which is exactly `sig.Effect`'s
 * `mount`/`unmount` pairing, mapped onto React.
 *
 * @param body - the effect. May return a cleanup function.
 * @param dependencies - React deps controlling when the effect is rebuilt. Defaults to `[]`.
 *
 * @example
 * ```ts
 * useSignalEffect(() => {
 *   const id = setInterval(tick, delay.get());   // re-runs when `delay` changes
 *   return () => clearInterval(id);
 * });
 * ```
 */
export function useSignalEffect(
  body: () => void | (() => void),
  dependencies: readonly unknown[] = [],
): void {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  useEffect(
    () => effect(() => bodyRef.current(), 'useSignalEffect'),
    dependencies,
  );
}
