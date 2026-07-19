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
  performed: ReadonlySet<string> = new Set<string>(),
): RouteTable {
  const typeName = module.use(RUNTIME, 'RouterDescriptor', { typeOnly: true });
  const exported = module.declare('routes', 'routes');
  const components = new Map<string, string>();

  // Sorted by path. Program order is hash order; a route table that reorders when a path's text changes is a
  // diff nobody can read.
  const sorted = [...routes].sort((a, b) => (String(a['path']) < String(b['path']) ? -1 : 1));

  for (const transition of transitions) {
    // A transition a `logic.Navigate` performs is **no longer unroutable**. M7-C found BRG3008's stated
    // blocker — the missing URL — was never the real one: the kit's `Destination` has always modelled a
    // path-less component push and §A17.6 says none is invented. What was missing was a node saying
    // *perform this here* (ADR-0025 D2) and something that renders the stack (`RouterOutlet`). With both,
    // an inline push compiles and shows a screen.
    //
    // So this now fires for exactly what it was always about: an edge nothing performs, because the
    // analyzer could not lower the call that would have.
    const performedId = idOf(transition);
    if (performedId !== undefined && performed.has(performedId)) {
      continue;
    }
    if (typeof transition['component'] === 'string' && transition['target'] === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnroutableDestination,
        'error',
        'this navigation constructs its destination inline (`Navigator.push(MaterialPageRoute(...))`), so it ' +
          'names no route and has no path (Spec v2.4 §A17). The edge is in the nav graph and **nothing ' +
          'performs it** — no `logic.Navigate` names this transition, which means the analyzer could not ' +
          'lower the call that would have. An inline push whose call *is* lowered renders through the ' +
          'runtime stack and needs no URL (§A17.6). That is a compiler gap, not a defect in your program.',
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
 * The names a route supplies to its component, from `app.Route.arguments` (ADR-0025 D1).
 *
 * An argument with no `name` is not a name that can satisfy anything, so it is not counted — the check
 * below reports a parameter as unsatisfied unless something *nameable* covers it.
 */
export function suppliedArgumentNames(route: Node): ReadonlySet<string> {
  const args = Array.isArray(route['arguments']) ? (route['arguments'] as Node[]) : [];
  const names = new Set<string>();
  for (const argument of args) {
    const name = argument['name'];
    if (typeof name === 'string' && name !== '') names.add(name);
  }
  return names;
}

/**
 * The arguments a route passes to its component, in the document's order.
 *
 * Order is the construction site's order, which is the author's. Sorting would be a second opinion about
 * a list the program already stated.
 */
export function routeArguments(route: Node): readonly Node[] {
  return Array.isArray(route['arguments']) ? (route['arguments'] as Node[]) : [];
}

/**
 * Reports every route whose component cannot be constructed from what the route records.
 *
 * A route renders its component with the arguments `app.Route.arguments` carries. If the component
 * declares a **required** parameter that no argument supplies, the emitted project cannot typecheck —
 * and M6-C measured that this used to be silent: `bridge build` reported success and the failure appeared
 * in `tsc`, one layer below the source the developer wrote.
 *
 * Until M7-D the field did not exist, so every required parameter was unsatisfiable and this fired for
 * all of them. It exists now and the analyzer populates it, so the question narrowed to the one it was
 * always about: **is there a value for this parameter?** A parameter the construction site passes is no
 * longer reported, because there is nothing missing about it.
 *
 * What still reaches here is a required parameter with no argument at all. In valid Dart that is not a
 * program the author wrote wrong — `Panel()` against `required this.label` does not compile — so it means
 * the compiler could not record the value: a **positional** argument, whose parameter name is not stated
 * at the call site; an argument whose expression has no UIR node, dropped rather than serialized as Dart
 * source; or a construction no scoped walk reached, whose arguments cannot be bound without inventing a
 * scope. Each is a compiler gap, and the message says so rather than blaming the program.
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

    const supplied = suppliedArgumentNames(route);
    const missing = required.filter((name) => !supplied.has(name));
    if (missing.length === 0) continue;

    scope.report(
      GeneratorDiagnosticCode.RouteComponentArguments,
      'error',
      `the route \`${String(route['path'] ?? '/')}\` renders \`${String(target['name'] ?? component)}\`, whose ` +
        `constructor requires ${missing.map((name) => `\`${name}\``).join(', ')}, and the route supplies ` +
        `${supplied.size === 0 ? 'no arguments at all' : `only ${[...supplied].sort().map((name) => `\`${name}\``).join(', ')}`}. ` +
        'Missing capability: recording that argument on `app.Route.arguments`. Owner: the analyzer\'s route ' +
        'extractor. A route argument is recorded only when its parameter is named at the construction site ' +
        'and its value has a UIR node — a positional argument states no name, and an expression with no node ' +
        'is dropped rather than carried as Dart source. Emitting the component without it would produce a ' +
        'call that cannot typecheck, so nothing is emitted instead.',
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
export function routeNameOf(route: Node): string {
  const path = String(route['path'] ?? '/');
  const segments = path.split('/').filter(Boolean).map((segment) => segment.replace(/^:/, ''));
  return segments.length === 0 ? 'root' : identifierOf(segments.join('-')).replace(/_/g, '-');
}
