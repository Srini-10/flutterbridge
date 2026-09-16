// The store emitter — `app.Store` → `defineStore`.
//
// ## ADR-19's lowering table, made real
//
// > `app.Store` → `defineStore`, `sig.Signal` → `signal(<lowered initial>)`, `sig.Derived` →
// > `derived(() => <lowered body>)`, `sig.Action` → `action((p) => <lowered body>)`.
//
// That is this file. The interesting part is what it is *not*: there is no `new CartStore()` anywhere in the
// output, and there cannot be.
//
// ## Why `defineStore` and not an instance
//
// ADR-15, on evidence from a real application:
//
// > `final CartStore cartStore = CartStore();` — an idiom so ordinary in Flutter that it is unremarkable. In
// > Flutter that singleton is **one user**. In a Next.js server process, **a module is shared across every
// > request**. If a component that touches such a store is server-rendered, **one user can be served another
// > user's cart.**
//
// The emitted module holds a `defineStore(...)` — a definition, which owns no state — and the provider makes
// the instance, once per client root / per request. INV-19 is therefore not something this emitter has to
// remember to obey: the shape it emits has nothing to leak. ADR-19 §Consequences calls this out as the point
// of `defineStore` existing at all.

import type { NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { emitExpression, localBindingsIn, type EmitScope } from './expression.js';
import { emitStatements } from './statement.js';
import { identifierOf, type ModuleBuilder } from './module.js';
import { paramListOf, refuseNamedParams } from './types.js';

const RUNTIME = '@bridge/runtime-react';

type Node = Record<string, unknown>;

const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/** What emitting a store established: its own exported name, and each member's, by id (M7-F). */
export interface EmittedStore {
  /** The exported `defineStore` identifier. */
  readonly name: string;
  /** Signal id → its property on the store's returned state. */
  readonly signals: ReadonlyMap<NodeId, string>;
  /** Derived-value id → its property on the store's returned state. */
  readonly derived: ReadonlyMap<NodeId, string>;
  /** Action id → its property on the store's returned state. */
  readonly actions: ReadonlyMap<NodeId, string>;
}

/**
 * Emits an `app.Store` into `module`.
 *
 * @param store - the `app.Store` node.
 * @param module - the file to write into.
 * @param scope - resolution and reporting.
 * @returns the exported definition's name, and every member's property name — the one place these names
 *   are decided, so a consumer outside the store (M7-F) never recomputes them and risks drifting.
 */
export function emitStore(store: Node, module: ModuleBuilder, scope: EmitScope): EmittedStore {
  const storeName = String(store['name'] ?? 'Store');
  const exported = module.declare(`${lowerFirst(identifierOf(storeName))}Store`, idOf(store) ?? '');
  const defineStore = module.use(RUNTIME, 'defineStore');

  // Ids are resolved to local names *before* any body is lowered, so an action that writes a signal declared
  // after it still finds the name. A single pass would emit `undefined` for every forward reference.
  const signals = new Map<NodeId, string>();
  for (const id of idsOf(store['signals'])) {
    const node = scope.node(id) as unknown as Node | undefined;
    if (node === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnresolvedReference,
        'error',
        `store \`${storeName}\` names signal \`${id}\`, which is not in the program`,
        idOf(store),
      );
      continue;
    }
    signals.set(id, identifierOf(nameOf(node, id, 'value', scope)));
  }

  const derived = new Map<NodeId, string>();
  for (const id of idsOf(store['derived'])) {
    const node = scope.node(id) as unknown as Node | undefined;
    if (node !== undefined) derived.set(id, identifierOf(nameOf(node, id, 'computed', scope)));
  }

  const actions = new Map<NodeId, string>();
  for (const id of idsOf(store['actions'])) {
    const node = scope.node(id) as unknown as Node | undefined;
    if (node !== undefined) actions.set(id, identifierOf(nameOf(node, id, 'run', scope)));
  }

  const inner = storeScope(scope, signals, derived, actions);

  module.line(`/** \`${storeName}\`, from ${spanOf(store)}. */`);
  module.line(`export const ${exported} = ${defineStore}('${storeName}', ({ signal, derived, action }) => {`);
  module.block(() => {
    for (const [id, local] of signals) {
      const node = scope.node(id) as unknown as Node;
      const initial = node['initial'] === undefined ? 'undefined' : emitExpression(node['initial'] as Node, inner);
      module.line(`const ${local} = signal(${initial});`);
    }
    for (const [id, local] of derived) {
      const node = scope.node(id) as unknown as Node;
      module.line(`const ${local} = derived(() => ${emitExpression(node['body'] as Node, inner)}, '${local}');`);
    }
    for (const [id, local] of actions) {
      const node = scope.node(id) as unknown as Node;
      const isAsync = node['isAsync'] === true;
      const params = Array.isArray(node['params']) ? (node['params'] as Node[]) : [];
      refuseNamedParams(params, id, 'action', inner.report);

      // The body is lowered in a scope that knows the parameters, so a `logic.Ref` to `id` resolves to `id`
      // rather than to nothing (Spec v2.5 §A18). The kit's facade already takes them —
      // `action<A extends readonly unknown[], R>(body: (...args: A) => R)` — because an action is a function
      // and was typed as one; nothing in the runtime changed for this.
      //
      // `localBindingsIn(node['body'])` (M11-C) — a local this action's own body declares (ADR-28), the
      // identical mechanism `functions.ts`'s own member-helper loop and `component.ts`'s own action-body
      // emission already use (`localBindingsIn`, keyed by the declaration's own stable `NodeId`, never by
      // name). Its own absence here was a real, live-probed, pre-existing gap: extraction already resolves
      // a `target` for a local declared and later read within a store action's own body (confirmed
      // unchanged before and after normalization), but this scope never consulted it, so EVERY such read
      // refused honestly as `BRG3006` — never silently wrong, but a genuine missing capability all the
      // same, unrelated to mutability (a `var`/reassigned local hits the identical, unmodified target-
      // resolution mechanism) or to nested block scopes (`{ ... }` inside an action body, also proven
      // correctly targeted at extraction already).
      const locals = localBindingsIn(node['body']);
      const body = emitStatements(node['body'], actionScope(inner, params, locals));
      // The default value's own emission uses `inner` — the scope ENCLOSING the action, never
      // `actionScope(inner, params)` — mirroring the identical scoping rule the Dart extractor's own
      // `_params` already applies (M10-E, ADR-0043 §5): a default is a constant expression and cannot
      // see the parameters it sits among.
      const signature = `(${paramListOf(
        params,
        identifierOf,
        undefined,
        undefined,
        (param) => emitExpression(param['defaultValue'] as Node, inner),
      )})`;
      if (body.length === 0) {
        module.line(`const ${local} = action(${isAsync ? 'async ' : ''}${signature} => {}, '${local}');`);
        continue;
      }
      module.line(`const ${local} = action(${isAsync ? 'async ' : ''}${signature} => {`);
      module.block(() => module.lineAll(body));
      module.line(`}, '${local}');`);
    }
    const returned = [...signals.values(), ...derived.values(), ...actions.values()];
    module.line(`return { ${returned.join(', ')} };`);
  });
  module.line('});');
  module.line();
  return { name: exported, signals, derived, actions };
}

