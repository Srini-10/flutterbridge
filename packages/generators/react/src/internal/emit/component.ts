// The component emitter — `ui.Component` → a React component, and `ui.*` → TSX.
//
// ## The shape it emits
//
// A `ui.Component` becomes a function component. Its `localSignals` become `signal(...)` calls *inside* the
// function body — never at module scope, which is INV-19 and ADR-15's whole subject: a module is shared
// across every request in a Next.js server process, so a signal on one is one user's state on another user's
// screen. Inside the function, each render... would allocate a new signal. So component-scoped signals are
// held through `useState`'s initialiser, which runs once per mount. That is the single place this emitter
// makes a decision React forces rather than one Flutter implies.
//
// ## Bindings
//
// `bind.*` is the reactivity edge, and each kind lowers differently:
//
// - `bind.Const` — a literal. Emitted inline.
// - `bind.Signal` — *"a read of a signal. This is an edge in the reactivity graph."* Becomes `useSignal(sig)`,
//   which subscribes the component and re-renders it when — and only when — the value actually changes.
// - `bind.Expr` — an arbitrary expression. Lowered by the expression emitter.
// - `bind.Param` — a component parameter. Becomes a prop read.
//
// Getting `bind.Signal` wrong is the defect the schema warns about in `sig.Action`: *"generated React state
// that never updates."* Emitting the signal object where its value belongs renders `[object Object]`; emitting
// `.peek()` renders the right value once and never again.

