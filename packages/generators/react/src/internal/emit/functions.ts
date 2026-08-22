// Top-level `logic.FunctionDecl` emission (ADR-29, M8-U).
//
// A targeted `logic.Ref` to a project-defined top-level function already carries correct,
// declaration-tier identity (M8-J) and is already correctly classified as `BRG3013` rather than the
// misleading `BRG3006` (M8-L). This file is what turns a *reachable, self-contained* one into a real,
// module-level TypeScript function — everything else stays exactly the honest refusal it already was.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import { localBindingsIn, type EmitScope } from './expression.js';
import { fileNameOf, identifierOf, ModuleBuilder } from './module.js';
import { useRuntime } from './runtime.js';
import { emitStatements } from './statement.js';
import { paramListOf, refuseNamedParams } from './types.js';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');

/**
 * The generated module path for a declaration whose own `span.file` is `spanFile` (ADR-29 §4) —
 * `package:<name>/<relative>.dart` for a declaration in a dependency package, or a plain relative path
 * (e.g. `lib/pages/x.dart`) for one in the application's own source. Derived from the span alone, never
 * from the declaration's own name, so two same-named functions in two different files can never collide
 * (ADR-29 §10) — the one thing `componentModules`'s own name-keyed convention does not guarantee.
 *
 * @returns the output path (for `ModuleBuilder`) and the `@/`-aliased specifier a consumer imports it by.
 */
export function modulePathFor(spanFile: string): { readonly path: string; readonly specifier: string } {
  const withoutScheme = spanFile.startsWith('package:') ? spanFile.slice('package:'.length) : `app/${spanFile}`;
  const firstSlash = withoutScheme.indexOf('/');
  const packageSegment = firstSlash === -1 ? withoutScheme : withoutScheme.slice(0, firstSlash);
  const rest = firstSlash === -1 ? '' : withoutScheme.slice(firstSlash + 1);
  const segments = rest
    .replace(/\.dart$/, '')
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => fileNameOf(segment));
  const relative = [fileNameOf(packageSegment), ...segments].join('/');
  const path = `src/generated/dart/${relative}.ts`;
  return { path, specifier: `@/generated/dart/${relative}` };
}

/**
 * Walks `value`, collecting the id of every `logic.FunctionDecl` a targeted `logic.Ref` resolves to.
 * Structural, not name-based — the same `Object.values` recursion `directActionRefs` (M8-O) already
 * uses, generalized to one more declaration kind. A top-level function has no access to `this`, so it can
 * never itself reference a `sig.Action` — the walk only ever needs to look for more functions once it is
 * inside a function's own body, never actions.
 */
