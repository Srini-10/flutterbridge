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
import { mappingOf } from './widgets.js';

const RUNTIME = '@bridge/runtime-react';

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
    const signals = declareLocalSignals(component, module, scope);
    const inner = childScope(scope, signals, params);
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
 * Emits the component's own signals.
 *
 * Through `useState`'s initialiser, which React runs once per mount. A bare `signal(0)` in the function body
 * would allocate a fresh signal on every render, so every write would be lost and the component would never
 * update — and a `signal(0)` at module scope would be INV-19, shared across requests. Neither is available;
 * this is the one shape that is both per-instance and stable.
 */
function declareLocalSignals(
  component: Node,
  module: ModuleBuilder,
  scope: EmitScope,
): Map<NodeId, string> {
  const signals = new Map<NodeId, string>();
  const ids = Array.isArray(component['localSignals']) ? (component['localSignals'] as string[]) : [];
  if (ids.length === 0) return signals;

  const signalFn = module.use(RUNTIME, 'signal');
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
  module.line();
  return signals;
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

/** A scope that resolves this component's signals and params. */
function childScope(
  parent: EmitScope,
  signals: ReadonlyMap<NodeId, string>,
  params: readonly Node[],
): EmitScope {
  const paramNames = new Map<string, string>();
  for (const param of params) {
    const name = String(param['name'] ?? '');
    if (name !== '') paramNames.set(name, identifierOf(name));
  }
  return {
    module: parent.module,
    report: parent.report.bind(parent),
    node: parent.node.bind(parent),
    signalRead: (id) => {
      const local = signals.get(id);
      return local === undefined ? parent.signalRead(id) : `${local}.get()`;
    },
    localName: (id) => parent.localName(id),
    declaredName: (id) => parent.declaredName(id),
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
      const value = emitBinding(node['value'] as Node, module, scope);
      const Text = module.use(RUNTIME, 'Text');
      return `<${Text}>{${value}}</${Text}>`;
    }

    case 'ui.Element':
      return emitElement(node, module, scope, depth);

    case 'ui.Cond': {
      // A `ui.Cond` is a ternary, not an `if`: it is an expression, and it sits inside JSX where a statement
      // cannot go. An absent branch renders nothing — `null`, not an empty fragment, which would still create
      // a node.
      const condition = emitBinding(node['condition'] as Node, module, scope);
      const then = node['then'] === undefined ? 'null' : emitUiNode(node['then'] as Node, module, scope, depth + 1);
      const otherwise =
        node['otherwise'] === undefined ? 'null' : emitUiNode(node['otherwise'] as Node, module, scope, depth + 1);
      return `${condition} ? ${then} : ${otherwise}`;
    }

    case 'ui.List': {
      const items = emitBinding(node['items'] as Node, module, scope);
      const itemName = identifierOf(String(node['itemName'] ?? 'item'));
      const body = node['itemBuilder'] ?? node['body'];
      if (body === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          'a ui.List has no item template',
          idOf(node),
        );
        return 'null';
      }
      const inner = emitUiNode(body as Node, module, scope, depth + 1);
      // N9 infers keys. If it produced one, it is on the node; if not, the index is used and that is stated
      // rather than silent — an index key is wrong the moment the list reorders.
      const key = node['key'] === undefined ? 'index' : emitBinding(node['key'] as Node, module, scope);
      if (node['key'] === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'warning',
          'this list has no key from N9, so the item index is used. React will reuse the wrong element if ' +
            'the list ever reorders.',
          idOf(node),
        );
      }
      return `{${items}.map((${itemName}, index) => <Fragment key={${key}}>${inner}</Fragment>)}`;
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
    scope.report(
      GeneratorDiagnosticCode.UnmappedWidget,
      'error',
      `\`${widgetName}\` has no mapping to a runtime component. It is not rendered: a placeholder here ` +
        `would be an application that looks nearly right and is wrong. Supported today: ` +
        `${Object.keys(WIDGET_NAMES).join(', ')}.`,
      idOf(node),
    );
    return 'null';
  }

  const tag = module.use(RUNTIME, mapping.component);
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
    const value = emitBinding(propMap[flutterProp] as Node, module, scope, mapping.enums?.[flutterProp]);
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

/** Names of supported widgets, for the diagnostic. */
const WIDGET_NAMES: Readonly<Record<string, true>> = {
  Text: true, Column: true, Row: true, Center: true, Padding: true, SizedBox: true, ElevatedButton: true,
};

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
  module: ModuleBuilder,
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
      // The reactivity edge. `useSignal` subscribes the component; the path, if any, is applied after the
      // read, because subscribing to `items` and reading `.length` is what makes a length change re-render.
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
      const useSignal = module.use(RUNTIME, 'useSignal');
      const signalExpr = read.endsWith('.get()') ? read.slice(0, -'.get()'.length) : read;
      const path = Array.isArray(binding['path']) ? (binding['path'] as string[]) : [];
      const suffix = path.map((segment) => `.${identifierOf(segment)}`).join('');
      return `${useSignal}(${signalExpr})${suffix}`;
    }

    case 'bind.Expr':
      return emitExpression(binding['expr'] as Node, scope);

    case 'bind.Param':
      return `props.${identifierOf(String(binding['name'] ?? '_'))}`;

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
