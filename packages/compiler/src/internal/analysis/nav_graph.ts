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

/** The route graph, and what crosses it. */
export interface NavGraph {
  /** Every route, by id. */
  readonly routes: ReadonlyMap<NodeId, AnyUirNode>;

  /** The component each route renders, by route id. */
  readonly componentOf: ReadonlyMap<NodeId, NodeId>;

  /** Every transition, sorted by id — a set has no traversal order (D2). */
  readonly transitions: readonly Transition[];

  /** Whether the program has any route boundary at all. */
  readonly hasRoutes: boolean;
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
      const args = Array.isArray(record['arguments'])
        ? (record['arguments'] as Record<string, unknown>[])
        : [];

      return {
        id: t.id,
        ...(typeof record['source'] === 'string' ? { source: record['source'] as NodeId } : {}),
        target: record['target'] as NodeId,
        arguments: args.map((a) => ({
          name: String(a['name']),
          ...(a['binding'] !== undefined
            ? { binding: a['binding'] as Record<string, unknown> }
            : {}),
        })),
      };
    })
    // Sorted: the graph is data, and data whose order depends on how it was discovered is data that
    // makes two runs differ.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { routes, componentOf, transitions, hasRoutes: routes.size > 0 };
}
