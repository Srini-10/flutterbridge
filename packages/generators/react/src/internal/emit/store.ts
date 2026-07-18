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
import { emitExpression, type EmitScope } from './expression.js';
import { emitStatements } from './statement.js';
import { identifierOf, type ModuleBuilder } from './module.js';
import { paramListOf } from './types.js';

const RUNTIME = '@bridge/runtime-react';

type Node = Record<string, unknown>;

const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/**
 * Emits an `app.Store` into `module`.
 *
 * @param store - the `app.Store` node.
 * @param module - the file to write into.
 * @param scope - resolution and reporting.
 * @returns the exported definition's name.
 */
export function emitStore(store: Node, module: ModuleBuilder, scope: EmitScope): string {
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
      refuseNamedParams(params, id, inner);

      // The body is lowered in a scope that knows the parameters, so a `logic.Ref` to `id` resolves to `id`
      // rather than to nothing (Spec v2.5 §A18). The kit's facade already takes them —
      // `action<A extends readonly unknown[], R>(body: (...args: A) => R)` — because an action is a function
      // and was typed as one; nothing in the runtime changed for this.
      const body = emitStatements(node['body'], actionScope(inner, params));
      const signature = `(${paramListOf(params, identifierOf)})`;
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
  return exported;
}

/**
 * A scope that resolves an action's parameters, by name (§A18.3).
 *
 * Layered over the store's scope rather than merged into it, so a parameter is visible only inside the action
 * that declares it — which is what "the action's scope" means, and what stops one action's `id` resolving
 * inside another's body.
 */
function actionScope(parent: EmitScope, params: readonly Node[]): EmitScope {
  const names = new Map<string, string>();
  for (const param of params) {
    const name = String(param['name'] ?? '');
    if (name !== '') names.set(name, identifierOf(name));
  }
  return { ...parent, paramInScope: (name) => names.get(name) ?? parent.paramInScope(name) };
}

/**
 * Refuses Dart named parameters.
 *
 * `toggle({required int id})` is called `toggle(id: 1)`. TypeScript has no named arguments: the honest
 * lowering is an options object, and which shape that object has is a decision — one that changes every call
 * site and that no evidence in the corpus yet supports. Emitting them as positional would compile and would
 * silently reorder arguments at any call site that passed them out of declaration order.
 */
function refuseNamedParams(params: readonly Node[], id: string, scope: EmitScope): void {
  const named = params.filter((param) => param['named'] === true).map((param) => String(param['name']));
  if (named.length === 0) return;
  scope.report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `this action takes the named parameter(s) ${named.map((n) => `\`${n}\``).join(', ')}. TypeScript has ` +
      `no named arguments, and lowering them to positional ones would silently reorder any call that passed ` +
      `them out of declaration order.`,
    id,
  );
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
    node: parent.node.bind(parent),
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