import type { NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { emitExpression, stringLiteral, type EmitScope } from './expression.js';
import { emitStatements } from './statement.js';
import { identifierOf, type ModuleBuilder } from './module.js';
import { typeTextOf } from './types.js';
import { useRuntime } from './runtime.js';
import { missingCapabilityOf, OWNER_LABEL } from './unsupported.js';
import {
  UNSUPPORTED_PARAMETERS,
  mappingOf,
  supportedWidgetNames,
  type WidgetMapping,
} from './widgets.js';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

function asArray(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

/** A `ui.Component` and the local names its emission established. */
export interface ComponentScope extends EmitScope {
  /** The component's own signals: node id → local name. */
  readonly signals: ReadonlyMap<NodeId, string>;
}

/**
 * Emits a `ui.Component` into `module`.
 *
 * @param component - the `ui.Component` node.
 * @param module - the file to write into.
 * @param scope - resolution and reporting, from the pipeline.
 * @returns the exported component name.
 */
export function emitComponent(component: Node, module: ModuleBuilder, scope: EmitScope): string {
  const name = module.declare(String(component['name'] ?? 'Component'), idOf(component) ?? '');
  const params = asArray(component['params']);

  const propsType = params.length === 0 ? '' : `props: ${name}Props`;
  if (params.length > 0) {
    module.line(`/** Props for {@link ${name}}. */`);
    module.line(`export interface ${name}Props {`);
    module.block(() => {
      for (const param of params) {
        const paramName = identifierOf(String(param['name'] ?? '_'));
        const optional = param['required'] === true ? '' : '?';
        module.line(`readonly ${paramName}${optional}: ${typeTextOf(param['type'] as Node | undefined)};`);
      }
    });
    module.line('}');
    module.line();
  }

  module.line(`/** \`${component['name']}\`, from ${spanOf(component)}. */`);
  module.line(`export function ${name}(${propsType}) {`);
  module.block(() => {
    // The router, before anything that could use it — an action body is emitted by
    // `declareLocalActions` below, and a navigation inside one reads this name.
    const routerLocal = declareRouter(component, module);
    const outer: EmitScope = routerLocal === undefined ? scope : { ...scope, routerLocal };
    const signals = declareLocalSignals(component, module, outer);
    // Actions the tree calls, declared before the tree that calls them. See `declareLocalActions`.
    const actions = declareLocalActions(component, module, outer, signals, params);
    const inner = childScope(outer, signals, params, actions);
    const tree = component['render'];
    if (tree === undefined) {
      module.line('return null;');
      return;
    }
    const body = emitUiNode(tree as Node, module, inner, 0);
    module.line(`return ${body};`);
  });
  module.line('}');
  module.line();
  return name;
}

/**
 * Declares the component's router, if its tree performs a navigation.
 *
 * ADR-0025 D2 makes a navigation a `logic.Navigate` statement, and lowering one needs `useRouter()`.
 * That is a hook, and the navigation itself is almost always inside a callback — `onPressed: () =>
 * Navigator.pop(context)` is how the corpus writes it — so calling the hook where the navigation is
 * would be a rules-of-hooks violation that React throws on at runtime rather than a compile error.
 *
 * Hoisted for the same reason `useSignal` is, and the reason is worth repeating rather than
 * cross-referencing: a hook inside a conditional or a callback runs a different number of times per
 * render than React's hook order allows.
 *
 * Declared **only when needed**, so a component that never navigates emits no `useRouter` and imports
 * nothing for one — the emitted file says what the component does.
 *
 * @param component - the `ui.Component` node.
 * @param module - the file to write into.
 * @returns the identifier holding the router, or undefined when the component does not navigate.
 */
function declareRouter(component: Node, module: ModuleBuilder): string | undefined {
  if (!containsNavigate(component)) return undefined;
  const useRouter = useRuntime(module, 'useRouter');
  const local = 'router';
  module.line(`const ${local} = ${useRouter}();`);
  module.line();
  return local;
}

/** Whether anything in `value` is a `logic.Navigate`. */
function containsNavigate(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsNavigate);
  if (value === null || typeof value !== 'object') return false;
  const node = value as Node;
  if (node['kind'] === 'logic.Navigate') return true;
  return Object.values(node).some(containsNavigate);
}

/**
 * Emits the component's own signals, and **subscribes the component to them**.
 *
 * Through `useState`'s initialiser, which React runs once per mount. A bare `signal(0)` in the function body
 * would allocate a fresh signal on every render, so every write would be lost and the component would never
 * update — and a `signal(0)` at module scope would be INV-19, shared across requests. Neither is available;
 * this is the one shape that is both per-instance and stable.
 *
 * ## The subscription, and the defect that was here
 *
 * Each signal also gets `const <name>$ = useSignal(<name>);`, and **render-position reads use `<name>$`**.
 * Without it the counter example did not count: `_count.set(…)` ran, the signal changed, and React never
 * re-rendered because nothing had subscribed. The page sat at "You have pushed the button 0 times." through
 * any number of clicks, with **no console error and no failed request** — every upstream stage green.
 *
 * Only a bare `bind.Signal` used to subscribe, by emitting `useSignal(…)` inline where it was read. A signal
 * read from inside an *expression* — `'…$_count times.'`, `_count + 1`, `if (_count > 3)` — reaches the
 * expression emitter as a `logic.Ref` and became `_count.get()`, which reads the value without subscribing
 * to it. Interpolation is the single most common way a Flutter widget shows state, so the common case was
 * the broken one.
 *
 * Two reasons the subscription is hoisted here rather than fixed at each read site:
 *
 *   * **Rules of hooks.** `useSignal` inline in JSX sits inside whatever conditional surrounds it, and a
 *     `ui.Cond` branch or a `ui.List` template is exactly that. A hook called conditionally is a React
 *     defect that shows up as a corrupted hook order on a later render — far from its cause. At the top of
 *     the component it is unconditional by construction.
 *   * **One subscription per signal.** Reading the same signal in three places should not mean three
 *     `useSyncExternalStore` calls.
 *
 * Every component-local signal is subscribed, not only those the render reads. A signal that extraction
 * lifted onto a component is state that component's UI depends on — that is why it was lifted — and the
 * cost of being wrong is one extra render of one component, against the cost of missing one being a
 * component that silently never updates.
 *
 * Action bodies keep reading `<name>.get()`. A handler must see the *current* value, and it must not call a
 * hook; `actionScope` and `childScope` differ in exactly this, which is why they are two scopes.
 */
function declareLocalSignals(
  component: Node,
  module: ModuleBuilder,
  scope: EmitScope,
): Map<NodeId, string> {
  const signals = new Map<NodeId, string>();
  const ids = Array.isArray(component['localSignals']) ? (component['localSignals'] as string[]) : [];
  if (ids.length === 0) return signals;

  const signalFn = useRuntime(module, 'signal');
  const useState = module.use('react', 'useState');
  for (const id of ids) {
    const node = scope.node(id) as unknown as Node | undefined;
    if (node === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnresolvedReference,
        'error',
        `component signal \`${id}\` is not in the program`,
        idOf(component),
      );
      continue;
    }
    const local = identifierOf(nameOfSignal(node, id, scope));
    signals.set(id, local);
    const initial = node['initial'] === undefined ? 'undefined' : emitExpression(node['initial'] as Node, scope);
    module.line(`const [${local}] = ${useState}(() => ${signalFn}(${initial}));`);
  }

  // The subscriptions, after every declaration — so the emitted block reads as "here is the state, here is
  // what re-renders on it" rather than interleaving the two.
  if (signals.size > 0) {
    const useSignal = useRuntime(module, 'useSignal');
    for (const local of signals.values()) module.line(`const ${local}$ = ${useSignal}(${local});`);
  }

  module.line();
  return signals;
}

/** The subscribed value of a component-local signal — what render position reads. */
function subscribedName(local: string): string {
  return `${local}$`;
}

