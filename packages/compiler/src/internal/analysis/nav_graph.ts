// The nav-graph analysis.
//
// Spec §3.2 lets a pass declare `requires: AnalysisKey[]`, and the pass manager computes the analysis on
// demand. This is the one N11 requires (ADR-11).
//
// It answers one question: **what crosses a route boundary?** — the routes, the components they render,
// the transitions between them, and the argument each transition carries.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import type { Program } from '../program.js';

/** One edge of the route graph. */
export interface Transition {
  readonly id: NodeId;
  readonly source?: NodeId;
  readonly target: NodeId;
  readonly arguments: readonly TransitionArgument[];
}

/** One argument a transition carries across the boundary. */
export interface TransitionArgument {
  readonly name: string;
  readonly binding?: Record<string, unknown>;
}

/**
 * One argument-bearing boundary a component's constructor crosses — declarative or imperative
 * (M7-E3, ADR-11 amendment).
 *
 * A declarative `app.Route` and an imperative `app.RouteTransition` ask the same question — "what
 * crosses into this component from outside it?" — and `RouteArgument` is already the same schema type
 * for both (Spec ADR-0025 D1: "the same `RouteArgument` an `app.RouteTransition` carries,
 * deliberately"). This is that unification at the analysis layer: one shape N11 walks, instead of a
 * route-shaped loop and a transition-shaped loop that could drift.
 *
 * A declarative route is still recorded as `kind: 'route'` — this is a shared *view*, not a
 * fabricated transition. Nothing here invents a `source`/`target` a route doesn't have.
 */
export interface ComponentBoundary {
  /** Whether this boundary is a declarative route or an imperative transition. */
  readonly kind: 'route' | 'transition';

  /** The `app.Route` or `app.RouteTransition` node this boundary is. */
  readonly id: NodeId;

  /**
   * The component this boundary constructs, when resolvable.
   *
   * Absent only for a transition naming a route this program does not declare (an edge nothing here
   * can resolve either destination or consensus for) — routes always resolve; a transition may not.
   */
  readonly component?: NodeId;

  /** The component the navigation happens from. Absent for a route: a route has no "from". */
  readonly source?: NodeId;

  /** Every argument this boundary carries, in order. */
  readonly arguments: readonly TransitionArgument[];
}

/** The route graph, and what crosses it. */
export interface NavGraph {
  /** Every route, by id. */
  readonly routes: ReadonlyMap<NodeId, AnyUirNode>;

  /** The component each route renders, by route id. */
  readonly componentOf: ReadonlyMap<NodeId, NodeId>;

  /** Every transition, sorted by id — a set has no traversal order (D2). */
  readonly transitions: readonly Transition[];

  /**
   * Every route and transition, declarative and imperative alike, as one shape — sorted by id (D2).
   * Argument-free boundaries are included deliberately: a reaching-caller consensus check (M7-E3) must
   * see a caller that supplies nothing, not just one that supplies the wrong thing. The one list N11
   * walks for promotion.
   */
  readonly boundaries: readonly ComponentBoundary[];

  /**
   * Every boundary that constructs a given component, by component id — the reaching-caller set a
   * consensus check needs (M7-E3, ADR-11 amendment §"reaching-caller consensus"). Each list is sorted
   * by boundary id.
   */
  readonly boundariesByComponent: ReadonlyMap<NodeId, readonly ComponentBoundary[]>;

  /** Whether the program has any route boundary at all. */
  readonly hasRoutes: boolean;
}

/** Reads a node's `arguments` field into the shared `TransitionArgument` shape, in source order. */
function argumentsOf(record: Record<string, unknown>): TransitionArgument[] {
  const args = Array.isArray(record['arguments'])
    ? (record['arguments'] as Record<string, unknown>[])
    : [];
  return args.map((a) => ({
    name: String(a['name']),
    ...(a['binding'] !== undefined ? { binding: a['binding'] as Record<string, unknown> } : {}),
  }));
}

/** Computes the nav-graph of [program]. Pure: same program, same graph. */
export function navGraph(program: Program): NavGraph {
  const routes = new Map<NodeId, AnyUirNode>();
  const componentOf = new Map<NodeId, NodeId>();

  for (const route of program.ofKind('app.Route')) {
    routes.set(route.id, route);
    componentOf.set(route.id, route.component);
  }

  const transitions: Transition[] = program
    .ofKind('app.RouteTransition')
    .map((t) => {
      const record = t as unknown as Record<string, unknown>;
      return {
        id: t.id,
        ...(typeof record['source'] === 'string' ? { source: record['source'] as NodeId } : {}),
        target: record['target'] as NodeId,
        arguments: argumentsOf(record),
      };
    })
    // Sorted: the graph is data, and data whose order depends on how it was discovered is data that
    // makes two runs differ.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Every route and transition is a boundary here, argument-bearing or not: a reaching-caller consensus
  // check (M7-E3) needs to see a caller that supplies *nothing* just as much as one that supplies the
  // wrong thing — both block removing a parameter, and a caller filtered out here would be invisible to
  // that check, not merely uncounted.
  const boundaries: ComponentBoundary[] = [
    ...program
      .ofKind('app.Route')
      .map((r) => ({ node: r, record: r as unknown as Record<string, unknown> }))
      .map(({ node, record }) => ({
        kind: 'route' as const,
        id: node.id,
        component: node.component,
        arguments: argumentsOf(record),
      })),
    ...program
      .ofKind('app.RouteTransition')
      .map((t) => t as unknown as Record<string, unknown>)
      .map((record) => {
        // A transition names its destination one of two ways (`RouteTransition.target`/`.component`,
        // mutually exclusive — Spec v2.4 §A17.6): a named route, resolved through `componentOf`, or an
        // inline-constructed component, named directly. Neither is invented here; an unresolvable
        // `target` (a route this program does not declare) leaves `component` absent rather than
        // guessed at.
        const target = typeof record['target'] === 'string' ? (record['target'] as NodeId) : undefined;
        const inline = typeof record['component'] === 'string' ? (record['component'] as NodeId) : undefined;
        return {
          kind: 'transition' as const,
          id: record['id'] as NodeId,
          ...((target !== undefined ? componentOf.get(target) : inline) !== undefined
            ? { component: (target !== undefined ? componentOf.get(target) : inline) as NodeId }
            : {}),
          ...(typeof record['source'] === 'string' ? { source: record['source'] as NodeId } : {}),
          arguments: argumentsOf(record),
        };
      }),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const boundariesByComponent = new Map<NodeId, ComponentBoundary[]>();
  for (const boundary of boundaries) {
    if (boundary.component === undefined) continue;
    const list = boundariesByComponent.get(boundary.component) ?? [];
    list.push(boundary);
    boundariesByComponent.set(boundary.component, list);
  }
  // Each per-component list is already in `boundaries`' sorted order (id order), since it was pushed
  // in that order — no separate sort needed, and re-sorting here would be a second opinion.

  return {
    routes,
    componentOf,
    transitions,
    boundaries,
    boundariesByComponent,
    hasRoutes: routes.size > 0,
  };
}