/**
 * A scope that resolves an action's parameters, by name (§A18.3), and its own locals, by declaration
 * identity (M11-C).
 *
 * Layered over the store's scope rather than merged into it, so a parameter is visible only inside the action
 * that declares it — which is what "the action's scope" means, and what stops one action's `id` resolving
 * inside another's body. `locals` is keyed by the declaration's own `NodeId` (`localBindingsIn`, never by
 * name), the identical mechanism `component.ts`'s own sibling `actionScope` already uses for a component's
 * own action bodies — reused here, not re-derived, so a local declared in ONE action can never resolve
 * inside a DIFFERENT action's own body (`localBindingsIn` is computed per-action, at the call site, and
 * this scope is never shared across actions).
 */
function actionScope(parent: EmitScope, params: readonly Node[], locals: ReadonlyMap<NodeId, string> = new Map()): EmitScope {
  const names = new Map<string, string>();
  for (const param of params) {
    const name = String(param['name'] ?? '');
    if (name !== '') names.set(name, identifierOf(name));
  }
  return {
    ...parent,
    paramInScope: (name) => names.get(name) ?? parent.paramInScope(name),
    // A local's own binding first (ADR-28) — it can never collide with anything `parent.localName` might
    // otherwise resolve (the two id spaces are disjoint by construction, a real declaration-tier `NodeId`
    // vs. whatever the enclosing scope already knew), so checking `locals` first is always safe.
    localName: (id) => locals.get(id) ?? parent.localName(id),
  };
}