/**
 * Emits the actions this component's tree calls, as local closures.
 *
 * **The gap M4-F found.** A callback that mutates component state — `onChanged: (v) { setState(() { _note =
 * v; }); }` — is lifted by normalization into a top-level `sig.Action`, and the widget prop becomes a
 * `logic.Ref` naming it. Nothing declared those actions in the component, so every one of them reached the
 * expression emitter as an unresolvable reference and became `BRG3006`.
 *
 * It had gone unnoticed because no earlier fixture put a state-mutating callback *in the widget tree*: the
 * corpus app's `onPressed` called a **store** action, which `rootScope` already resolved. A form is the first
 * screen where the pattern is unavoidable, which is why a milestone about inputs is where it surfaced.
 *
 * A closure per action, declared before the tree, so the tree's `onChanged={handler}` is a reference to a
 * stable local rather than an inline lambda re-created on every render. Only the actions the tree actually
 * reaches are emitted — an action owned by a store is resolved by `rootScope` and must not be duplicated
 * here, and a lifted action nothing calls is dead code.
 */
function declareLocalActions(
  component: Node,
  module: ModuleBuilder,
  scope: EmitScope,
  signals: ReadonlyMap<NodeId, string>,
  componentParams: readonly Node[],
): Map<NodeId, string> {
  const names = new Map<NodeId, string>();
  const referenced = referencedActions(component['render'], scope);
  if (referenced.length === 0) return names;

  // Named from the id, and sorted by it, so two runs emit the same names in the same order. A lifted action
  // has no name in the source — normalization synthesised it — so there is nothing more human to use.
  for (const id of referenced) {
    names.set(id, identifierOf(`handle_${id.slice(0, 8)}`));
  }

  for (const id of referenced) {
    const action = scope.node(id) as unknown as Node | undefined;
    if (action === undefined) continue;
    const declared = asArray(action['params']);

    // Typed, because the emitted project compiles under `strict` and an untyped parameter is `implicit any`
    // — `TS7006`, which the build proof catches. The type is the one Dart declared, carried on the param.
    const actionParams = declared
      .map(
        (param) =>
          `${identifierOf(String(param['name'] ?? '_'))}: ${typeTextOf(param['type'] as Node | undefined)}`,
      )
      .join(', ');

    module.line(`const ${names.get(id)!} = (${actionParams}) => {`);
    module.block(() => {
      module.lineAll(
        emitActionBody(action, actionScope(scope, signals, declared, names, componentParams)),
      );
    });
    module.line('};');
  }
  module.line();
  return names;
}

/**
 * A scope for an action's body, in which its parameters are **locals**.
 *
 * Not `childScope`: that one exists for a `ui.Component`, whose parameters are *props*, so it resolves a name
 * to `props.x`. An action's parameters are ordinary arguments of an ordinary closure, and routing them
 * through `childScope` emitted `_volume.set(props.value)` inside a handler on a component that has no props
 * at all — code that referenced a variable which did not exist. The two kinds of parameter look identical in
 * UIR and mean different things, which is exactly why they need different scopes rather than one with a flag.
 */
function actionScope(
  parent: EmitScope,
  signals: ReadonlyMap<NodeId, string>,
  params: readonly Node[],
  actions: ReadonlyMap<NodeId, string>,
  componentParams: readonly Node[] = [],
): EmitScope {
  const names = new Set(params.map((param) => String(param['name'] ?? '')));
  // The enclosing component's parameters, which an action body can read because its closure is emitted
  // *inside* the component function — `props` is lexically in scope there.
  //
  // Without this, `widget.step` read from inside an action resolved to nothing and the generator refused
  // the program with BRG3006. The render tree worked, because `childScope` already knew about props; an
  // action was handed the *program* scope, which has no parameters at all. Same read, two scopes, one of
  // them wrong.
  const componentNames = new Map<string, string>();
  for (const param of componentParams) {
    const name = String(param['name'] ?? '');
    if (name !== '') componentNames.set(name, identifierOf(name));
  }
  return {
    ...parent,
    report: parent.report.bind(parent),
    node: parent.node.bind(parent),
    declaredName: parent.declaredName.bind(parent),
    declaresClass: parent.declaresClass.bind(parent),
    // `.get()`, not the subscribed local: a handler runs after render and must read the value as it is
    // *now*. Reading `_count$` would close over the value from the render that created the closure — the
    // classic stale-closure bug, and the reason these are two scopes rather than one with a flag.
    signalRead: (id) => {
      const local = signals.get(id);
      return local === undefined ? parent.signalRead(id) : `${local}.get()`;
    },
    signalLocal: (id) => signals.get(id) ?? parent.signalLocal(id),
    localName: (id) => actions.get(id) ?? parent.localName(id),
    // Innermost-first, exactly as Dart resolves: the action's own parameter shadows a component
    // parameter of the same spelling, and a bare name is never `props.x`.
    paramInScope: (name) => {
      if (names.has(name)) return identifierOf(name);
      const prop = componentNames.get(name);
      return prop === undefined ? parent.paramInScope(name) : `props.${prop}`;
    },
  };
}

/**
 * The ids of every `sig.Action` the tree references, sorted.
 *
 * By `target`, not by name: normalization gives a lifted action a synthetic name (`action$8c1f32c5`) that
 * embeds its id, and parsing that string would be reading a fact the node already states properly.
 */
