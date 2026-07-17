// The routing emitter — `app.Route` → a `RouterDescriptor`.
//
// ## Spec v2.4 §A17.6 is this file's whole boundary
//
// > **How an inline destination becomes a URL on a path-based target is out of scope**, and deliberately so.
// > A `component` destination says only what the Flutter program does: it renders that component, with those
// > arguments, on a new stack entry. Whether the React/Next.js generator gives it a synthetic route, a modal,
// > or a client-side stack is a legalization decision, to be made in the layer that knows the target — with
// > the evidence in front of it, not guessed at here.
//
// This *is* that layer. So the decision is ours to make — and M3-B declines to make it, on the same grounds
// §A17 used to refuse the other three options: **there is no evidence yet**. `hello_bridge` has one
// `Navigator.push`; the two apps that would show the pattern at scale are not in this repository. Inventing
// `/_push/HomeScreen` here would bake a routing policy into the generator on a sample of one — and §A17.2
// already refused exactly that URL, in the analyzer, for exactly that reason.
//
// So a `component` destination reports `BRG3008` and is not emitted. That is a stated hole, which is the one
// kind this project accepts. The router descriptor carries the declared routes; the state machine that would
// push a component already exists in the kit (`createRouter`'s `Destination` union mirrors §A17 exactly), and
// wiring it needs the legalization decision, which needs the evidence.

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { stringLiteral, type EmitScope } from './expression.js';
import { identifierOf, type ModuleBuilder } from './module.js';

const RUNTIME = '@bridge/runtime-react';

type Node = Record<string, unknown>;

const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/** The route table, and what each route renders. */
export interface RouteTable {
  /** The exported descriptor's name. */
  readonly descriptor: string;
  /** Route name → the `ui.Component` node id it renders. */
  readonly components: ReadonlyMap<string, string>;
}

/**
 * Emits the router descriptor.
 *
 * @param routes - every `app.Route` in the program.
 * @param transitions - every `app.RouteTransition`, for the destinations this generator cannot route.
 * @param module - the file to write into.
 * @param scope - resolution and reporting.
 * @returns the descriptor's name and the route→component map.
 */
export function emitRoutes(
  routes: readonly Node[],
  transitions: readonly Node[],
  module: ModuleBuilder,
  scope: EmitScope,
): RouteTable {
  const typeName = module.use(RUNTIME, 'RouterDescriptor', { typeOnly: true });
  const exported = module.declare('routes', 'routes');
  const components = new Map<string, string>();

  // Sorted by path. Program order is hash order; a route table that reorders when a path's text changes is a
  // diff nobody can read.
  const sorted = [...routes].sort((a, b) => (String(a['path']) < String(b['path']) ? -1 : 1));

  for (const transition of transitions) {
    if (typeof transition['component'] === 'string' && transition['target'] === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnroutableDestination,
        'error',
        'this navigation constructs its destination inline (`Navigator.push(MaterialPageRoute(...))`), so ' +
          'it has no path (Spec v2.4 §A17). Which URL it becomes on a path-based target is a legalization ' +
          'decision this generator declines to make on the evidence available — one push, in one fixture. ' +
          'Inventing a URL the developer never wrote is what §A17.2 refused.',
        idOf(transition),
      );
    }
  }

  const names = new Map<Node, string>();
  for (const route of sorted) {
    const component = route['component'];
    const name = routeNameOf(route);
    names.set(route, name);
    if (typeof component === 'string') components.set(name, component);
  }

  module.line('/** The route table, projected from the program\'s `app.Route` nodes (ADR-19). */');
  module.line(`export const ${exported}: ${typeName} = {`);
  module.block(() => {
    module.line('routes: [');
    module.block(() => {
      for (const route of sorted) {
        module.line(
          `{ name: ${stringLiteral(names.get(route) ?? '')}, path: ${stringLiteral(String(route['path'] ?? '/'))} },`,
        );
      }
    });
    module.line('],');
    const initial = sorted.find((route) => route['path'] === '/') ?? sorted[0];
    if (initial !== undefined) {
      module.line(`initial: ${stringLiteral(names.get(initial) ?? '')},`);
    }
  });
  module.line('};');
  module.line();

  if (sorted.length === 0) {
    scope.report(
      GeneratorDiagnosticCode.UnsupportedExpression,
      'warning',
      'the program declares no routes, so the generated router has none. `app.RouteTransition` call sites ' +
        'are what would populate the nav graph, and the analyzer emits none for this program.',
    );
  }

  return { descriptor: exported, components };
}

/**
 * A route's name in the descriptor.
 *
 * `app.Route` has a `path`, not a name — the kit's `RouteDescriptor.name` is its own identity for the route,
 * and the path is what the program actually stated. Deriving the name from the path keeps the two consistent
 * and is deterministic: `/product/:id` → `product-id`.
 */
function routeNameOf(route: Node): string {
  const path = String(route['path'] ?? '/');
  const segments = path.split('/').filter(Boolean).map((segment) => segment.replace(/^:/, ''));
  return segments.length === 0 ? 'root' : identifierOf(segments.join('-')).replace(/_/g, '-');
}
