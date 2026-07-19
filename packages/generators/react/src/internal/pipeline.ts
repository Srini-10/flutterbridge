// The generator pipeline — a normalized program in, a project out.
//
// ## Determinism, and where it actually comes from
//
// The milestone is judged on byte-identical output, and it is not achieved by sorting at the end. It is a
// property of every step:
//
// - **The program is already canonically ordered** (kind, then id) — the compiler guarantees it, so `ofKind`
//   returns a stable list without this file sorting anything.
// - **Emitters sort by a human key, not by id.** Tokens by name, routes by path, imports by specifier. Ids are
//   content hashes, so id order looks random and changes whenever a value does; a diff in that order is
//   unreadable, and "deterministic" is not the same as "stable across edits".
// - **Files are sorted by path** before they are returned, so the array is the same too — not just its
//   contents.
// - **Nothing consults the clock, the filesystem, or a random source.** ADR-8 lint-bans `fs` and `fetch` in
//   plugin packages; `generate` is a pure function, which is what makes "run it twice and compare" a complete
//   test of the property (ADR-22).
//
// ## Why an `error` stops everything
//
// `docs/architecture/compiler.md` defines the severity, and it is not advisory: *"**error** — the program is
// not fit to generate from. Something would have to be invented."* A generator that emits from a program with
// a hole in it produces an application that compiles and is wrong, which is worth strictly less than no
// application and a list of reasons.

