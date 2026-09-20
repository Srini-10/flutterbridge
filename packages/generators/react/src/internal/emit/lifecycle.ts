// Flutter `State` lifecycle → React (ADR-0052).
//
// A lifecycle method reaches UIR as a `sig.Effect`; `ui.Component.effects` says which component owns it and
// `sig.Effect.method` which method it is. Until M11 nothing read either, so `initState() { _n = 5; }` produced a
// component that started at 0 with no diagnostic anywhere. Each method now has a defined lowering — or a refusal.
//
//   initState       a leading run of *pure state assignments* (`_n = 5`, `_m = _n + 1`) runs before the first render, in
//                   `useInitState` — Flutter's own timing, so the first frame is right. Everything after runs once
//                   after the first commit, in `useLifecycle({ init })`.
//   dispose         `useLifecycle({ dispose })`: the cleanup of the same effect as `initState`, so an init and its
//                   dispose pair even where development StrictMode mounts, unmounts and mounts again.
//   didUpdateWidget `useDidUpdateWidget(props, (oldWidget) => …)`: runs when the parent rebuilt this widget with a new
//                   configuration — `props` is a new object exactly then — not on the first build, not on the
//                   component's own re-render. `oldWidget` is the previous props.
//   didChangeDependencies  refused when it has behaviour: it fires when an *inherited* dependency changes, which a
//                   function component has no per-instance hook for.
//
// What this file decides is only *what a statement is*: erasable, or a pure state initialisation.

type Node = Record<string, unknown>;

/** The `State` lifecycle methods a `super.` call to which is a framework no-op. */
export const LIFECYCLE_METHODS: ReadonlySet<string> = new Set([
  'initState',
  'dispose',
  'didUpdateWidget',
  'didChangeDependencies',
  'deactivate',
  'activate',
  'reassemble',
]);

const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/**
 * Whether one statement of a lifecycle body needs nothing from the generated output.
 *
 * Two shapes, both structural: a `super.<lifecycle>()` call (the analyzer spells the receiver `super`, the Dart
 * keyword), and `dispose()` with no argument on a receiver whose resolved type is a Flutter framework type — a
 * `TextEditingController`, whose lifetime the runtime kit owns. A `dispose()` on a project class is behaviour
 * (it may release something the program cares about) and is not erased.
 */
export function isErasableLifecycleStatement(statement: Node): boolean {
  if (statement['kind'] !== 'logic.ExprStmt') return false;
  const call = statement['expr'] as Node | undefined;
  if (call === undefined || call['kind'] !== 'logic.MethodCall') return false;
  const receiver = call['receiver'] as Node | undefined;
  const method = String(call['method'] ?? '');
  if (receiver?.['kind'] === 'logic.Ref' && receiver['name'] === 'super') return LIFECYCLE_METHODS.has(method);
  const library = (receiver?.['type'] as Node | undefined)?.['library'];
  return (
    method === 'dispose' &&
    asArray(call['args']).length === 0 &&
    typeof library === 'string' &&
    library.startsWith('package:flutter/')
  );
}

/** What is left of an effect body once the erasable statements are removed. */
export function behaviourOf(effect: Node): Node[] {
  return asArray(effect['body']).filter((s) => !isErasableLifecycleStatement(s as Node)) as Node[];
}

/** The Flutter method an effect is: its `method`, else the one its timing implies. */
export function methodOf(effect: Node): string {
  if (typeof effect['method'] === 'string') return effect['method'];
  return effect['timing'] === 'mount' ? 'initState' : effect['timing'] === 'unmount' ? 'dispose' : 'didUpdateWidget';
}

const PURE_EXPRESSIONS: ReadonlySet<string> = new Set([
  'logic.Lit',
  'logic.Ref',
  'logic.Binary',
  'logic.Unary',
  'logic.Conditional',
  'logic.StringInterp',
  'logic.ListLit',
  'logic.PropertyAccess',
]);

/**
 * Whether evaluating `node` can neither change anything nor depend on when it runs: a literal, a reference, and
 * operators, conditionals, interpolations, list literals and property reads over those. A call is not — it may start
 * a timer, read the clock, or fetch — and neither is anything this does not list.
 */
export function isPureExpression(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false;
  const expression = node as Node;
  const kind = String(expression['kind']);
  if (kind === 'logic.MethodCall') {
    // The subscript is a read. Any other method is a call.
    if (expression['method'] !== '[]') return false;
    return isPureExpression(expression['receiver']) && asArray(expression['args']).every((a) => isPureExpression(a));
  }
  if (!PURE_EXPRESSIONS.has(kind)) return false;
  return Object.entries(expression).every(([key, value]) => {
    if (key === 'type' || key === 'span' || key === 'anchor' || key === 'id') return true;
    if (Array.isArray(value)) return value.every((v) => typeof v !== 'object' || v === null || isPureExpression(v));
    if (value !== null && typeof value === 'object') {
      const child = value as Node;
      return typeof child['kind'] !== 'string' || isPureExpression(child);
    }
    return true;
  });
}

/**
 * Whether `statement` only initialises a state field from a pure expression: `_n = 5;`, `_m = _n + 1;`,
 * `_label = 'x $_n';`. `isOwnSignal` says whether a `logic.Ref` target is one of the component's own signals.
 */
export function isPureStateAssignment(statement: Node, isOwnSignal: (id: string) => boolean): boolean {
  if (statement['kind'] !== 'logic.ExprStmt') return false;
  const assign = statement['expr'] as Node | undefined;
  if (assign === undefined || assign['kind'] !== 'logic.Assign') return false;
  const target = assign['target'] as Node | undefined;
  if (target === undefined || target['kind'] !== 'logic.Ref') return false;
  const id = target['target'];
  if (typeof id !== 'string' || !isOwnSignal(id)) return false;
  return isPureExpression(assign['value']);
}

/**
 * Splits an `initState` body into the pure state-initialising prefix, which runs before the first render, and the
 * rest, which runs after the first commit. Erasable statements are dropped from both. Order is preserved: nothing
 * moves across a statement that is not part of the prefix.
 */
export function splitInitState(
  effect: Node,
  isOwnSignal: (id: string) => boolean,
): { before: Node[]; after: Node[] } {
  const before: Node[] = [];
  const after: Node[] = [];
  for (const statement of behaviourOf(effect)) {
    if (after.length === 0 && isPureStateAssignment(statement, isOwnSignal)) before.push(statement);
    else after.push(statement);
  }
  return { before, after };
}