function directFunctionRefs(value: unknown, scope: EmitScope, found: Set<NodeId>): void {
  if (Array.isArray(value)) {
    for (const item of value) directFunctionRefs(item, scope, found);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = value as Node;
  if (kindOf(node) === 'logic.Ref' && typeof node['target'] === 'string') {
    const target = node['target'] as NodeId;
    const declaration = scope.node(target) as unknown as Node | undefined;
    if (declaration !== undefined && kindOf(declaration) === 'logic.FunctionDecl') {
      found.add(target);
    }
  }
  for (const child of Object.values(node)) directFunctionRefs(child, scope, found);
}

/**
 * Every `logic.FunctionDecl` the program reaches, directly or transitively (ADR-29 §5) — from every
 * component's own render tree, every `sig.Action`'s own body (whether or not that action is itself
 * reached from a render tree — over-inclusive by a declaration that is truly dead code is harmless; under-
 * including one that is genuinely called is not), or another already-reachable function's own body.
 *
 * A fixed-point walk over a `Set<NodeId>`, mirroring `referencedActions`'s own discipline (M8-O): a
 * self-call or a mutual cycle between two functions terminates on its own, because by the time either
 * would be re-queued it is already in `found`. Not a call into `referencedActions` itself — that function
 * is scoped to one component's own render tree and one declaration kind; this one is program-wide and
 * walks into a *function's* own body for further functions, which `referencedActions` has no reason to do.
 */
export function reachableFunctions(nodes: readonly AnyUirNode[], scope: EmitScope): NodeId[] {
  const found = new Set<NodeId>();
  for (const node of nodes as unknown as Node[]) {
    if (kindOf(node) === 'ui.Component') {
      directFunctionRefs(node['render'], scope, found);
    } else if (kindOf(node) === 'sig.Action') {
      directFunctionRefs(node['body'], scope, found);
    }
  }

  let queue = [...found];
  while (queue.length > 0) {
    const next: NodeId[] = [];
    for (const id of queue) {
      const fn = scope.node(id) as unknown as Node | undefined;
      if (fn === undefined) continue;
      const discovered = new Set<NodeId>();
      directFunctionRefs(fn['body'], scope, discovered);
      for (const candidate of discovered) {
        if (!found.has(candidate)) {
          found.add(candidate);
          next.push(candidate);
        }
      }
    }
    queue = next;
  }

  return [...found].sort();
}

/** A reachable function's own destination: which file it lives in, and the local name reserved there. */
export interface FunctionModuleInfo {
  /** The output file path (`ModuleBuilder.path`) — used to tell a same-file reference from a cross-file one. */
  readonly path: string;
  /** The `@/`-aliased specifier a *different* module imports it by. */
  readonly module: string;
  readonly name: string;
}

/** One generated declarations module, accumulating every function this program places in it. */
interface PendingModule {
  readonly builder: ModuleBuilder;
  readonly specifier: string;
  readonly lines: string[];
}

/**
 * Emits every reachable, self-contained `logic.FunctionDecl` into its own module (ADR-29 §3, §4), and
 * returns the files produced plus a `target id → {path, module, name}` map for `logic.Ref` resolution
 * (`expression.ts`).
 *
 * A function that is `async`, has no body, or whose own body reports an error while being lowered (an
 * unsupported construct anywhere inside it — an opaque expression, a reference to a `logic.FieldDecl`, a
 * class instantiation, a call to a function that is itself unsupported, and so on) is **not** added to the
 * returned map and **not** written to any file — it remains exactly the `BRG3013` refusal it already was,
 * reported once, at the reference site, by the existing `logic.Ref` case in `expression.ts`; this function
 * reports nothing about *why* a shape is unsupported, because every such reason already has its own,
 * correctly-owned diagnostic.
 *
 * **Attempts, not a single ordered pass.** `reachable`'s own order is by NodeId (canonical, but not a
 * dependency order — ADR-29 §7 deliberately builds no topological sort). A function that calls another
 * reachable function may be visited before or after the one it depends on, so whether an attempt succeeds
 * is re-tried across passes, monotonically: once a function is known to succeed it is never re-attempted
 * or revoked, and each pass can only add to that set. The loop terminates because the known-good set is
 * bounded by `reachable.length` and never shrinks — the same termination argument `reachableFunctions`
 * itself already relies on, applied to a fixed point over *success*, not over *discovery*.
 */
export function emitFunctionModules(
  nodes: readonly AnyUirNode[],
  scope: EmitScope,
): { readonly files: { readonly path: string; readonly contents: string }[]; readonly functionModules: ReadonlyMap<NodeId, FunctionModuleInfo> } {
  const reachable = reachableFunctions(nodes, scope);
  const modules = new Map<string, PendingModule>();
  const functionModules = new Map<NodeId, FunctionModuleInfo>();
  let remaining = new Set(reachable);

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const id of [...remaining]) {
      const fn = scope.node(id) as unknown as Node | undefined;
      if (fn === undefined) {
        remaining.delete(id);
        continue;
      }

      // Async is a real semantic difference, not an emission detail — a function this generator does not
      // mark `async` in the output must not silently drop the `await`s its own body would otherwise need
      // (ADR-29 §11). Refused before any attempt to lower the body, rather than discovered as a `tsc`
      // type error downstream.
      const body = fn['body'];
      const span = fn['span'] as Node | undefined;
      const spanFile = typeof span?.['file'] === 'string' ? span['file'] : undefined;
      if (fn['isAsync'] === true || !Array.isArray(body) || spanFile === undefined) {
        remaining.delete(id);
        continue;
      }

      const { path, specifier } = modulePathFor(spanFile);
      let pending = modules.get(path);
      if (pending === undefined) {
        const builder = new ModuleBuilder(path);
        builder.setBanner(
          `// GENERATED CODE — DO NOT EDIT.\n//\n// Emitted by @bridge/gen-react from Dart source, module by module.\n//\n` +
            `// Edits are lost on the next build. To change what this file says, change the Flutter source it ` +
            `came from, or attach an override to the anchor of the node that produced it.`,
        );
        pending = { builder, specifier, lines: [] };
        modules.set(path, pending);
      }

      const params = Array.isArray(fn['params']) ? (fn['params'] as Node[]) : [];

      // Dart's named parameter (`foo({required int id})`) has no positional TypeScript equivalent — the
      // same refusal `store.ts`'s own action-parameter lowering already uses (Spec v2.5 §A18), shared via
      // `types.ts` rather than re-derived, so both stay honest about the identical gap.
      let hadError = false;
      const namedReport = (code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string): void => {
        if (severity === 'error') hadError = true;
        else scope.report(code, severity, message, nodeId);
      };
      if (refuseNamedParams(params, id, 'function', namedReport)) continue;

      const fnName = typeof fn['name'] === 'string' ? fn['name'] : String(id);
      const localName = pending.builder.declare(fnName, id);
      const paramNames = new Map<string, string>();
      for (const param of params) {
        const name = typeof param['name'] === 'string' ? param['name'] : undefined;
        if (name !== undefined) paramNames.set(name, identifierOf(name));
      }

      // Staged on a throwaway builder for this one attempt — an import a failed attempt asked for must
      // never leak into a file another, successfully-lowered function shares (a sibling in the same
      // source file). Only replayed onto the real, shared `pending.builder` once the attempt succeeds.
      const scratch = new ModuleBuilder(pending.builder.path);
      const locals = localBindingsIn(body);
      const fnScope: EmitScope = {
        ...scope,
        module: scratch,
        functionModules,
        paramInScope: (name) => paramNames.get(name) ?? scope.paramInScope(name),
        localName: (localId) => locals.get(localId) ?? scope.localName(localId),
        report: (code, severity, message, nodeId) => {
          if (severity === 'error') hadError = true;
          else scope.report(code, severity, message, nodeId);
        },
      };
      const signature = `(${paramListOf(params, identifierOf, (name) => useRuntime(scratch, name))})`;
      const lines = emitStatements(body, fnScope);

      if (hadError) continue; // try again next pass — a callee this pass hadn't resolved yet might resolve then

      for (const request of scratch.usedImports()) pending.builder.use(request.from, request.name, { typeOnly: request.typeOnly });
      pending.lines.push(`export function ${localName}${signature} {`, ...lines.map((line: string) => `  ${line}`), '}', '');

      functionModules.set(id, { path: pending.builder.path, module: specifier, name: localName });
      remaining.delete(id);
      progressed = true;
    }
  }

  // Whatever is left after the fixed point stabilizes is genuinely unsupported (or depends, transitively,
  // on something that is) — each already reported its own diagnostic during its last, failed attempt.
  for (const [path, pending] of modules) {
    if (pending.lines.length === 0) continue;
    for (const line of pending.lines) pending.builder.line(line);
    modules.set(path, pending);
  }

  const files = [...modules.values()]
    .filter((m) => m.lines.length > 0)
    .map((m) => ({ path: m.builder.path, contents: m.builder.toSource() }));

  return { files, functionModules };
}