/** A scope that resolves the store's own members. */
function storeScope(
  parent: EmitScope,
  signals: ReadonlyMap<NodeId, string>,
  derived: ReadonlyMap<NodeId, string>,
  actions: ReadonlyMap<NodeId, string>,
): EmitScope {
  return {
    module: parent.module,
    report: parent.report.bind(parent),
    // Program-wide, so a child scope forwards it unchanged rather than rebuilding it per component.
    themeRoles: parent.themeRoles,
    storeMembers: parent.storeMembers,
    storeExports: parent.storeExports,
    componentModules: parent.componentModules,
    componentModulesById: parent.componentModulesById,
    functionModules: parent.functionModules,
    classModules: parent.classModules,
    getterHelpers: parent.getterHelpers,
    methodHelpers: parent.methodHelpers,
    projectClassMethodIds: parent.projectClassMethodIds,
    projectClassGetterIds: parent.projectClassGetterIds,
    storeAccessRead: (id) => parent.storeAccessRead(id),
    node: parent.node.bind(parent),
    isStoreOwned: (id) => parent.isStoreOwned(id),
    signalRead: (id) => {
      const signal = signals.get(id);
      if (signal !== undefined) return `${signal}.get()`;
      const computed = derived.get(id);
      if (computed !== undefined) return `${computed}.get()`;
      return parent.signalRead(id);
    },
    // A store module is not a React component: nothing here is a hook, and `.get()` inside a store action
    // or a `derived` body is exactly right — `derived` tracks its reads through the graph rather than
    // through React. So reads and the object identifier coincide, unlike in a component.
    signalLocal: (id) => signals.get(id) ?? derived.get(id) ?? parent.signalLocal(id),
    localName: (id) => actions.get(id) ?? parent.localName(id),
    declaredName: (id) => parent.declaredName(id),
    declaresClass: (name) => parent.declaresClass(name),
    paramInScope: (name) => parent.paramInScope(name),
  };
}

function idsOf(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * A member's local name, in descending order of how much the program actually said.
 *
 * 1. The **anchor**, when there is one: the override key, and the name a human already addresses it by.
 * 2. The name on the **references** to it. `sig.Signal` carries no `name` — it is symbol-addressed (ADR-17)
 *    and the symbol never reaches the document — but every `logic.Ref` that reads it carries the name the
 *    author wrote. The declaration is anonymous; the program is not.
 * 3. The **id**, when nothing named it. Unique and deterministic, and honestly ugly.
 */
function nameOf(node: Node, id: string, fallback: string, scope: EmitScope): string {
  const anchor = node['anchor'];
  if (typeof anchor === 'string') {
    const tail = anchor.split(/[#/.]/).filter(Boolean).pop();
    if (tail !== undefined && tail !== '') return tail;
  }
  const referenced = scope.declaredName(id);
  if (referenced !== undefined && referenced !== '') return referenced;
  return `${fallback}_${id.slice(0, 8)}`;
}

function spanOf(node: Node): string {
  const span = node['span'] as Node | undefined;
  if (span === undefined) return 'an unknown location';
  return `${String(span['file'])}:${String(span['line'])}`;
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1);
}
