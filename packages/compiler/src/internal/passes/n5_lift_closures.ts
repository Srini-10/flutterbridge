// N5 — lift-closures → named `sig.Action`.
//
// An event handler arrives from the frontend as a closure sitting inside a widget prop:
//
//     onPressed: bind.Expr( logic.Lambda { body: [... _count++ ...] } )
//
// N5 gives it a **name**: it synthesizes a `sig.Action` node — with an explicit write set and a body —
// and rewrites the prop to *refer* to it.
//
//     onPressed: bind.Expr( logic.Ref -> sig.Action#a1b2c3 )
//
// ## Why this pass exists at all
//
// **N11 depends on it, and cannot work without it** (Spec §3.3). Cross-route state promotion moves a
// callback out of a component and into a store, because a closure cannot be serialized into a URL. You
// cannot move a thing that has no name. A pipeline that runs N11 without N5 does not crash — it finds
// no named actions, promotes nothing, and ships an app that silently loses its state on navigation.
//
// ## What "the capture set is explicit" means here
//
// A lifted action is **closed over nothing but named nodes**. Its body may reference signals (which are
// `logic.Ref`s carrying a `target`, i.e. a NodeId) and its own parameters. It may *not* reference a
// free local — a `logic.Ref` with no target, naming something in an enclosing scope that the UIR does
// not have an id for.
//
// That is not a restriction invented for convenience; it is what makes the capture set *knowable*. A
// closure over `item` inside a `for (item in items)` genuinely cannot become a named, standalone action
// without becoming a *function of* `item` — and `sig.Action` has no parameters. So such a closure is
// left exactly as it is, and `BRG2105` says so, naming the consequence: N11 will not be able to promote
// it.
//
// Inventing a parameter, or lifting anyway and letting the capture dangle, would produce an action that
// compiles and is wrong.

import {
  nodeIdOfContent,
  type AnyUirNode,
  type NodeId,
  type SourceSpan,
} from '@bridge/uir';

import { Program } from '../program.js';
import { walkNode, type Analysis, type Pass, type PassContext } from '../normalize/pass.js';

export class N5LiftClosures implements Pass {
  readonly id = 'N5';
  readonly name = 'lift-closures';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = ['reactivity-graph'];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const signals = new Set<NodeId>(program.ofKind('sig.Signal').map((s) => s.id));
    if (signals.size === 0) return program;

    const lifted: AnyUirNode[] = [];

    // Rewrite every top-level node, lifting the closures inside it. `rewrite` returns the *same object*
    // when it changed nothing, so a program with no liftable closures is returned unchanged — which is
    // what makes the pipeline's fixed point cheap to check.
    const replacements = new Map<NodeId, AnyUirNode>();
    for (const node of program.nodes) {
      const next = rewrite(node, signals, lifted, context);
      if (next !== node) replacements.set(node.id, next as AnyUirNode);
    }

    if (lifted.length === 0) return program;

    return Program.of([...program.with(replacements).nodes, ...lifted]);
  }
}

/**
 * Rebuilds [value], lifting any liftable closure inside it. Returns the same object if nothing moved.
 *
 * **This does not use `mapTree`, and must not.** `mapTree` is bottom-up; this is deliberately
 * *pre-order and short-circuiting*. When it meets a `bind.Expr(logic.Lambda)` it decides the fate of the
 * whole lambda and **never descends into its body** — lifted, the body becomes a `sig.Action` and is
 * gone from the tree; not lifted, the body stays exactly as the author wrote it. A bottom-up walk would
 * reach the closures *nested inside* a callback first and lift those, which is a different program.
 */
function rewrite(
  value: unknown,
  signals: ReadonlySet<NodeId>,
  lifted: AnyUirNode[],
  context: PassContext,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = rewrite(item, signals, lifted, context);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }

  if (value === null || typeof value !== 'object') return value;

  const node = value as Record<string, unknown>;

  // A callback prop: `bind.Expr` whose expression is a lambda.
  if (node['kind'] === 'bind.Expr') {
    const expr = node['expr'] as Record<string, unknown> | undefined;
    if (expr?.['kind'] === 'logic.Lambda') {
      const action = lift(expr, signals, context);
      if (action !== undefined) {
        lifted.push(action.action);
        // The binding keeps its own id. It is the *same binding* — it now refers to the action rather
        // than inlining it — and re-minting it would orphan every anchor that addresses it.
        return { ...node, expr: action.reference };
      }
      return value;
    }
  }

  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    const next = rewrite(child, signals, lifted, context);
    if (next !== child) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}

