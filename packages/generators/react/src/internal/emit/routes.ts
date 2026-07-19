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
// This *is* that layer, and M3-B declined to decide, on the grounds that there was no evidence: at the time,
// `hello_bridge` had one `Navigator.push` and the applications that would show the pattern at scale were not
// in this repository.
//
// **That reasoning has expired, and the diagnostic below no longer repeats it.** M6-D measured 62 pushes and
// 93 `MaterialPageRoute`s across two production applications, and ADR-0025 re-diagnosed the blocker: the
// generator is not waiting for evidence about URL policy, it is waiting for a UIR node that says *perform
// this transition here*. What a `component` destination becomes on a path-based target is still a
// legalization decision this layer owns — but it is no longer the thing standing in the way.
//
// The lesson is worth keeping where the mistake was made: **a diagnostic must describe a capability, not the
// state of the evidence when it was written.** "One push, in one fixture" was true for one milestone, shipped
// to users for three more, and was wrong by more than an order of magnitude by the time anybody re-measured.
// A sentence that has to be re-measured to stay true does not belong in a message.
//
// So a `component` destination reports `BRG3008` and is not emitted. That is a stated hole, which is the one
// kind this project accepts. The router descriptor carries the declared routes; the state machine that would
// push a component already exists in the kit (`createRouter`'s `Destination` union mirrors §A17 exactly).

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
        'this navigation constructs its destination inline (`Navigator.push(MaterialPageRoute(...))`), so it ' +
          'names no route and has no path (Spec v2.4 §A17). Two things are missing and both are owned by the ' +
          'compiler, not by your program: no UIR node says *perform this transition here* (ADR-0025 D2, ' +
          '`logic.Navigate`), and a destination with no path needs a URL that only this generator can choose ' +
          '— which it will not invent, because a URL the developer never wrote is what §A17.2 refused. ' +
          'The route table and the runtime router are already emitted and are waiting on those two.',
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
 * Reports every route whose component cannot be constructed from what the route records.
 *
 * A route renders its component with no arguments — `page.tsx` emits `<Screen />`. If that component
 * declares a required parameter, the emitted project cannot typecheck, and M6-C measured that this is
 * silent today: `bridge build` reports success and the failure appears in `tsc`, one layer below the
 * source the developer wrote.
 *
 * The arguments are not missing from the *document* — they are on the `ui.Element` in the app root's slot,
 * as `props`. What is missing is a field on `app.Route` linking the two, so this is a gap the compiler
 * owns and names rather than one the generator can close (see `BRG3018`).
 *
 * @param routes - every `app.Route` in the program.
 * @param components - every `ui.Component`, to resolve `route.component` to its parameters.
 * @param scope - reporting.
 */
export function reportUnsatisfiableRouteComponents(
  routes: readonly Node[],
  components: readonly Node[],
  scope: EmitScope,
): void {
  const byId = new Map<string, Node>();
  for (const component of components) {
    const id = idOf(component);
    if (id !== undefined) byId.set(id, component);
  }

  for (const route of routes) {
    const component = route['component'];
    if (typeof component !== 'string') continue;
    const target = byId.get(component);
    if (target === undefined) continue;

    const params = Array.isArray(target['params']) ? (target['params'] as Node[]) : [];
    // Only *required* parameters. An optional one is satisfied by its own default, so a route that omits it
    // renders exactly what the Flutter program renders.
    const required = params.filter((param) => param['required'] === true).map((param) => String(param['name']));
    if (required.length === 0) continue;

    scope.report(
      GeneratorDiagnosticCode.RouteComponentArguments,
      'error',
      `the route \`${String(route['path'] ?? '/')}\` renders \`${String(target['name'] ?? component)}\`, whose ` +
        `constructor requires ${required.map((name) => `\`${name}\``).join(', ')}. The construction site does ` +
        'pass them and the analyzer does extract them — they are the `props` of the `ui.Element` in the app ' +
        "root's slot — but `app.Route` has no field linking a route to that element, so the route emitter " +
        'cannot reach them and would emit a component call with no arguments. Closing this needs the ' +
        '`app.Route.arguments` amendment (docs/m6/GAP-route-constructor-arguments.md); it is not something ' +
        'this generator can infer without re-deriving the route extractor and skipping the ADR-11a ' +
        'URL-boundary analysis that a live-object argument requires.',
      idOf(route),
    );
  }
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
