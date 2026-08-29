// Top-level `logic.FunctionDecl` emission (ADR-29, M8-U).
//
// A targeted `logic.Ref` to a project-defined top-level function already carries correct,
// declaration-tier identity (M8-J) and is already correctly classified as `BRG3013` rather than the
// misleading `BRG3006` (M8-L). This file is what turns a *reachable, self-contained* one into a real,
// module-level TypeScript function — everything else stays exactly the honest refusal it already was.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { isEligibleStructuralField, localBindingsIn, type EmitScope } from './expression.js';
import { fileNameOf, identifierOf, ModuleBuilder } from './module.js';
import { useRuntime, useRuntimeType } from './runtime.js';
import { emitStatements } from './statement.js';
import { paramListOf, refuseNamedParams, typeTextOf } from './types.js';

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

/** A reachable getter's own destination: which file it lives in, and the helper name reserved there. */
export interface GetterHelperInfo {
  readonly path: string;
  readonly module: string;
  readonly name: string;
}

/** A reachable method's own destination: which file it lives in, and the helper name reserved there (ADR-0039, M10-A). */
export interface MethodHelperInfo {
  readonly path: string;
  readonly module: string;
  readonly name: string;
}

/**
 * Walks `value`, collecting the `target` of every `logic.PropertyAccess`/bare `logic.Ref` naming a getter
 * present in `getterOwnerOf`, and every `logic.MethodCall` naming a method present in `methodOwnerOf`
 * (ADR-0038/ADR-0039, M10-B) — the combined, cross-kind sibling of {@link directFunctionRefs}. A bare
 * `logic.Ref` is checked against `getterOwnerOf` only, never `methodOwnerOf`: a bare method reference is
 * always a call (`logic.MethodCall`), never a value (a method tear-off is a separate, unsupported
 * capability — M10-B §"hard non-goals" — so the Dart extractor never produces one).
 */
function directMemberRefs(
  value: unknown,
  getterOwnerOf: ReadonlyMap<NodeId, NodeId>,
  methodOwnerOf: ReadonlyMap<NodeId, NodeId>,
  foundGetters: Set<NodeId>,
  foundMethods: Set<NodeId>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) directMemberRefs(item, getterOwnerOf, methodOwnerOf, foundGetters, foundMethods);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = value as Node;
  const kind = kindOf(node);
  if ((kind === 'logic.PropertyAccess' || kind === 'logic.Ref') && typeof node['target'] === 'string') {
    const target = node['target'] as NodeId;
    if (getterOwnerOf.has(target)) foundGetters.add(target);
  }
  if (kind === 'logic.MethodCall' && typeof node['target'] === 'string') {
    const target = node['target'] as NodeId;
    if (methodOwnerOf.has(target)) foundMethods.add(target);
  }
  for (const child of Object.values(node)) directMemberRefs(child, getterOwnerOf, methodOwnerOf, foundGetters, foundMethods);
}

/**
 * Every explicit instance getter/method the program reaches, directly or **transitively through another
 * reachable member's own body** (ADR-0038/ADR-0039, M10-B) — the member-execution sibling of
 * {@link reachableFunctions}, generalized from a single, non-recursive pass (ADR-0038 §13/ADR-0039 §10's
 * own "no cross-member matrix" scope, now closed) to a real fixed point, mirroring
 * `component.ts`'s own `referencedActions`: seed from every component render tree, `sig.Action` body, and
 * already-reachable top-level function body, then repeat — walk every *newly* found member's own body for
 * more member references — until a pass adds nothing. `foundGetters`/`foundMethods` are `Set<NodeId>`, so
 * an id already discovered is never re-queued: a self-reference (`int a() => a();`) or a mutual cycle
 * (`a() => b(); b() => a();`) terminates on its own, with no separate cycle-detection state to keep in
 * sync — falling out exactly as harmlessly as it does for `referencedActions`, since DISCOVERING that a
 * recursive member is reachable is independent of whether its own helper can ever successfully EMIT (the
 * retry-based emission loop below is what actually, correctly, refuses a self- or mutually-dependent
 * chain, by never converging for it).
 */
