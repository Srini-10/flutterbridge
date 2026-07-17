// The store facade — the runtime form of `app.Store` (ADR-4), scoped per ADR-15.
//
// ## The shape, and why it is two things and not one
//
// `defineStore` produces a **definition**: a name and a setup function. It holds no state, allocates no
// signal, and is safe at module scope. `instantiateStore` produces an **instance**, and only it holds state.
//
// That split is ADR-15 made structural. ADR-15 found `final CartStore cartStore = CartStore();` in a real
// app — an idiom so ordinary in Flutter it is unremarkable, and which in a Next.js server process serves one
// user's cart to another, because a module is shared across every request. ADR-15's answer is that the
// generator must emit provider-scoped instances and never module singletons. Here the generator *cannot* emit
// the bad shape: the thing it puts at module scope is a definition, and a definition has nothing to leak.
// The privacy defect is unrepresentable rather than merely forbidden — which matters, because ADR-15 also
// records that no golden, no pixel diff and no visual verifier would ever have caught it.
//
// ## Why a setup function rather than a data literal
//
// A store's actions and derivations are *behaviour*, and ADR-19 keeps behaviour as closures: the generator
// lowers `sig.Action.body` into real TypeScript, and the kit never interprets `logic.*`. A setup function is
// the natural target for that — it also types exactly, with no inference gymnastics, and reads as ordinary
// code in the generated output, which is what ADR-6 is protecting.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import {
  batch,
  derived,
  effect,
  signal,
  type Dispose,
  type ReadableSignal,
  type WritableSignal,
} from './graph.js';

/**
 * The reactive primitives a store's setup function is given.
 *
 * They are scoped rather than imported so that everything a store creates is **owned** by it and disposed
 * with it. An `effect` created here dies when the store does; an `effect` imported from the graph would
 * outlive it and keep the store's signals alive — a leak per request, in the one place ADR-15 says leaks are
 * a privacy defect rather than a memory one.
 */
export interface StoreContext {
  /** Creates a store-scoped signal — the runtime form of `sig.Signal` with `scope: "store"`. */
  signal<T>(initial: T): WritableSignal<T>;
  /** Creates a store-scoped derived value — the runtime form of `sig.Derived`. */
  derived<T>(compute: () => T, label?: string): ReadableSignal<T>;
  /** Creates a store-owned effect. Disposed when the store is disposed; no manual disposer needed. */
  effect(body: () => void | (() => void), label?: string): Dispose;
  /**
   * Wraps a function as an action — the runtime form of `sig.Action`.
   *
   * Every action is a batch (ADR-20 R6): all its writes produce one flush, because a `setState` body applies
   * atomically in Flutter and two renders where Flutter had one is a visible defect.
   */
  action<A extends readonly unknown[], R>(body: (...args: A) => R, label?: string): (...args: A) => R;
}

/**
 * A store's declaration: a name and how to build it. Holds no state (ADR-15).
 *
 * Safe at module scope. Produced by {@link defineStore}, consumed by {@link instantiateStore} and by the
 * React `StoreProvider`, which instantiates one per client root / per request.
 */
export interface StoreDefinition<T extends object> {
  /** The store name, from `app.Store.name`. Used in diagnostics and as the provider's identity. */
  readonly name: string;
  /** Builds the store's contents. Called once per instance, never at definition time. */
  readonly setup: (context: StoreContext) => T;
}

/** A live store. Created per provider; holds the state (ADR-15). */
export interface StoreInstance<T extends object> {
  /** The store name, from its definition. */
  readonly name: string;
  /** What the setup function returned: the store's signals, derived values and actions. Frozen. */
  readonly state: T;
  /** Whether {@link dispose} has run. */
  readonly disposed: boolean;
  /** Disposes every effect the store owns and refuses further dispatches. Idempotent. */
  dispose(): void;
}

/** Options for {@link instantiateStore}. */
export interface StoreOptions {
  /**
   * Called before each action runs, with the action's label and arguments.
   *
   * The kit's whole observability surface for state changes — enough for a devtool or a log line, and
   * deliberately not more. It cannot alter or veto the action: an observer that can change behaviour is a
   * second place where the application's semantics live, and ADR-19 keeps semantics in the lowered code.
   */
  readonly onAction?: (label: string, args: readonly unknown[]) => void;
}

/**
 * Declares a store — the runtime form of `app.Store` (ADR-4).
 *
 * Evaluates nothing: `setup` runs per instance, in {@link instantiateStore}. This is what makes a
 * module-scope `export const cart = defineStore(...)` safe under ADR-15 / INV-19.
 *
 * @param name - the store name, from `app.Store.name`.
 * @param setup - builds the store's contents from the scoped primitives it is given.
 * @returns a definition, safe to hold at module scope.
 *
 * @example
 * ```ts
 * // What the generator will emit for an `app.Store`. Hand-written here — the runtime needs no generator
 * // to be exercised (ADR-19).
 * export const cartStore = defineStore('cart', ({ signal, derived, action }) => {
 *   const items = signal<readonly Item[]>([]);
 *   const total = derived(() => items.get().reduce((n, i) => n + i.price, 0), 'total');
 *   const add = action((item: Item) => items.update((current) => [...current, item]), 'add');
 *   return { items, total, add };
 * });
 * ```
 */
export function defineStore<T extends object>(
  name: string,
  setup: (context: StoreContext) => T,
): StoreDefinition<T> {
  return Object.freeze({ name, setup });
}

/**
 * Creates a live store from a definition (ADR-15: once per client root / per request, never at module scope).
 *
 * @param definition - from {@link defineStore}.
 * @param options - observability hooks.
 * @returns a live instance. Dispose it when its scope ends.
 */
export function instantiateStore<T extends object>(
  definition: StoreDefinition<T>,
  options: StoreOptions = {},
): StoreInstance<T> {
  const ownedEffects: Dispose[] = [];
  let disposed = false;

  const assertLive = (what: string): void => {
    if (disposed) {
      throw new RuntimeError(
        RuntimeDiagnosticCode.StoreDisposed,
        `store '${definition.name}' was used after dispose (${what}); its provider has unmounted`,
        [definition.name],
      );
    }
  };

  const context: StoreContext = {
    signal,
    derived,
    effect: (body, label) => {
      assertLive('effect');
      const dispose = effect(body, label ?? `${definition.name}.effect`);
      ownedEffects.push(dispose);
      return dispose;
    },
    action: (body, label) => {
      const name = label ?? 'action';
      return (...args) => {
        assertLive(`action '${name}'`);
        options.onAction?.(name, args);
        // The batch closes when `body` *returns*. For an async action that is its first `await`, so writes
        // before the first suspension are one atomic update and writes after it are their own — which is
        // both what `sig.Action.isAsync` means and the only safe option: holding a batch across a
        // suspension would leave the graph's module-scope batch depth live while another request runs
        // (see graph.ts, "Module-scope state").
        return batch(() => body(...args));
      };
    },
  };

  const state = Object.freeze(definition.setup(context));

  return {
    name: definition.name,
    state,
    get disposed() {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Reverse creation order: a later effect may read what an earlier one set up, so it must die first.
      for (let i = ownedEffects.length - 1; i >= 0; i--) ownedEffects[i]!();
      ownedEffects.length = 0;
    },
  };
}