function referencedActions(tree: unknown, scope: EmitScope): NodeId[] {
  const found = new Set<NodeId>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;
    if (kindOf(node) === 'logic.Ref' && typeof node['target'] === 'string') {
      const target = node['target'];
      const declaration = scope.node(target) as unknown as Node | undefined;
      // Only actions, and only ones nothing else already resolves — a store's action is `rootScope`'s.
      if (declaration !== undefined && kindOf(declaration) === 'sig.Action' && scope.localName(target) === undefined) {
        found.add(target);
      }
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(tree);
  return [...found].sort();
}

/** A signal's local name: its anchor, else the name its references use, else its id (see store.ts's `nameOf`). */
function nameOfSignal(node: Node, id: string, scope: EmitScope): string {
  const anchor = node['anchor'];
  if (typeof anchor === 'string') {
    const tail = anchor.split(/[#/.]/).filter(Boolean).pop();
    if (tail !== undefined && tail !== '') return tail;
  }
  const referenced = scope.declaredName(id);
  if (referenced !== undefined && referenced !== '') return referenced;
  return `signal_${id.slice(0, 8)}`;
}

/**
 * A `ui.List`'s key, as a React key.
 *
 * ## Why a `ValueKey` is unwrapped rather than constructed
 *
 * React compares keys with `===` and wants a string or a number. Flutter's `ValueKey<T>(this.value)` **is**
 * its value — the class exists to give that value `Key` identity, and its `operator ==` compares nothing
 * else. So `ValueKey(item.id)` and `item.id` denote the same identity, and emitting the first as
 * `new ValueKey(item.id)` would build a fresh object every render: a key that never matches itself, which is
 * worse than no key at all because it remounts every row on every update.
 *
 * It also would not compile. `ValueKey` is a `package:flutter/` type, so the constructor path imports it
 * from the runtime kit — which does not export it, and should not: there is nothing a kit `ValueKey` could
 * do that the value does not already do.
 *
 * A key that is *not* a value key is left to the ordinary binding path, because its identity is not its
 * argument.
 */
function listKey(binding: Node, scope: EmitScope): string {
  const expr = binding['expr'];
  if (expr !== null && typeof expr === 'object') {
    const node = expr as Node;
    const args = Array.isArray(node['args']) ? (node['args'] as Node[]) : [];
    if (node['kind'] === 'logic.New' && String(node['typeName'] ?? '') === 'ValueKey' && args.length === 1) {
      return emitExpression(args[0]!, scope);
    }
  }
  return emitBinding(binding, scope);
}

/** A scope that resolves this component's signals and params. */
function childScope(
  parent: EmitScope,
  signals: ReadonlyMap<NodeId, string>,
  params: readonly Node[],
  actions: ReadonlyMap<NodeId, string> = new Map(),
): EmitScope {
  const paramNames = new Map<string, string>();
  for (const param of params) {
    const name = String(param['name'] ?? '');
    if (name !== '') paramNames.set(name, identifierOf(name));
  }
  return {
    module: parent.module,
    report: parent.report.bind(parent),
    // Forwarded, not rebuilt: the router is declared once per component and every nested scope inside it
    // refers to that one declaration. Spread rather than assigned, because `exactOptionalPropertyTypes`
    // distinguishes "absent" from "present and undefined" — and absent is what a component that does not
    // navigate must have.
    ...(parent.routerLocal === undefined ? {} : { routerLocal: parent.routerLocal }),
    // Program-wide, so a child scope forwards it unchanged rather than rebuilding it per component.
    themeRoles: parent.themeRoles,
    node: parent.node.bind(parent),
    // The **subscribed** local. This is render position, so the value has to come from the thing that
    // re-renders the component when it changes — see `declareLocalSignals` for the defect this fixes.
    signalRead: (id) => {
      const local = signals.get(id);
      return local === undefined ? parent.signalRead(id) : subscribedName(local);
    },
    signalLocal: (id) => signals.get(id) ?? parent.signalLocal(id),
    // An action this component declared resolves to its local closure; anything else is the parent's.
    localName: (id) => actions.get(id) ?? parent.localName(id),
    declaredName: (id) => parent.declaredName(id),
    declaresClass: (name) => parent.declaresClass(name),
    // A component's parameters are props, so a reference to one reads `props.x` rather than a bare name.
    paramInScope: (name) => {
      const param = paramNames.get(name);
      return param === undefined ? parent.paramInScope(name) : `props.${param}`;
    },
  };
}

function spanOf(node: Node): string {
  const span = node['span'] as Node | undefined;
  if (span === undefined) return 'an unknown location';
  return `${String(span['file'])}:${String(span['line'])}`;
}

/**
 * Emits a `ui.*` node as a TSX expression.
 *
 * @param node - the UI node.
 * @param module - the file, for imports.
 * @param scope - resolution and reporting.
 * @param depth - indentation depth, for readability of the emitted tree.
 * @returns a TSX expression.
 */
export function emitUiNode(node: Node, module: ModuleBuilder, scope: EmitScope, depth: number): string {
  switch (kindOf(node)) {
    case 'ui.Text': {
      const value = emitBinding(node['value'] as Node, scope);
      const Text = useRuntime(module, 'Text');
      return `<${Text}>{${value}}</${Text}>`;
    }

    case 'ui.Element':
      return emitElement(node, module, scope, depth);

    case 'ui.Cond': {
      // A `ui.Cond` is a ternary, not an `if`: it is an expression, and it sits inside JSX where a statement
      // cannot go. An absent branch renders nothing — `null`, not an empty fragment, which would still create
      // a node.
      const condition = emitBinding(node['condition'] as Node, scope);
      const then = node['then'] === undefined ? 'null' : emitUiNode(node['then'] as Node, module, scope, depth + 1);
      const otherwise =
        node['otherwise'] === undefined ? 'null' : emitUiNode(node['otherwise'] as Node, module, scope, depth + 1);
      return `${condition} ? ${then} : ${otherwise}`;
    }

    case 'ui.List': {
      // ## The field names are the schema's, and were not until M4-H
      //
      // This emitter read `items`, `itemName` and `itemBuilder`. `ui.List` has **`source`, `itemParam` and
      // `template`** — it always has; `l2.json` is unambiguous and the analyzer has always emitted those.
      // So every real `ui.List` would have emitted `undefined.map((item, index) => …)`.
      //
      // It was never caught because **`ui.List` had never been generated from real analyzer output**. No
      // generator test constructs one, the build proof's fixture contains no `for`-element and no
      // `.map().toList()`, and `hello_bridge`'s only repeat is a `ListView.builder`, which reached the
      // generator opaque. A hand-built fixture agreeing with a hand-written emitter is exactly the class of
      // defect M3-D's build proof exists to catch, and this one slipped through the gap in its coverage.
      const source = emitBinding(node['source'] as Node, scope);
      const itemName = identifierOf(String(node['itemParam'] ?? 'item'));
      // Flutter's `itemBuilder` takes an index, and `ui.List` carries its name when it does. Defaulting to
      // `index` rather than requiring it keeps a `for (x in xs)` list — which has no index — emitting the
      // same shape it always did.
      const indexName = identifierOf(String(node['indexParam'] ?? 'index'));
      const body = node['template'];
      if (body === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          'a ui.List has no `template`, so there is nothing to render per item.',
          idOf(node),
        );
        return 'null';
      }
      // The template's scope binds the two names the emitted `.map()` introduces. It did not until M4-H —
      // the third defect in this dead path — so a template that read its item or its index reported
      // `BRG3006` for a name the very next line of output declares.
      const listScope: EmitScope = {
        ...scope,
        paramInScope: (name: string) =>
          name === String(node['itemParam'] ?? '')
            ? itemName
            : name === String(node['indexParam'] ?? '')
              ? indexName
              : scope.paramInScope(name),
      };
      const inner = emitUiNode(body as Node, module, listScope, depth + 1);
      // N9 infers keys. If it produced one, it is on the node; if not, the index is used and that is stated
      // rather than silent — an index key is wrong the moment the list reorders.
      // The key is evaluated **per item**, so it resolves in the list's scope, not the enclosing one. It
      // read the outer scope until M4-H — the fourth defect in this path, and the one that could only
      // appear once N9 actually lifted a key, which no fixture had made it do before. `key={ValueKey(
      // items[index])}` reported `BRG3006` for `index`, a name the `.map()` on the same line binds.
      const key = node['key'] === undefined ? indexName : listKey(node['key'] as Node, listScope);
      if (node['key'] === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'warning',
          'this list has no key from N9, so the item index is used. React will reuse the wrong element if ' +
            'the list ever reorders.',
          idOf(node),
        );
      }
      // `Fragment` was emitted and never imported — the second defect in this dead path, and the one that
      // would have failed `tsc` rather than rendering wrongly. Declared through the module builder like every
      // other name, so the import block carries it.
      const fragment = module.use('react', 'Fragment');
      return `{${source}.map((${itemName}, ${indexName}) => <${fragment} key={${key}}>${inner}</${fragment}>)}`;
    }

    case 'ui.Async': {
      scope.report(
        GeneratorDiagnosticCode.IncompleteAsync,
        'error',
        'a ui.Async reached the generator. Rendering a future needs a loading and an error branch, and ' +
          'inventing either is exactly what a generator must not do (BRG2104 says the same upstream).',
        idOf(node),
      );
      return 'null';
    }

    case 'ui.Component': {
      const name = String(node['name'] ?? '');
      return `<${identifierOf(name)} />`;
    }

    case 'ui.Opaque': {
      const source = typeof node['source'] === 'string' ? node['source'] : '<unknown>';
      scope.report(
        GeneratorDiagnosticCode.OpaqueConstruct,
        'error',
        `\`${source.split('\n')[0]}\` has no UIR representation and reached the generator as opaque source ` +
          `(INV-4). It needs an override.`,
        idOf(node),
      );
      return 'null';
    }

    case 'ui.SlotRef':
    case 'ui.OverrideRef':
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `\`${kindOf(node)}\` is not supported by M3-B's minimal surface`,
        idOf(node),
      );
      return 'null';

    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `\`${kindOf(node)}\` has no emission`,
        idOf(node),
      );
      return 'null';
  }
}