function reachableMembers(
  nodes: readonly AnyUirNode[],
  reachableFns: readonly NodeId[],
  scope: EmitScope,
  getterOwnerOf: ReadonlyMap<NodeId, NodeId>,
  methodOwnerOf: ReadonlyMap<NodeId, NodeId>,
  memberById: ReadonlyMap<NodeId, Node>,
): { readonly getterIds: NodeId[]; readonly methodIds: NodeId[] } {
  const foundGetters = new Set<NodeId>();
  const foundMethods = new Set<NodeId>();
  for (const node of nodes as unknown as Node[]) {
    if (kindOf(node) === 'ui.Component') {
      directMemberRefs(node['render'], getterOwnerOf, methodOwnerOf, foundGetters, foundMethods);
    } else if (kindOf(node) === 'sig.Action') {
      directMemberRefs(node['body'], getterOwnerOf, methodOwnerOf, foundGetters, foundMethods);
    }
  }
  for (const id of reachableFns) {
    const fn = scope.node(id) as unknown as Node | undefined;
    if (fn === undefined) continue;
    directMemberRefs(fn['body'], getterOwnerOf, methodOwnerOf, foundGetters, foundMethods);
  }

  let queueGetters = [...foundGetters];
  let queueMethods = [...foundMethods];
  while (queueGetters.length > 0 || queueMethods.length > 0) {
    const discoveredGetters = new Set<NodeId>();
    const discoveredMethods = new Set<NodeId>();
    for (const id of [...queueGetters, ...queueMethods]) {
      const member = memberById.get(id);
      if (member === undefined) continue;
      directMemberRefs(member['body'], getterOwnerOf, methodOwnerOf, discoveredGetters, discoveredMethods);
    }
    const nextGetters: NodeId[] = [];
    const nextMethods: NodeId[] = [];
    for (const id of discoveredGetters) {
      if (!foundGetters.has(id)) {
        foundGetters.add(id);
        nextGetters.push(id);
      }
    }
    for (const id of discoveredMethods) {
      if (!foundMethods.has(id)) {
        foundMethods.add(id);
        nextMethods.push(id);
      }
    }
    queueGetters = nextGetters;
    queueMethods = nextMethods;
  }

  return { getterIds: [...foundGetters].sort(), methodIds: [...foundMethods].sort() };
}

/** A reachable function's own destination: which file it lives in, and the local name reserved there. */
export interface FunctionModuleInfo {
  /** The output file path (`ModuleBuilder.path`) — used to tell a same-file reference from a cross-file one. */
  readonly path: string;
  /** The `@/`-aliased specifier a *different* module imports it by. */
  readonly module: string;
  readonly name: string;
}

/** An emitted project-class type's own destination (ADR-0034) — identical shape to {@link FunctionModuleInfo}. */
export interface ClassModuleInfo {
  readonly path: string;
  readonly module: string;
  readonly name: string;
}

/**
 * Collects the `target` of every `TypeRef` on `params`' own `type` field (ADR-0034 §4) — a type edge,
 * never a value edge: this never recurses into a param's own default value or any other expression.
 */
function directClassTypeTargets(params: readonly Node[], found: Set<NodeId>): void {
  for (const param of params) {
    const type = param['type'] as Node | undefined;
    const target = type?.['target'];
    if (typeof target === 'string') found.add(target as NodeId);
  }
}

/**
 * Collects the `target` of every project-class-typed reference `classDecl` itself carries (M10-C) — its
 * own ELIGIBLE fields' types (mirroring the identical public/final/non-static/non-late filter the
 * interface-building loop applies, since an INELIGIBLE field's own type is never actually emitted, so
 * chasing it would discover a class this program never needs a type for), and its own REACHABLE
 * getters'/methods' own return AND parameter types. A class reached only through ANOTHER class's own
 * field or member signature — `Container.model: Model`, or `Container.buildModel(): Model` — needs a
 * real emitted type for exactly the same reason a component-param-reachable one already does; the
 * *type*-reachability walk `reachableClassTypes` performs was, before this ADR, only ONE level deep
 * (component/function params and return types), never chasing a discovered class's OWN member signatures
 * for FURTHER class references — the identical "declaration order is not a dependency order" problem
 * ADR-0040's own member-helper reachability already solved, now solved here too, for TYPES.
 */
