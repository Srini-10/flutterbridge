// The navigation runtime — routing state, under Spec v2.4 §A17.
//
// ## What this owns, and what it deliberately does not
//
// This is the **routing state machine**: the route table, the current entry, the history stack, and
// navigation. It is not a renderer and not a URL bar. Binding it to Next's App Router — `next/navigation`,
// per ADR-16 — is a shim over this, and it is not M3-A: ADR-16 pins `next@15.5.x` as the kit's peer range
// and re-decides at the M3-T6 freeze, so committing to a Next surface before that freeze would be deciding
// the thing ADR-16 explicitly sequenced. The state machine underneath is target-neutral and testable in
// Node, which is what M3-A needs.
//
// ## Two kinds of destination, because v2.4 §A17 found two
//
// `app.RouteTransition` used to require `target: NodeId` — "the destination route". The analyzer never
// emitted a single one, and §A17 established why: the frozen schema could not describe what real Flutter
// code does. `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen()))` has **no URL**. Its
// destination is a widget constructed inline. No `app.Route` can exist for it, because `app.Route` requires
// `path`.
//
// §A17 amended the model rather than distorting the truth: a transition carries `target` (a declared route)
// **or** `component` (an inline destination), exactly one. This module mirrors that exactly — see
// `Destination`. It is the one shape in the kit that is a direct image of a UIR node, and that is not a
// coupling: it is the same distinction, because the distinction is real in the program.
//
// §A17.6 is equally load-bearing for what is *absent* here: "How an inline destination becomes a URL on a
// path-based target is out of scope." A pushed component is rendered on a new stack entry with no path, and
// this module invents none. Whether the generator gives it a synthetic route, a modal, or a client-side
// stack is a legalization decision made in the layer that knows the target.
//
// ## `pop` is not a transition
//
// §A17.3: "A transition with no destination at all — `Navigator.pop()` — is not an `app.RouteTransition`. It
// is a return along an edge that already exists, not a new edge." So `pop` is a method here and not a
// destination: it consults the history this router already holds.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { batch, derived, signal, type ReadableSignal } from '../state/graph.js';

/** A route's parameters, parsed from its path. Values are strings because a URL carries strings. */
export type RouteParams = Readonly<Record<string, string>>;

/** One declared route — the generator's projection of an `app.Route` node. */
export interface RouteDescriptor {
  /**
   * The route's name. The kit's identity for it, standing in for the `app.Route` node's `id`.
   *
   * Not the path: two routes can share a path shape across nested layouts, and a name survives a path edit.
   */
  readonly name: string;
  /** The URL path, e.g. `/product/:id`. From `app.Route.path`. Segments starting `:` are parameters. */
  readonly path: string;
}

/** The route table — every route the application declares. */
export interface RouterDescriptor {
  /** Every declared route. */
  readonly routes: readonly RouteDescriptor[];
  /** The route to start on, by name. Must be in `routes`. */
  readonly initial: string;
  /** Parameters for the initial route, if it takes any. */
  readonly initialParams?: RouteParams;
}

/**
 * Where a navigation goes. **Exactly one shape**, mirroring Spec v2.4 §A17's `target` / `component`.
 *
 * A discriminated union rather than two optional fields, because the exclusivity §A17.4 could not express in
 * the schema *is* expressible here. §A17.4 says the constraint is checked in code — `BRG1307` — precisely
 * because the schema dialect has no `oneOf` over properties and a `NodeId` is just a string. TypeScript's
 * union has neither limitation, so the kit makes illegal states unrepresentable rather than diagnosed.
 */
export type Destination =
  | {
      /** A route the application declares. `context.go('/wonder/3')`, `Navigator.pushNamed('/home')`. */
      readonly kind: 'route';
      /** The route name, from the route table. */
      readonly route: string;
      /** Parameters for the route. */
      readonly params?: RouteParams;
    }
  | {
      /**
       * A destination constructed inline: `Navigator.push(context, MaterialPageRoute(builder: ...))`.
       *
       * There is no path and none is invented (§A17.6).
       */
      readonly kind: 'component';
      /** The kit's identity for the pushed component — the generator's stand-in for its `ui.Component` id. */
      readonly component: string;
      /** Arguments passed to it, as `RouteArgument`s would carry. */
      readonly params?: RouteParams;
    };