/** Emits a `ui.Element` as a runtime component. */
function emitElement(node: Node, module: ModuleBuilder, scope: EmitScope, depth: number): string {
  const componentRef = node['component'] as Node | undefined;
  const widgetName = String(componentRef?.['name'] ?? '');
  const mapping = mappingOf(widgetName);

  if (mapping === undefined) {
    const constructorName =
      typeof componentRef?.['constructorName'] === 'string' ? componentRef['constructorName'] : undefined;
    const missing = missingCapabilityOf(widgetName, constructorName);
    const spelling = constructorName === undefined ? widgetName : `${widgetName}.${constructorName}`;

    if (missing !== undefined) {
      // A widget the system knows about. Naming the capability and its owner is the difference between a
      // diagnostic an author can act on and one that only says something is missing.
      scope.report(
        GeneratorDiagnosticCode.UnsupportedCapability,
        'error',
        `\`${spelling}\` needs ${missing.capability}, which is not built yet. That work belongs to ` +
          `${OWNER_LABEL[missing.owner]}.` +
          (missing.workaround === undefined ? '' : ` For now: ${missing.workaround}.`) +
          ` It is not rendered — a placeholder would be an application that looks nearly right and is wrong.`,
        idOf(node),
      );
      return 'null';
    }

    scope.report(
      GeneratorDiagnosticCode.UnmappedWidget,
      'error',
      `\`${spelling}\` is not a Flutter widget this generator has a mapping for, and not one it knows to be ` +
        `unsupported. If it is your application's own widget, it should have extracted as a ui.Component — ` +
        `that it did not is an extraction defect worth reporting. If it is a framework widget, it needs a ` +
        `catalog entry and a mapping. Supported today: ${supportedWidgetNames().join(', ')}.`,
      idOf(node),
    );
    return 'null';
  }

  checkCapabilities(widgetName, mapping, node, scope);

  const tag = useRuntime(module, mapping.component);
  const props: string[] = [];
  const propMap = (node['props'] ?? {}) as Record<string, unknown>;

  // Sorted: prop order in the source object is not semantic, and emitting discovery order would make the
  // bytes depend on JSON key order.
  for (const flutterProp of Object.keys(propMap).sort()) {
    const mapped = mapping.props?.[flutterProp];
    if (mapped === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnmappedWidget,
        'warning',
        `\`${widgetName}.${flutterProp}\` has no equivalent on the runtime's \`${mapping.component}\` and ` +
          `is dropped. The output does not apply it — it is not silently forwarded to a component that ` +
          `would ignore it.`,
        idOf(node),
      );
      continue;
    }
    const value = emitBinding(propMap[flutterProp] as Node, scope, mapping.enums?.[flutterProp]);
    props.push(`${mapped}={${value}}`);
  }

  // Slots. `ui.Element` keeps them apart from `props` and `children` because they are a different thing: a
  // slot holds one child, at a named place on the screen. ADR-18 records what it cost when extraction
  // flattened them into props — `AppBar.actions` and `CustomScrollView.slivers` became opaque expressions and
  // "the UI structure was simply gone". The classification is the analyzer's; this only renames.
  const slotMap = (node['slots'] ?? {}) as Record<string, unknown>;
  for (const slotName of Object.keys(slotMap).sort()) {
    const mapped = mapping.slots?.[slotName];
    if (mapped === undefined) {
      scope.report(
        GeneratorDiagnosticCode.UnmappedWidget,
        'error',
        `\`${widgetName}.${slotName}\` is a slot — it holds a child — and the runtime's ` +
          `\`${mapping.component}\` has nowhere to put it. Dropping it would delete that subtree from the ` +
          `screen, so it is refused instead.`,
        idOf(node),
      );
      continue;
    }
    const rendered = emitUiNode(slotMap[slotName] as Node, module, scope, depth + 1);
    props.push(`${mapped}={${rendered}}`);
  }

  const children = asArray(node['children']).map((child) => emitUiNode(child, module, scope, depth + 1));
  const attributes = props.length === 0 ? '' : ` ${props.join(' ')}`;

  if (children.length === 0) return `<${tag}${attributes} />`;
  const pad = '  '.repeat(depth + 1);
  const inner = children.map((child) => `${pad}  ${child}`).join('\n');
  return `<${tag}${attributes}>\n${inner}\n${pad}</${tag}>`;
}