function directClassTypeTargetsFromClass(
  classDecl: Node,
  getterOwnerOf: ReadonlyMap<NodeId, NodeId>,
  methodOwnerOf: ReadonlyMap<NodeId, NodeId>,
  reachableGetterIds: readonly NodeId[],
  reachableMethodIds: readonly NodeId[],
  found: Set<NodeId>,
): void {
  const classId = classDecl['id'];
  const fields = Array.isArray(classDecl['fields']) ? (classDecl['fields'] as Node[]) : [];
  for (const field of fields) {
    if (!isEligibleStructuralField(field)) continue;
    const type = field['type'] as Node | undefined;
    const target = type?.['target'];
    if (typeof target === 'string') found.add(target as NodeId);
  }
  const methods = Array.isArray(classDecl['methods']) ? (classDecl['methods'] as Node[]) : [];
  for (const method of methods) {
    const methodId = method['id'];
    if (typeof methodId !== 'string') continue;
    const isReachable =
      method['isGetter'] === true
        ? getterOwnerOf.get(methodId as NodeId) === classId && reachableGetterIds.includes(methodId as NodeId)
        : methodOwnerOf.get(methodId as NodeId) === classId && reachableMethodIds.includes(methodId as NodeId);
    if (!isReachable) continue;
    const returnType = method['returnType'] as Node | undefined;
    const returnTarget = returnType?.['target'];
    if (typeof returnTarget === 'string') found.add(returnTarget as NodeId);
    directClassTypeTargets(Array.isArray(method['params']) ? (method['params'] as Node[]) : [], found);
  }
}

/**
 * Every `logic.ClassDecl` a component's own parameters, or an already-reachable top-level function's own
 * parameters/return type, refer to (ADR-0034 §4) — a **type**-reachability walk, deliberately structurally
 * separate from {@link reachableFunctions}'s own **value**-reachability walk (ADR-0034 §5): a type
 * reference must never be treated as though it also reaches the referenced class's own fields, methods,
 * or constructor. No fixed point is needed here (unlike function reachability): a class excluded from the
 * emittable subset (§has a superclass, ADR-0034 §11) is never emitted, so there is nothing to gain by
 * chasing its own `superclass` reference further — this stops at one level, by construction.
 *
 * @param reachableFns - the ids `reachableFunctions` already found, so a function's own signature is only
 *   consulted once it is known this program actually reaches it.
 */