/** The action a lambda becomes, and the reference that replaces it — or undefined if it cannot be lifted. */
function lift(
  lambda: Record<string, unknown>,
  signals: ReadonlySet<NodeId>,
  context: PassContext,
): { action: AnyUirNode; reference: Record<string, unknown> } | undefined {
  const writes = writesOf(lambda, signals);

  // A closure that writes nothing is not an action. It is a callback — a navigation, a log, an
  // animation — and naming it as a mutation of state would tell the generator to notify subscribers of
  // a change that never happens.
  if (writes.length === 0) return undefined;

  const free = freeLocals(lambda);
  if (free.length > 0) {
    context.report({
      code: 'BRG2105',
      severity: 'warning',
      nodeId: lambda['id'] as string,
      message:
        `This closure writes state but captures ${free.length === 1 ? 'the local' : 'the locals'} ` +
        `${free.map((n) => `\`${n}\``).join(', ')}, so it cannot be lifted into a named action: ` +
        `sig.Action has no parameters, and an action closed over a name the UIR has no id for is an ` +
        `action whose capture set nobody can compute. It stays a closure — which means cross-route ` +
        `state promotion (N11) will not be able to move it into a store.`,
    });
    return undefined;
  }

  const span = lambda['span'] as SourceSpan;
  const body = (lambda['body'] as unknown[] | undefined) ?? [];
  const isAsync = lambda['isAsync'] === true;

  // The content the id is a hash of. `span` is excluded by `stripIdentity`, so two identical closures
  // in two places are ONE action — which is what content addressing means, and is correct: they do the
  // same thing to the same signals.
  const content: Record<string, unknown> = {
    kind: 'sig.Action',
    // Sorted. A write set is a *set*; its order must not depend on the order the walker happened to
    // find the assignments in, or the same action would hash to two ids on two runs (D2).
    writes: [...writes].sort(),
    body,
    ...(isAsync ? { isAsync: true } : {}),
  };

  const actionId = nodeIdOfContent(content);
  const action = { ...content, id: actionId, span } as unknown as AnyUirNode;

  const reference: Record<string, unknown> = {
    kind: 'logic.Ref',
    // Synthetic, and reproducible: derived from the content hash, so the same closure yields the same
    // name in every process, on every machine, in any order.
    name: `action$${actionId.slice(0, 8)}`,
    target: actionId,
    type: (lambda['type'] as unknown) ?? { name: 'Function' },
    span,
    id: '',
  };
  reference['id'] = nodeIdOfContent(reference);

  return { action, reference };
}

/**
 * The signals a lambda writes.
 *
 * Two ways state is written, and **both** must be found. C1's evidence, recorded in `sig.Action`'s own
 * schema description: `FavoritesStore.toggle` mutates through `_favoriteIds.add/remove`, never by
 * assignment — so an assignment-only analysis returns an empty write set, and the generated state never
 * updates.
 *
 * * `logic.Assign` whose target is a `Ref` at a signal. Precise.
 * * `logic.MethodCall` whose *receiver* is a `Ref` at a signal. **Deliberately over-approximate**: we
 *   do not know which of a collection's methods mutate it without knowing the frontend's language, and
 *   the compiler must not know that. Erring toward "this is a write" costs one re-render that need not
 *   have happened; erring the other way costs a UI that is silently wrong.
 */
function writesOf(lambda: Record<string, unknown>, signals: ReadonlySet<NodeId>): NodeId[] {
  const writes = new Set<NodeId>();

  for (const node of walkNode(lambda)) {
    const record = node as unknown as Record<string, unknown>;

    if (record['kind'] === 'logic.Assign') {
      const target = signalOf(record['target'], signals);
      if (target !== undefined) writes.add(target);
    } else if (record['kind'] === 'logic.MethodCall') {
      const receiver = signalOf(record['receiver'], signals);
      if (receiver !== undefined) writes.add(receiver);
    }
  }

  return [...writes];
}

/** The signal [value] is a reference to, if it is one. */
function signalOf(value: unknown, signals: ReadonlySet<NodeId>): NodeId | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record['kind'] !== 'logic.Ref') return undefined;
  const target = record['target'];
  return typeof target === 'string' && signals.has(target as NodeId)
    ? (target as NodeId)
    : undefined;
}

/**
 * The free locals a lambda closes over.
 *
 * A `logic.Ref` **with** a `target` names something the UIR has an id for — a signal, a top-level
 * declaration. A `Ref` **without** one names a local or a parameter. If that name is not one of the
 * lambda's own parameters, it comes from an enclosing scope, and lifting the lambda out of that scope
 * would leave the reference dangling.
 */
function freeLocals(lambda: Record<string, unknown>): string[] {
  const bound = new Set<string>();
  collectBound(lambda, bound);

  const free = new Set<string>();
  for (const node of walkNode(lambda)) {
    const record = node as unknown as Record<string, unknown>;
    if (record['kind'] !== 'logic.Ref') continue;
    if (typeof record['target'] === 'string') continue;

    const name = record['name'];
    if (typeof name === 'string' && !bound.has(name)) free.add(name);
  }

  // Sorted: this text reaches a diagnostic, and a diagnostic whose word order depends on traversal
  // order is a diagnostic that cannot be diffed between two runs (D2).
  return [...free].sort();
}

/** Every name bound *inside* [lambda] — its parameters, nested lambdas' parameters, and its locals. */
function collectBound(lambda: unknown, into: Set<string>): void {
  for (const node of walkNode(lambda)) {
    const record = node as unknown as Record<string, unknown>;

    if (record['kind'] === 'logic.VarDecl' && typeof record['name'] === 'string') {
      into.add(record['name']);
    }
    if (record['kind'] === 'logic.For' && typeof record['loopVariable'] === 'string') {
      into.add(record['loopVariable']);
    }
  }

  // Parameters are not nodes — they are `ParamDecl` value objects, so `walkNode` (which yields things
  // with an `id` and a `kind`) never reaches them. They are collected by shape.
  collectParams(lambda, into);
}

function collectParams(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectParams(item, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (record['kind'] === 'logic.Lambda' && Array.isArray(record['params'])) {
    for (const param of record['params'] as Record<string, unknown>[]) {
      if (typeof param['name'] === 'string') into.add(param['name']);
    }
  }
  for (const child of Object.values(record)) collectParams(child, into);
}