/**
 * Checks a widget's declared capability requirements before anything is emitted for it.
 *
 * A `WidgetMapping` used to say only which component to render, so everything else the kit component needed
 * was invisible here: `Divider` reads the `outlineVariant` role, and an app whose theme has no such token
 * compiled cleanly and threw `BRG4006` on first paint. A requirement the generator cannot see is a
 * requirement it cannot check, so the mapping states them and this enforces them.
 *
 * Both checks are `error`s rather than warnings, under the compiler's own severity rule: *"error — the
 * program is not fit to generate from. Something would have to be invented."* A missing role would have to be
 * invented as some colour; an inexpressible alignment as some position.
 */
function checkCapabilities(
  widgetName: string,
  mapping: WidgetMapping,
  node: Node,
  scope: EmitScope,
): void {
  // A parameter the widget can be rendered *without* but not *with*. Narrower than refusing the widget, and
  // it must not be the silent drop an unmapped prop gets: `IntrinsicWidth(stepWidth: 8)` is a different width
  // from `IntrinsicWidth()`, so dropping it renders a box the author did not write.
  const declared = (node['props'] ?? {}) as Record<string, unknown>;
  for (const parameter of Object.keys(declared).sort()) {
    const reason = UNSUPPORTED_PARAMETERS[`${widgetName}.${parameter}`];
    if (reason === undefined) continue;
    scope.report(
      GeneratorDiagnosticCode.UnsupportedParameter,
      'error',
      `\`${widgetName}\` renders, but not with \`${parameter}\` set: ${reason}`,
      idOf(node),
    );
  }

  // INV-20's build-time half: every colour a mapped Material widget paints must resolve to an `app.Token`.
  for (const role of mapping.roles ?? []) {
    if (scope.themeRoles.has(role)) continue;
    scope.report(
      GeneratorDiagnosticCode.UnresolvedThemeRole,
      'error',
      `\`${widgetName}\` paints the Material role \`${role}\`, and this program's theme defines no token ` +
        `for it. INV-20 (ADR-13) requires every colour a mapped widget paints to resolve to an app.Token, ` +
        `so there is no default to fall back to — a literal here would be the compiler bug that invariant ` +
        `names. Give the app a \`ColorScheme.fromSeed(...)\`, which makes N10 derive the full role set, or ` +
        `state \`${role}\` on its ColorScheme.`,
      idOf(node),
    );
  }

  // Flutter's alignment is continuous; CSS flexbox has three positions per axis.
  const props = (node['props'] ?? {}) as Record<string, unknown>;

  // A colour that did not resolve to a token. The analyzer hoists every constant colour and recognises a
  // `colorScheme.<role>` read (M4-E), so anything still shaped like an expression is a colour computed at
  // runtime — which has no single value to put in the palette.
  for (const prop of mapping.colorProps ?? []) {
    const binding = props[prop] as Node | undefined;
    if (binding === undefined) continue;
    if (kindOf(binding) === 'bind.Const' && typeof binding['value'] === 'string') continue;
    scope.report(
      GeneratorDiagnosticCode.UnresolvableColor,
      'error',
      `\`${widgetName}.${prop}\` is a colour the analyzer could not resolve to an app.Token. Every ` +
        `constant colour is hoisted into the palette and every \`colorScheme.<role>\` read names one ` +
        `already, so this is a colour computed at run time — a ternary, or a value from a store. INV-20 ` +
        `(ADR-13) requires a painted colour to resolve to a token, and picking one branch would be ` +
        `inventing. That work belongs to the analyzer: it needs a colour whose value is knowable at build ` +
        `time. Lift the choice to a theme role, or attach an override.`,
      idOf(node),
    );
  }

  for (const prop of mapping.alignmentProps ?? []) {
    const binding = props[prop] as Node | undefined;
    const position = constantAlignment(binding);
    if (position === undefined) continue; // not a constant we can read — nothing proven, nothing reported
    const discrete = (value: number): boolean => value === -1 || value === 0 || value === 1;
    if (discrete(position.x) && discrete(position.y)) continue;
    scope.report(
      GeneratorDiagnosticCode.UnrepresentableAlignment,
      'error',
      `\`${widgetName}.${prop}\` is Alignment(${position.x}, ${position.y}), which CSS flexbox cannot ` +
        `express: it offers three positions per axis and Flutter's alignment is continuous. Snapping to the ` +
        `nearest keyword would place the child somewhere the author did not write, with nothing on screen ` +
        `to say so. Use one of the nine named alignments, or attach an override.`,
      idOf(node),
    );
  }
}