import type { Diagnostic, EmittedFile, GeneratorContext, GeneratorOutput } from '@bridge/plugin-sdk';
import type { AnyUirNode, NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from './diagnostics/codes.js';
import { isAppRoot, reportAppRoot } from './emit/app_root.js';
import { assetManifestLines, collectAssets } from './emit/assets.js';
import { emitBinding, emitComponent } from './emit/component.js';
import type { EmitScope } from './emit/expression.js';
import { ModuleBuilder, fileNameOf, identifierOf } from './emit/module.js';
import { RUNTIME_MODULE } from './emit/runtime.js';
import { banner, scaffold, type PageInput, type PageScreen } from './emit/project.js';
import {
  emitRoutes,
  reportUnsatisfiableRouteComponents,
  routeArguments,
  routeNameOf,
  type RouteTable,
} from './emit/routes.js';
import { emitStore } from './emit/store.js';
import { emitTheme } from './emit/theme.js';

type Node = Record<string, unknown>;

/** Runs the generator. */
export function generateProject(context: GeneratorContext): GeneratorOutput {
  const reported: Diagnostic[] = [];
  const report = (
    code: string,
    severity: 'error' | 'warning' | 'info',
    message: string,
    nodeId?: string,
  ): void => {
    const diagnostic: Diagnostic = nodeId === undefined ? { code, severity, message } : { code, severity, message, nodeId };
    reported.push(diagnostic);
    context.report(diagnostic);
  };

  // Refuse before emitting, not per node. A program carrying an upstream error is not fit to generate from,
  // and discovering that halfway through leaves a half-written project on disk.
  const inherited = context.diagnostics.filter((d) => d.severity === 'error');
  if (inherited.length > 0) {
    report(
      GeneratorDiagnosticCode.ProgramNotFitToGenerate,
      'error',
      `the program carries ${inherited.length} error-severity diagnostic(s) from an earlier stage ` +
        `(${inherited.map((d) => d.code).join(', ')}). An error means something would have to be invented, ` +
        `so nothing is emitted.`,
    );
    return { files: [] };
  }

  const files: EmittedFile[] = [];
  const scope = rootScope(context, report);

  // ── theme ──
  const themeModule = new ModuleBuilder('src/theme/tokens.ts');
  themeModule.setBanner(banner("the program's app.Token nodes"));
  const themeName = emitTheme(context.program.ofKind('app.Token') as unknown as Node[], themeModule, {
    ...scope,
    module: themeModule,
  });
  files.push({ path: themeModule.path, contents: themeModule.toSource() });

  // ── assets ──
  //
  // Collected from the whole program before any component is emitted, because an asset referenced from two
  // screens is one manifest entry — the manifest is a property of the application, not of a file in it.
  const assets = collectAssets(context.program.nodes as unknown as Node[], scope);
  const assetsModule = new ModuleBuilder('src/assets/manifest.ts');
  assetsModule.setBanner(banner("the program's asset references"));
  assetsModule.use(RUNTIME_MODULE, 'AssetManifest', { typeOnly: true });
  assetsModule.lineAll(assetManifestLines(assets, 'assetManifest'));
  files.push({ path: assetsModule.path, contents: assetsModule.toSource() });

  // ── routes ──
  const routesModule = new ModuleBuilder('src/routes/routes.ts');
  routesModule.setBanner(banner("the program's app.Route nodes"));
  const table = emitRoutes(
    context.program.ofKind('app.Route') as unknown as Node[],
    context.program.ofKind('app.RouteTransition') as unknown as Node[],
    routesModule,
    { ...scope, module: routesModule },
    performedTransitions(context.program.nodes as unknown as Node[]),
  );
  files.push({ path: routesModule.path, contents: routesModule.toSource() });

  // Checked here rather than inside `emitRoutes`, because it needs the `ui.Component` nodes to resolve a
  // route's component to its parameters, and the route emitter's input is deliberately the route table.
  reportUnsatisfiableRouteComponents(
    context.program.ofKind('app.Route') as unknown as Node[],
    context.program.ofKind('ui.Component') as unknown as Node[],
    scope,
  );

  // ── stores ──
  const stores: { readonly module: string; readonly name: string }[] = [];
  for (const store of context.program.ofKind('app.Store') as unknown as Node[]) {
    const path = `src/stores/${fileNameOf(String(store['name'] ?? 'store'))}.ts`;
    const module = new ModuleBuilder(path);
    module.setBanner(banner(`\`${String(store['name'])}\``));
    const name = emitStore(store, module, { ...scope, module });
    files.push({ path, contents: module.toSource() });
    stores.push({ module: `@/stores/${fileNameOf(String(store['name'] ?? 'store'))}`, name });
  }

  // ── components ──
  const componentModules = new Map<string, { readonly module: string; readonly name: string }>();
  for (const component of context.program.ofKind('ui.Component') as unknown as Node[]) {
    // An application root emits no file. Everything a `MaterialApp` carries has already been consumed —
    // `home:`/`routes:` into `app.Route`, `theme:` into the tokens N10 expands — and `layout.tsx`,
    // `providers.tsx` and `page.tsx` below *are* its lowering. Emitting a component for it would mount the
    // whole application a second time, inside itself. `app_root.ts` has the evidence and reports the
    // parameters that genuinely have nowhere to go.
    if (isAppRoot(component)) {
      reportAppRoot(component, report);
      continue;
    }
    const base = fileNameOf(String(component['name'] ?? 'component'));
    const path = `src/components/${base}.tsx`;
    const module = new ModuleBuilder(path);
    module.setBanner(banner(`\`${String(component['name'])}\``));
    // Every component is client-scoped until `rsc-split` exists — see project.ts on why erring this way is
    // the survivable direction. A directive, not a body line: it must precede every import to count (D1).
    module.directive("'use client';");
    const name = emitComponent(component, module, { ...scope, module });
    files.push({ path, contents: module.toSource() });
    const id = component['id'];
    if (typeof id === 'string') componentModules.set(id, { module: `@/components/${base}`, name });
  }

  // ── scaffold ──
  const allRoutes = context.program.ofKind('app.Route') as unknown as Node[];
  const rootRouteName = firstRouteName(table.components, allRoutes);
  const rootComponentId = rootRouteName === undefined ? undefined : table.components.get(rootRouteName);
  files.push(
    ...scaffold({
      name: 'bridge-app',
      themeModule: '@/theme/tokens',
      themeName,
      routesModule: '@/routes/routes',
      routesName: table.descriptor,
      assetsModule: '@/assets/manifest',
      assetsName: 'assetManifest',
      stores,
      page: pageOf(
        table,
        allRoutes,
        context.program.ofKind('app.RouteTransition') as unknown as Node[],
        componentModules,
        rootComponentId,
        scope,
      ),
    }),
  );

  // The same rule that refused an inherited error, applied to the ones this run produced. An `error` means
  // something would have to be invented — and by the time one is reported, the emitter has already put
  // *something* in the file where the thing it could not lower belonged. Returning those bytes would ship a
  // project that compiles to `undefined()` and fails at the first click; returning none says exactly what is
  // missing and costs nothing that was worth having.
  //
  // It is checked here rather than at each emitter because the diagnostics are the point: a caller wants the
  // whole list, not the first failure.
  const produced = reported.filter((diagnostic) => diagnostic.severity === 'error');
  if (produced.length > 0) {
    const codes = [...new Set(produced.map((diagnostic) => diagnostic.code))].sort();
    report(
      GeneratorDiagnosticCode.ProgramNotFitToGenerate,
      'error',
      `generation reported ${produced.length} error(s) (${codes.join(', ')}), so no files are emitted. ` +
        `Each names a construct this generator cannot render faithfully; a partial project would compile ` +
        `around the holes and fail where they are.`,
    );
    return { files: [] };
  }

  // Sorted by path: the array is part of the output, and a caller diffing two runs compares arrays.
  return { files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

/**
 * Everything `app/page.tsx` needs: its imports, its wrappers, and the name it renders for each screen.
 *
 * ## Why the arguments are lowered here
 *
 * A route's `arguments` are `bind.*` nodes (ADR-0025 D1), and turning one into an expression needs the
 * emit scope — resolution and reporting. The scaffolder has neither and should not grow them, so the
 * lowering happens here and crosses over as text. It happens against a `ModuleBuilder` for
 * `app/page.tsx`, so anything a value pulls in is imported by the file that uses it, and the page's whole
 * import block is ordered by the one rule every other emitted file follows.
 *
 * ## Why a wrapper, rather than props on the outlet
 *
 * `RouterOutlet` is handed `Record<string, ComponentType>` and calls `createElement(component)`. A route
 * that carries arguments therefore cannot be passed as its bare component — the arguments would be
 * dropped at the last step, which is exactly the silence BRG3018 exists to prevent. So the page declares
 * a component that supplies them:
 *
 * ```tsx
 * function CounterPanelRoute() {
 *   return <CounterPanel label="Taps" />;
 * }
 * ```
 *
 * **At module scope, never inline.** An arrow written into the map literal is a new component identity on
 * every render of `Page`, and `Page` re-renders on every navigation — React would unmount and remount the
 * screen each time, discarding its state. A module-scope function has one identity for the life of the
 * module. The name is minted through `module.declare`, so a wrapper cannot collide with an imported
 * component that happens to be called the same thing.
 *
 * A route with no arguments is passed as its component exactly as before, so the common case emits the
 * bytes it always did.
 */
function pageOf(
  table: RouteTable,
  routes: readonly Node[],
  transitions: readonly Node[],
  modules: ReadonlyMap<string, { readonly module: string; readonly name: string }>,
  rootComponentId: string | undefined,
  scope: EmitScope,
): PageInput {
  const module = new ModuleBuilder('app/page.tsx');
  const declarations: string[] = [];
  const byRouteName = new Map<string, Node>();
  for (const route of routes) byRouteName.set(routeNameOf(route), route);

  // Every screen's import is reserved *before* any wrapper is named, so `declare` can see the names that
  // are already taken. An import cannot be renamed on collision; a wrapper can.
  const imported = new Map<string, { readonly module: string; readonly name: string }>();
  const reserve = (componentId: string): { readonly module: string; readonly name: string } | undefined => {
    const emitted = modules.get(componentId);
    if (emitted === undefined) return undefined;
    if (!imported.has(componentId)) {
      module.use(emitted.module, emitted.name);
      module.declare(emitted.name, componentId);
      imported.set(componentId, emitted);
    }
    return emitted;
  };

  /** The identifier the page renders for `componentId`, declaring a wrapper when `route` carries arguments. */
  const rendered = (componentId: string, route: Node | undefined): string | undefined => {
    const emitted = reserve(componentId);
    if (emitted === undefined) return undefined;

    const args = route === undefined ? [] : routeArguments(route);
    const props: string[] = [];
    const unreachable: string[] = [];
    for (const argument of args) {
      const name = argument['name'];
      const binding = argument['binding'];
      if (typeof name !== 'string' || name === '') continue;
      if (binding === null || typeof binding !== 'object') continue;

      // Lowered **twice, on purpose**: once against a throwaway module with a report sink that only
      // counts, and again for real if that came back clean.
      //
      // The probe exists because `emitBinding` answers "I could not resolve this" by reporting and
      // returning `undefined`, and both halves of that are wrong here. The diagnostic is written for a
      // binding inside a component — `a bind.Signal names 36d5792c…, which is not a signal in scope`,
      // a content hash and no owner — and the `undefined` would be passed as a prop. At this call site
      // the *reason* is knowable and specific, so the low-level report is suppressed and replaced below
      // by one that names the capability and the pass that owns it.
      let reports = 0;
      emitBinding(binding as Node, {
        ...scope,
        module: new ModuleBuilder('<probe>'),
        report: () => {
          reports += 1;
        },
      });
      if (reports > 0) {
        unreachable.push(name);
        continue;
      }
      // The real lowering, into the page's own module, so anything it imports is imported by the file
      // that uses it. It cannot report — the probe just proved that — so it cannot report twice.
      props.push(`${identifierOf(name)}={${emitBinding(binding as Node, { ...scope, module })}}`);
    }

    if (unreachable.length > 0) {
      // The value is real, the analyzer recorded it, and the page cannot reach it. In every case measured
      // this is the same shape: the argument reads a signal or an action declared by the **application
      // root**, which `app_root.ts` consumes rather than emits — so the state it names has no home in the
      // generated project. ADR-11 is the answer and N11 is the pass, but N11 walks
      // `app.RouteTransition.arguments` only (see the compiler's `nav-graph` analysis); a declarative
      // route's arguments are not promoted, so nothing has moved that state into a store.
      scope.report(
        GeneratorDiagnosticCode.UnsupportedCapability,
        'error',
        `the route \`${String(route?.['path'] ?? '/')}\` passes ` +
          `${unreachable.map((name) => `\`${name}\``).join(', ')} to \`${emitted.name}\`, and the value is ` +
          'state declared outside any component the project emits — typically the application root, which ' +
          'is consumed into the route table and the theme rather than rendered. Missing capability: ' +
          "promoting a **declarative route's** arguments into a store. " +
          'Owner: N11 (`promote-cross-route-state`, ADR-11), which promotes the arguments an ' +
          '`app.RouteTransition` carries and does not yet walk `app.Route.arguments`. The analyzer records ' +
          'the argument correctly; nothing downstream has moved the state it reads anywhere the page can ' +
          'read it, and passing `undefined` would render a screen that is silently wrong.',
        typeof route?.['id'] === 'string' ? (route['id'] as string) : undefined,
      );
    }

    if (props.length === 0) return emitted.name;

    const wrapper = module.declare(`${emitted.name}Route`, `route:${componentId}`);
    declarations.push(
      `/** \`${String(route?.['path'] ?? '/')}\` — \`${emitted.name}\`, with the arguments the route records. */`,
      `function ${wrapper}() {`,
      `  return <${emitted.name} ${props.join(' ')} />;`,
      '}',
      '',
    );
    return wrapper;
  };

  const routeScreens: PageScreen[] = [];
  for (const [routeName, componentId] of table.components) {
    const name = rendered(componentId, byRouteName.get(routeName));
    if (name !== undefined) routeScreens.push({ key: routeName, name });
  }

  // An inline destination is reached by a push, not by a route, so it has no `app.Route` and no arguments
  // to construct it with — §A17.6 says a push carries no path, and `app.RouteTransition.arguments` is
  // N11's business rather than the page's. It renders as its bare component.
  const componentScreens: PageScreen[] = [];
  const seen = new Set<string>();
  for (const transition of transitions) {
    const componentId = transition['component'];
    if (typeof componentId !== 'string' || seen.has(componentId)) continue;
    const emitted = reserve(componentId);
    if (emitted === undefined) continue;
    seen.add(componentId);
    componentScreens.push({ key: componentId, name: emitted.name });
  }

  // Sorted by key: a map's order is not a fact about the program, and an emitter's traversal order must
  // not reach the output (D1).
  routeScreens.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  componentScreens.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // The outlet's own import, added last so it cannot be mistaken for a screen's, and only when there is
  // an outlet: a page that renders its root directly must not import one.
  if (routeScreens.length > 0 || componentScreens.length > 0) {
    module.use(RUNTIME_MODULE, 'RouterOutlet');
  }

  const root =
    rootComponentId === undefined
      ? undefined
      : (routeScreens.find((screen) => table.components.get(screen.key) === rootComponentId)?.name ??
        imported.get(rootComponentId)?.name);

  return {
    root,
    routes: routeScreens,
    components: componentScreens,
    imports: [...module.importLines()],
    declarations,
  };
}

/** The route rendered at `/`, or the first one. */
function firstRouteName(components: ReadonlyMap<string, string>, routes: readonly Node[]): string | undefined {
  if (components.size === 0) return undefined;
  const sorted = [...routes].sort((a, b) => (String(a['path']) < String(b['path']) ? -1 : 1));
  const root = sorted.find((route) => route['path'] === '/') ?? sorted[0];
  if (root === undefined) return undefined;
  const path = String(root['path'] ?? '/');
  const segments = path.split('/').filter(Boolean).map((s) => s.replace(/^:/, ''));
  return segments.length === 0 ? 'root' : segments.join('-');
}

/** The program-wide scope: everything resolvable without being inside a component or store. */
function rootScope(
  context: GeneratorContext,
  report: (code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string) => void,
): EmitScope {
  // Store members resolve program-wide: a component reading `favorites.count` names a signal the store owns,
  // and the component emitter must resolve it to a read even though it did not declare it. Built once,
  // because it is the same for every file.
  const storeMembers = new Map<NodeId, string>();
  for (const store of context.program.ofKind('app.Store') as unknown as Node[]) {
    for (const key of ['signals', 'derived', 'actions'] as const) {
      const ids = Array.isArray(store[key]) ? (store[key] as string[]) : [];
      for (const id of ids) storeMembers.set(id, id);
    }
  }
  const names = nameIndex(context.program.nodes);

  // Every role the theme can resolve. Both keys, because the two producers differ: N10 sets `name` and `role`
  // to the same string for the 46 it derives from a seed, while a theme that states a colour directly carries
  // its own `name` and a `role` only when the parameter it came from *is* a role (`ColorScheme(primary: …)`).
  // A role-only index would miss the first; a name-only index would miss the second.
  const themeRoles = new Set<string>();
  for (const token of context.program.ofKind('app.Token') as unknown as Node[]) {
    if (token['group'] !== 'color') continue;
    if (typeof token['name'] === 'string') themeRoles.add(token['name']);
    if (typeof token['role'] === 'string') themeRoles.add(token['role']);
  }

  return {
    module: new ModuleBuilder('<none>'),
    report,
    themeRoles,
    node: (id: NodeId) => context.program.get(id) as AnyUirNode | undefined,
    // A store member read from outside its store needs `useStore(...)` in scope, which M3-B's component
    // emitter does not yet establish — so it resolves to nothing here and the reader reports BRG3006 rather
    // than emitting a name that does not exist.
    signalRead: () => undefined,
    signalLocal: () => undefined,
    localName: () => undefined,
    // Nothing is inside an action at the top level; the store and component emitters layer their own.
    paramInScope: () => undefined,
    declaredName: (id) => names.get(id),
    // No class is ever emitted — M3-B lowers no `logic.ClassDecl`. Stated once, here, so `logic.New` can
    // refuse a construction of one by name instead of emitting a reference that fails at `tsc`.
    declaresClass: () => false,
  };
}

/**
 * Recovers declaration names from the references to them.
 *
 * `sig.Signal` and `sig.Action` are symbol-addressed (ADR-17) and carry no `name` — the symbol never reaches
 * the document. But every `logic.Ref` that reads one carries `target` *and* the name the author wrote, so the
 * program does state it, on the reader rather than the declaration. Without this a real store emits
 * `value_d18f644e` where `favorites_store.dart` says `_favoriteIds`: it compiles, and no one can review it.
 *
 * Ties are broken by taking the first name in canonical program order, so the result does not depend on which
 * reference happened to be walked first.
 */
function nameIndex(nodes: readonly AnyUirNode[]): Map<NodeId, string> {
  const names = new Map<NodeId, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;
    if (node['kind'] === 'logic.Ref') {
      const target = node['target'];
      const name = node['name'];
      if (typeof target === 'string' && typeof name === 'string' && !names.has(target)) {
        names.set(target, name);
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  for (const node of nodes) visit(node);
  return names;
}

/**
 * Every `app.RouteTransition` some `logic.Navigate` performs.
 *
 * The nav graph and the statements that walk it are separate by design (ADR-0025 D2: an edge is
 * declarative; performing one is a statement), so the only way to know an edge is reachable at runtime is
 * to look for the departure that names it.
 */
function performedTransitions(nodes: readonly Node[]): ReadonlySet<string> {
  const performed = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(walk);
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;
    if (node['kind'] === 'logic.Navigate' && typeof node['transition'] === 'string') {
      performed.add(node['transition']);
    }
    Object.values(node).forEach(walk);
  };
  nodes.forEach(walk);
  return performed;
}