export function reachableClassTypes(
  nodes: readonly AnyUirNode[],
  scope: EmitScope,
  reachableFns: readonly NodeId[],
): NodeId[] {
  const found = new Set<NodeId>();
  for (const node of nodes as unknown as Node[]) {
    if (kindOf(node) === 'ui.Component') {
      directClassTypeTargets(Array.isArray(node['params']) ? (node['params'] as Node[]) : [], found);
    }
  }
  for (const id of reachableFns) {
    const fn = scope.node(id) as unknown as Node | undefined;
    if (fn === undefined) continue;
    directClassTypeTargets(Array.isArray(fn['params']) ? (fn['params'] as Node[]) : [], found);
    const returnType = fn['returnType'] as Node | undefined;
    const returnTarget = returnType?.['target'];
    if (typeof returnTarget === 'string') found.add(returnTarget as NodeId);
  }
  return [...found].sort();
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
): {
  readonly files: { readonly path: string; readonly contents: string }[];
  readonly functionModules: ReadonlyMap<NodeId, FunctionModuleInfo>;
  readonly classModules: ReadonlyMap<NodeId, ClassModuleInfo>;
  readonly getterHelpers: ReadonlyMap<NodeId, GetterHelperInfo>;
  readonly methodHelpers: ReadonlyMap<NodeId, MethodHelperInfo>;
  readonly projectClassMethodIds: ReadonlySet<NodeId>;
  readonly projectClassGetterIds: ReadonlySet<NodeId>;
} {
  const reachable = reachableFunctions(nodes, scope);
  const modules = new Map<string, PendingModule>();
  const functionModules = new Map<NodeId, FunctionModuleInfo>();
  const classModules = new Map<NodeId, ClassModuleInfo>();
  const getterHelpers = new Map<NodeId, GetterHelperInfo>();
  const methodHelpers = new Map<NodeId, MethodHelperInfo>();

  // Every explicit getter/method's own owning class, by the member's own embedded `logic.FunctionDecl`
  // id (ADR-0038/ADR-0039) — built once, from the full node list, since a `logic.FunctionDecl` embedded
  // on `ClassDecl.methods` is not itself an independently addressable top-level record `scope.node()` can
  // find (the identical structural fact ADR-0034/ADR-0036/ADR-0037 already established for a class's own
  // fields and constructors). `memberById` is the sibling lookup `reachableMembers`'s own fixed-point walk
  // needs to find an already-discovered member's own body (M10-B) — built in the identical pass, rather
  // than re-scanning `nodes` a second time.
  const getterOwnerOf = new Map<NodeId, NodeId>();
  const methodOwnerOf = new Map<NodeId, NodeId>();
  const memberById = new Map<NodeId, Node>();
  for (const node of nodes as unknown as Node[]) {
    if (kindOf(node) !== 'logic.ClassDecl') continue;
    const classId = node['id'];
    const methods = Array.isArray(node['methods']) ? (node['methods'] as Node[]) : [];
    for (const method of methods) {
      if (typeof method['id'] !== 'string' || typeof classId !== 'string') continue;
      memberById.set(method['id'] as NodeId, method);
      if (method['isGetter'] === true) {
        getterOwnerOf.set(method['id'] as NodeId, classId as NodeId);
      } else {
        methodOwnerOf.set(method['id'] as NodeId, classId as NodeId);
      }
    }
  }
  // Built from every member regardless of eligibility (an async getter, a method with a named/optional
  // parameter, and so on are scanned just the same), so a class with such a member is treated identically
  // to one without — but such a member can never appear in `reachableGetterIds`/`reachableMethodIds`
  // below, because the Dart extractor's own `_externalGetterTarget`/`_externalMethodTarget` never attach
  // a `target` to a reference to one in the first place.
  //
  // Computed HERE, locally, rather than read off `scope.projectClassGetterIds`/`.projectClassMethodIds`
  // (M10-B: a real bug found live) — those fields are only threaded onto the real, shared root scope
  // AFTER this whole function returns (`pipeline.ts`), for the identical forward-reference reason
  // `functionModules`/`classModules` already are, but a member helper's OWN body, emitted from WITHIN
  // this function, needs to resolve an internal composition reference (`doubled` inside `quadrupled`)
  // during THIS function's own execution — reading the not-yet-populated outer scope's version silently
  // produced `undefined` for every such lookup instead of a real symbol.
  const projectClassGetterIdsLocal: ReadonlySet<NodeId> = new Set(getterOwnerOf.keys());
  const projectClassMethodIdsLocal: ReadonlySet<NodeId> = new Set(methodOwnerOf.keys());
  const { getterIds: reachableGetterIds, methodIds: reachableMethodIds } = reachableMembers(
    nodes,
    reachable,
    scope,
    getterOwnerOf,
    methodOwnerOf,
    memberById,
  );

  // A getter's own owning class needs a real emitted type the moment the getter itself is reachable —
  // independent of whether that class is *also* reachable the way `reachableClassTypes` already looks for
  // (a component/function param or return type). A class reached only through `final model = Model(...)`
  // (M9-O/P's own construction, which resolves via `scope.node()` directly, never through this reachability
  // set — ADR-0036 §6) would otherwise never gain a type module here, and `self: Model` inside its own
  // getter helper would have nothing to reference. Unioned once, ahead of the class-emission loop below,
  // so a getter-reachable class is treated identically to a param/return-type-reachable one from this point
  // on — one emission path, not two.
  const classIdsNeedingTypes = new Set(reachableClassTypes(nodes, scope, reachable));
  for (const getterId of reachableGetterIds) {
    const ownerId = getterOwnerOf.get(getterId);
    if (ownerId !== undefined) classIdsNeedingTypes.add(ownerId);
  }
  for (const methodId of reachableMethodIds) {
    const ownerId = methodOwnerOf.get(methodId);
    if (ownerId !== undefined) classIdsNeedingTypes.add(ownerId);
  }

  // Transitive class-type reachability (M10-C): a class reached only through ANOTHER (already-known)
  // class's own field or reachable-member signature — `Container.model: Model`,
  // `Container.buildModel(): Model` — needs a real emitted type too, for the identical reason a
  // component-param-reachable one already does. Mirrors `reachableMembers`'s own discovery fixed point
  // (ADR-0040): seed with what is already known, then repeat — walk every *newly* found class's own
  // field/member signatures for further class references — until a pass adds nothing. A real, live bug
  // found while building this milestone: without it, `Container.model`'s own field type (and
  // `Container.buildModel`'s own return type) silently fell back to `unknown` whenever `Model` was
  // reachable ONLY through `Container`'s own signature — never through a component/function param
  // directly — failing `tsc --strict` with `Argument of type 'unknown' is not assignable to parameter of
  // type 'Model'` at every call site that passed the result on to a method helper.
  let classTypeQueue = [...classIdsNeedingTypes];
  while (classTypeQueue.length > 0) {
    const discovered = new Set<NodeId>();
    for (const id of classTypeQueue) {
      const classDecl = scope.node(id) as unknown as Node | undefined;
      if (classDecl === undefined || kindOf(classDecl) !== 'logic.ClassDecl') continue;
      directClassTypeTargetsFromClass(classDecl, getterOwnerOf, methodOwnerOf, reachableGetterIds, reachableMethodIds, discovered);
    }
    const next: NodeId[] = [];
    for (const id of discovered) {
      if (!classIdsNeedingTypes.has(id)) {
        classIdsNeedingTypes.add(id);
        next.push(id);
      }
    }
    classTypeQueue = next;
  }

  const pendingModuleFor = (path: string, specifier: string): PendingModule => {
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
    return pending;
  };

  // Type declarations first (ADR-0034), before any function attempt below — a function's own signature
  // may itself reference one of these classes (§ reachableClassTypes already includes an already-
  // reachable function's own params/return type), and emitting a class is unconditional (an empty
  // interface cannot itself fail to lower the way a function body can), so there is no ordering hazard
  // in building this registry first.
  //
  // Two passes, not one (M10-C): PASS 1 reserves every eligible class's own name/module — populating
  // `classModules` COMPLETELY — before PASS 2 builds any interface/helper TEXT that might reference
  // ANOTHER class via `classOf`. `[...classIdsNeedingTypes].sort()` is a canonical order (by NodeId), not
  // a dependency order, so a single pass would leave `Container.model: Model`'s own `classOf(ModelId)`
  // unresolved (silently falling back to `unknown`) whenever `Container`'s own id happened to sort before
  // `Model`'s — a real, live bug found while building this milestone. Interface/helper emission is
  // unconditional (an empty interface never fails to lower the way a function body can), so a name-first,
  // body-second split is sufficient — no retry loop is needed here, unlike the member-helper one below,
  // which can genuinely fail and be retried.
  interface EligibleClass {
    readonly id: NodeId;
    readonly classDecl: Node;
    readonly name: string;
    readonly spanFile: string;
    readonly localName: string;
    readonly pending: PendingModule;
    readonly specifier: string;
  }
  const eligibleClasses: EligibleClass[] = [];
  for (const id of [...classIdsNeedingTypes].sort()) {
    const classDecl = scope.node(id) as unknown as Node | undefined;
    if (classDecl === undefined) continue;
    const name = typeof classDecl['name'] === 'string' ? classDecl['name'] : undefined;
    const span = classDecl['span'] as Node | undefined;
    const spanFile = typeof span?.['file'] === 'string' ? span['file'] : undefined;
    if (name === undefined || spanFile === undefined) continue;

    // Private (ADR-0034 §9): this generator's own per-Dart-file module convention would export a
    // leading-underscore class as a *public* named export of its own generated module — widening
    // Dart's library-scoped privacy, not preserving it.
    if (name.startsWith('_')) {
      scope.report(
        GeneratorDiagnosticCode.UnsupportedCapability,
        'error',
        `\`${name}\` is a private class. FlutterBridge does not yet give a private Dart class a generated ` +
          `TypeScript type — this generator's own per-file module convention would export it as a public ` +
          `name, which would widen Dart's own library-scoped privacy rather than preserve it.`,
        id,
      );
      continue;
    }
    // Inherited (ADR-0034 §11): an empty `interface Child {}` would misrepresent a real Dart subtype
    // relationship this generator has no member model to encode faithfully.
    if (classDecl['superclass'] !== undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnsupportedCapability,
        'error',
        `\`${name}\` extends another class. FlutterBridge does not yet lower a project-defined class's own ` +
          `inheritance relationship into its generated TypeScript type.`,
        id,
      );
      continue;
    }

    const { path, specifier } = modulePathFor(spanFile);
    const pending = pendingModuleFor(path, specifier);
    const localName = pending.builder.declare(name, id);
    classModules.set(id, { path: pending.builder.path, module: specifier, name: localName });
    eligibleClasses.push({ id, classDecl, name, spanFile, localName, pending, specifier });
  }

  interface MemberAttempt {
    readonly method: Node;
    readonly className: string;
    readonly spanFile: string;
    readonly classId: NodeId;
    readonly localName: string;
    readonly pending: PendingModule;
    readonly classOf: (target: NodeId) => string | undefined;
  }
  const memberAttempts: MemberAttempt[] = [];

  for (const { id, classDecl, name, spanFile, localName, pending } of eligibleClasses) {
    // Bounded, immutable instance-field shape (ADR-0035): a field is eligible only when public
    // (`!name.startsWith('_')` — Dart's own privacy syntax, unambiguous for a simple identifier, the
    // identical convention already used for a private *class* name above), `isFinal`, and neither
    // `isStatic` nor `isLate` (`late`'s own runtime initialization/error semantics a side-effect-free
    // shape read must not misrepresent). The identical eligibility facts the Dart extractor's own
    // `_externalFieldTarget` (ADR-0035 §3) checks before ever attaching a `PropertyAccess.target` — the
    // one truth §27 of the governing brief requires, not a second, independently-drifting guess: a field
    // appears here if and only if a read of it can also resolve to a target there.
    const classOf = (target: NodeId): string | undefined => {
      const info = classModules.get(target);
      if (info === undefined) return undefined;
      return info.path === pending.builder.path ? info.name : pending.builder.use(info.module, info.name, { typeOnly: true });
    };
    const fields = Array.isArray(classDecl['fields']) ? (classDecl['fields'] as Node[]) : [];
    const fieldLines: string[] = [];
    for (const fieldDecl of fields) {
      if (!isEligibleStructuralField(fieldDecl)) continue;
      const fieldName = fieldDecl['name'] as string;
      // `useRuntimeType`, not `useRuntime`: a field's own type is a pure type position — an interface
      // body never needs a runtime value import the way a function body's own executable use of
      // `Duration` might.
      const fieldType = typeTextOf(fieldDecl['type'] as Node | undefined, (rt) => useRuntimeType(pending.builder, rt), classOf);
      fieldLines.push(`  readonly ${identifierOf(fieldName)}: ${fieldType};`);
    }

    pending.lines.push(
      `/** \`${name}\`, from ${spanFile}. Type-only — FlutterBridge does not yet construct this class, and reads only its bounded, immutable field shape (ADR-0035). */`,
      fieldLines.length === 0 ? `export interface ${localName} {}` : `export interface ${localName} {`,
      ...(fieldLines.length === 0 ? [] : [...fieldLines, '}']),
      '',
    );

    // Collected, not yet attempted (M10-D): a method's own body may reference a DIFFERENT class's own
    // getter/method helper (return-value chaining, e.g. `model.next().multiply(3)`) — so the retry pool
    // below must span every eligible class, not just this one, mirroring `reachableFunctions`'s own
    // sibling top-level-function loop exactly ("Attempts, not a single ordered pass"), now extended one
    // level further: from "a member may depend on another member of the SAME class" (ADR-0040) to "a
    // member may depend on a member of ANY eligible class." A real, live-probed bug found while building
    // this milestone: attempting each class's own members to a FIXED POINT before ever moving to the next
    // class (the pre-M10-D structure) meant a class whose own id happened to sort BEFORE the class it
    // depended on could never succeed — its own per-class retry loop exhausted itself with the dependency
    // still unresolved, and never got a second chance once the later class's own helpers existed.
    const methods = Array.isArray(classDecl['methods']) ? (classDecl['methods'] as Node[]) : [];
    for (const method of methods) {
      const methodId = method['id'];
      if (typeof methodId !== 'string') continue;
      const isReachable =
        method['isGetter'] === true
          ? reachableGetterIds.includes(methodId as NodeId)
          : reachableMethodIds.includes(methodId as NodeId);
      if (!isReachable) continue;
      memberAttempts.push({ method, className: name, spanFile, classId: id, localName, pending, classOf });
    }
  }

  // Bounded getter/method execution (ADR-0038/ADR-0039), composable across the SAME class (M10-B) and now
  // across DIFFERENT classes too (M10-D): every eligible class's own getters and methods share ONE global
  // reachable-member retry pool, attempted across passes until a full pass makes no progress. This is
  // what lets `int quadrupled() => doubled * 2;` succeed regardless of whether `doubled` is declared
  // before or after it WITHIN one class (M10-B), and what now lets `model.next().multiply(3)` succeed
  // regardless of which of the two classes' own ids happens to sort first (M10-D) — and what correctly,
  // structurally REFUSES a self-, mutually-, or cross-class-recursive chain: no member in the cycle can
  // ever be first (each depends on another member of the cycle already being present), so none of them
  // ever converges, and all remain absent from `getterHelpers`/`methodHelpers` — the existing "target set
  // but no helper -> BRG3013" refusal handles it, with no separate recursion check needed, proven directly
  // (a real, two-class mutual cycle via return-value chaining refuses cleanly and terminates quickly,
  // never hangs).
  const remainingMembers = new Set(memberAttempts.map((m) => m.method['id'] as NodeId));
  let memberProgressed = true;
  while (memberProgressed) {
    memberProgressed = false;
    for (const attempt of memberAttempts) {
      const { method, className: name, spanFile, classId: id, localName, pending, classOf } = attempt;
      const methodId = method['id'] as NodeId;
      if (!remainingMembers.has(methodId)) continue;
      const isGetter = method['isGetter'] === true;
      const body = method['body'];
      if (method['isAsync'] === true || !Array.isArray(body)) {
        remainingMembers.delete(methodId);
        continue;
      }

      const memberName = typeof method['name'] === 'string' ? method['name'] : String(methodId);
      const helperName = pending.builder.declare(`${name}_${memberName}`, methodId);
      const params = isGetter ? [] : Array.isArray(method['params']) ? (method['params'] as Node[]) : [];
      const paramNames = new Map<string, string>();
      for (const param of params) {
        const paramName = typeof param['name'] === 'string' ? param['name'] : undefined;
        if (paramName !== undefined) paramNames.set(paramName, identifierOf(paramName));
      }

      // Staged on a throwaway builder for this one attempt — an import a failed attempt asked for must
      // never leak into a file another, successfully-lowered member shares. Only replayed onto the
      // real, shared `pending.builder` once the attempt succeeds (mirroring `reachableFunctions`'s own
      // sibling loop below).
      const scratch = new ModuleBuilder(pending.builder.path);
      let hadError = false;
      const locals = localBindingsIn(body);
      const helperScope: EmitScope = {
        ...scope,
        module: scratch,
        classModules,
        getterHelpers,
        methodHelpers,
        projectClassGetterIds: projectClassGetterIdsLocal,
        projectClassMethodIds: projectClassMethodIdsLocal,
        memberSelf: { ownerClassId: id, selfName: 'self' },
        // No closure over any outer scope (a member helper is a plain, standalone module-level
        // function): a name that is not one of THIS member's own parameters must fail to resolve here,
        // never accidentally fall through to some unrelated component prop or action parameter that
        // happens to share the name.
        paramInScope: (paramName) => paramNames.get(paramName),
        localName: (localId) => locals.get(localId) ?? scope.localName(localId),
        report: (code, severity, message, nodeId) => {
          if (severity === 'error') hadError = true;
          else scope.report(code, severity, message, nodeId);
        },
      };
      const returnType = typeTextOf(method['returnType'] as Node | undefined, (rt) => useRuntime(scratch, rt), classOf);
      const paramList = paramListOf(params, identifierOf, (rt) => useRuntime(scratch, rt), classOf);
      const signature = paramList.length === 0 ? `self: ${localName}` : `self: ${localName}, ${paramList}`;
      const lines = emitStatements(body, helperScope);

      if (hadError) continue; // try again next pass — a dependency this pass hadn't resolved yet might resolve then

      for (const request of scratch.usedImports()) pending.builder.use(request.from, request.name, { typeOnly: request.typeOnly });
      const capabilityLabel = isGetter
        ? 'bounded, structural getter execution (ADR-0038)'
        : 'bounded, structural instance method execution (ADR-0039)';
      pending.lines.push(
        `/** \`${name}.${memberName}\`, from ${spanFile}. A ${capabilityLabel} — never a prototype ${isGetter ? 'getter' : 'method'}; there is no runtime \`${name}\` class. */`,
        `export function ${helperName}(${signature}): ${returnType} {`,
        ...lines.map((line: string) => `  ${line}`),
        '}',
        '',
      );
      const helperInfo = { path: pending.builder.path, module: pending.specifier, name: helperName };
      if (isGetter) getterHelpers.set(methodId, helperInfo);
      else methodHelpers.set(methodId, helperInfo);
      remainingMembers.delete(methodId);
      memberProgressed = true;
    }
  }

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
      const pending = pendingModuleFor(path, specifier);

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
      // An explicit return type, but only where TypeScript cannot otherwise prove one: a body that is
      // exactly one exhaustive `logic.Switch` (M8-Y) — the shape a `return switch (x) {...}` desugars
      // to — has no `default`, because Dart's own compiler already proved every case is covered and a
      // synthesized default would be a JS-only execution path valid Dart does not have. TypeScript
      // cannot see that proof, so without an annotation it infers the "falls off the end" case as an
      // implicit `undefined`, which corrupts every caller's own type (a `Text` prop typed `string`
      // stops accepting the call). An explicit return type makes that same "falls off the end" shape a
      // real compile error instead — the exhaustiveness proof this generator relies on, restated where
      // `tsc` can check it, not a weaker one. Every other function keeps inferring its own return type,
      // exactly as before M8-Y — the annotation is added only where its absence would otherwise be
      // unsound.
      const isSoleExhaustiveSwitch =
        body.length === 1 &&
        body[0]?.['kind'] === 'logic.Switch' &&
        body[0]?.['defaultCase'] === undefined &&
        body[0]?.['default'] === undefined;
      // A project-class-typed parameter/return (ADR-0034): a same-file class needs no import (the two
      // declarations share one `ModuleBuilder`); a cross-file one goes through `scratch.use`, exactly
      // like `functionModules`'s own same-file/cross-file split (`expression.ts`'s `logic.Ref` case).
      const classOf = (target: NodeId): string | undefined => {
        const info = classModules.get(target);
        if (info === undefined) return undefined;
        return info.path === scratch.path ? info.name : scratch.use(info.module, info.name, { typeOnly: true });
      };
      const returnType = isSoleExhaustiveSwitch
        ? `: ${typeTextOf(fn['returnType'] as Node | undefined, (name) => useRuntime(scratch, name), classOf)}`
        : '';
      const signature = `(${paramListOf(params, identifierOf, (name) => useRuntime(scratch, name), classOf)})${returnType}`;
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

  return {
    files,
    functionModules,
    classModules,
    getterHelpers,
    methodHelpers,
    projectClassMethodIds: projectClassMethodIdsLocal,
    projectClassGetterIds: projectClassGetterIdsLocal,
  };
}