/** One entry on the navigation stack. */
export interface RouteEntry {
  /** Where this entry came from. */
  readonly destination: Destination;
  /**
   * The resolved URL path, e.g. `/product/42` — present only for a `route` destination.
   *
   * `undefined` for a `component` destination, and that absence is the point: §A17.6 leaves the URL of an
   * inline push to the generator, so the runtime reports that it has none rather than inventing one.
   */
  readonly path: string | undefined;
  /** The parameters in force for this entry. */
  readonly params: RouteParams;
}

/** The live router. Created per provider, like a store (ADR-15). */
export interface RouterInstance {
  /** The current entry — the top of the stack. Reactive. */
  readonly current: ReadableSignal<RouteEntry>;
  /** The whole stack, oldest first. Reactive. The current entry is the last element. */
  readonly stack: ReadableSignal<readonly RouteEntry[]>;
  /** Whether there is anything to pop to. Reactive. */
  readonly canPop: ReadableSignal<boolean>;
  /** Pushes a destination onto the stack. */
  push(destination: Destination): void;
  /** Replaces the current entry, leaving the rest of the stack alone. `pushReplacement`. */
  replace(destination: Destination): void;
  /**
   * Pops the top entry. `Navigator.pop()`.
   *
   * @returns whether anything was popped. `false` at the root — a router with an empty stack has no state to
   * be in, so the root entry is never popped.
   */
  pop(): boolean;
}

/** Fills `:param` placeholders in a path. Throws if the route needs a parameter that was not given. */
function resolvePath(route: RouteDescriptor, params: RouteParams): string {
  return route.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const name = segment.slice(1);
      const value = params[name];
      if (value === undefined) {
        throw new RuntimeError(
          RuntimeDiagnosticCode.UnknownRoute,
          `route '${route.name}' has path '${route.path}' and needs the parameter '${name}', ` +
            `which this navigation did not pass`,
          [route.name, name],
        );
      }
      return encodeURIComponent(value);
    })
    .join('/');
}

/**
 * Creates a live router from a route table.
 *
 * @param descriptor - the route table, from the generator or hand-written.
 * @returns a live router.
 * @throws RuntimeError - `BRG4004` if `initial` is not in `routes`.
 *
 * @example
 * ```ts
 * const router = createRouter({
 *   routes: [
 *     { name: 'home', path: '/' },
 *     { name: 'product', path: '/product/:id' },
 *   ],
 *   initial: 'home',
 * });
 * router.push({ kind: 'route', route: 'product', params: { id: '42' } });
 * router.current.get().path;   // '/product/42'
 * router.pop();                // true — back to home
 * ```
 */
export function createRouter(descriptor: RouterDescriptor): RouterInstance {
  const byName = new Map<string, RouteDescriptor>();
  for (const route of descriptor.routes) byName.set(route.name, route);

  const entryOf = (destination: Destination): RouteEntry => {
    const params = destination.params ?? {};
    if (destination.kind === 'component') {
      // No path, by construction. §A17.6: which URL an inline push becomes is the generator's decision, made
      // where the target is known — not guessed at here.
      return { destination, path: undefined, params };
    }
    const route = byName.get(destination.route);
    if (route === undefined) {
      throw new RuntimeError(
        RuntimeDiagnosticCode.UnknownRoute,
        `no route named '${destination.route}'. Declared: ${[...byName.keys()].join(', ') || '(none)'}`,
        [destination.route],
      );
    }
    return { destination, path: resolvePath(route, params), params };
  };

  const initial = entryOf({
    kind: 'route',
    route: descriptor.initial,
    ...(descriptor.initialParams !== undefined ? { params: descriptor.initialParams } : {}),
  });

  const stack = signal<readonly RouteEntry[]>(Object.freeze([initial]));

  return {
    stack,
    // `at(-1)` is always defined: the stack starts with one entry and `pop` refuses to empty it.
    current: derived(() => stack.get().at(-1) as RouteEntry, 'router.current'),
    canPop: derived(() => stack.get().length > 1, 'router.canPop'),
    push(destination) {
      // The entry is built *before* the write, so a bad destination throws without moving the router. A
      // half-navigated router is worse than one that refused to navigate.
      const entry = entryOf(destination);
      batch(() => stack.update((current) => Object.freeze([...current, entry])));
    },
    replace(destination) {
      const entry = entryOf(destination);
      batch(() => stack.update((current) => Object.freeze([...current.slice(0, -1), entry])));
    },
    pop() {
      if (stack.peek().length <= 1) return false;
      batch(() => stack.update((current) => Object.freeze(current.slice(0, -1))));
      return true;
    },
  };
}
