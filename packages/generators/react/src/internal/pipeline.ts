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
import { emitComponent } from './emit/component.js';
import type { EmitScope } from './emit/expression.js';
import { ModuleBuilder, fileNameOf } from './emit/module.js';
import { banner, scaffold } from './emit/project.js';
import { emitRoutes } from './emit/routes.js';
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

  // ── routes ──
  const routesModule = new ModuleBuilder('src/routes/routes.ts');
  routesModule.setBanner(banner("the program's app.Route nodes"));
  const table = emitRoutes(
    context.program.ofKind('app.Route') as unknown as Node[],
    context.program.ofKind('app.RouteTransition') as unknown as Node[],
    routesModule,
    { ...scope, module: routesModule },
  );
  files.push({ path: routesModule.path, contents: routesModule.toSource() });

  // ── stores ──
  const stores: { readonly module: string; readonly name: string }[] = [];
  for (const store of context.program.ofKind('app.Store') as unknown as Node[]) {
    const path = `src/stores/${fileNameOf(String(store['name'] ?? 'store'))}.ts`;
    const module = new ModuleBuilder(path);
    module.setBanner(banner(`\`${String(store['name'])}\``));
    const name = emitStore(store, module, { ...scope, module });
    files.push({ path, contents: module.toSource() });
    stores.push({ module: `@/stores/${fileNameOf(String(store['name'] ?? 'store'))}.js`, name });
  }

  // ── components ──
  const componentModules = new Map<string, { readonly module: string; readonly name: string }>();
  for (const component of context.program.ofKind('ui.Component') as unknown as Node[]) {
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
    if (typeof id === 'string') componentModules.set(id, { module: `@/components/${base}.js`, name });
  }

  // ── scaffold ──
  const rootRouteName = firstRouteName(table.components, context.program.ofKind('app.Route') as unknown as Node[]);
  const rootComponentId = rootRouteName === undefined ? undefined : table.components.get(rootRouteName);
  files.push(
    ...scaffold({
      name: 'bridge-app',
      themeModule: '@/theme/tokens.js',
      themeName,
      routesModule: '@/routes/routes.js',
      routesName: table.descriptor,
      stores,
      root: rootComponentId === undefined ? undefined : componentModules.get(rootComponentId),
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
  return {
    module: new ModuleBuilder('<none>'),
    report,
    node: (id: NodeId) => context.program.get(id) as AnyUirNode | undefined,
    // A store member read from outside its store needs `useStore(...)` in scope, which M3-B's component
    // emitter does not yet establish — so it resolves to nothing here and the reader reports BRG3006 rather
    // than emitting a name that does not exist.
    signalRead: () => undefined,
    localName: () => undefined,
    // Nothing is inside an action at the top level; the store and component emitters layer their own.
    paramInScope: () => undefined,
    declaredName: (id) => names.get(id),
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