/**
 * The `(x, y)` of a constant `Alignment(...)` construction, or `undefined` if the value is not one.
 *
 * Only the literal construction is readable here — `Alignment.center` is a `logic.Ref` to a static member the
 * kit defines, and every one of those is discrete by construction, so a reference needs no check. Anything
 * else (a variable, a conditional) is not a constant and is left alone: reporting on a value the generator
 * cannot evaluate would be a guess, and a false `error` refuses a program that is fine.
 */
function constantAlignment(binding: Node | undefined): { x: number; y: number } | undefined {
  if (binding === undefined || kindOf(binding) !== 'bind.Expr') return undefined;
  const expr = binding['expr'] as Node | undefined;
  if (expr === undefined || kindOf(expr) !== 'logic.New') return undefined;
  const typeName = String(expr['typeName'] ?? '');
  if (typeName !== 'Alignment' && typeName !== 'AlignmentDirectional') return undefined;
  const args = asArray(expr['args']);
  if (args.length !== 2) return undefined;
  const x = constantNumber(args[0]);
  const y = constantNumber(args[1]);
  return x === undefined || y === undefined ? undefined : { x, y };
}

/** A numeric literal, or its negation — `Alignment(0.3, -0.7)` reaches here as a `Lit` and a `Unary`. */
function constantNumber(node: Node | undefined): number | undefined {
  if (node === undefined) return undefined;
  if (kindOf(node) === 'logic.Lit') {
    return typeof node['value'] === 'number' ? node['value'] : undefined;
  }
  if (kindOf(node) === 'logic.Unary' && node['operator'] === '-') {
    const inner = constantNumber(node['operand'] as Node | undefined);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

/**
 * Emits a `bind.*` as a TypeScript expression.
 *
 * @param binding - the binding node.
 * @param module - the file, for imports.
 * @param scope - resolution and reporting.
 * @param enumMap - Flutter enum value → runtime value, when the prop is an enum.
 * @returns the expression.
 */
export function emitBinding(
  binding: Node | undefined,
  scope: EmitScope,
  enumMap?: Readonly<Record<string, string>>,
): string {
  if (binding === undefined) return 'undefined';

  switch (kindOf(binding)) {
    case 'bind.Const': {
      const value = binding['value'];
      if (typeof value === 'string') {
        if (enumMap !== undefined) {
          const mapped = enumMap[value];
          if (mapped === undefined) {
            scope.report(
              GeneratorDiagnosticCode.UnmappedWidget,
              'error',
              `the enum value \`${value}\` has no equivalent in the runtime`,
              idOf(binding),
            );
            return 'undefined';
          }
          return stringLiteral(mapped);
        }
        return stringLiteral(value);
      }
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (value === null || value === undefined) return 'null';
      return 'undefined';
    }

    case 'bind.Signal': {
      // The reactivity edge — but the subscription is no longer made *here*.
      //
      // This used to emit `useSignal(sig)` inline, which had two problems. It is a hook call wherever the
      // binding happens to sit, including inside a `ui.Cond` branch or a `ui.List` template, where calling
      // it is conditional and violates the rules of hooks. And it covered only bindings, so the identical
      // read reached through an *expression* — an interpolation, a comparison — subscribed to nothing and
      // silently never updated.
      //
      // `declareLocalSignals` now subscribes every component signal once, unconditionally, at the top of the
      // component, and `childScope.signalRead` returns that subscribed value. So a binding and an expression
      // read the same name and get the same reactivity, which is what they always meant.
      const id = binding['signal'];
      const read = typeof id === 'string' ? scope.signalRead(id) : undefined;
      if (read === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnresolvedReference,
          'error',
          `a bind.Signal names \`${String(id)}\`, which is not a signal in scope`,
          idOf(binding),
        );
        return 'undefined';
      }
      // The path is applied after the read: subscribing to `items` and then reading `.length` is what makes
      // a length change re-render, where subscribing to `items.length` would subscribe to nothing.
      const path = Array.isArray(binding['path']) ? (binding['path'] as string[]) : [];
      const suffix = path.map((segment) => `.${identifierOf(segment)}`).join('');
      return `${read}${suffix}`;
    }

    case 'bind.Expr':
      return emitExpression(binding['expr'] as Node, scope);

    case 'bind.Param': {
      // **`param`, not `name`.** `l2.json` names the field `param` and marks it required, and the
      // generated model has `readonly param: string`. Reading `name` always found `undefined` and fell
      // through to the placeholder, so every direct prop binding emitted `props._` — a valid identifier
      // that compiles, refers to nothing, and renders empty.
      //
      // It survived because no *emitting* application had a `StatefulWidget` that read its own props:
      // until M6-B lowered `widget.foo`, such a program was refused at extraction and never reached here.
      // Unblocking one capability exposed the defect in the next.
      const name = binding['param'];
      if (typeof name !== 'string' || name === '') {
        scope.report(
          GeneratorDiagnosticCode.UnresolvedReference,
          'error',
          'a bind.Param carries no parameter name, so there is nothing to read',
          idOf(binding),
        );
        return 'undefined';
      }
      return `props.${identifierOf(name)}`;
    }

    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `\`${kindOf(binding)}\` is not a binding this generator knows`,
        idOf(binding),
      );
      return 'undefined';
  }
}

/** Emits a `sig.Action` body as a lambda, for an event prop. */
export function emitActionBody(action: Node, scope: EmitScope): string[] {
  return emitStatements(action['body'], scope);
}
