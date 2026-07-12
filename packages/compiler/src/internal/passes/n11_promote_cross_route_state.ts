// N11 — promote-cross-route-state (ADR-11).
//
// **A closure cannot be serialized into a URL.** That sentence is the whole pass.
//
// `hello_bridge` — an app written deliberately *to the MVP subset* — passes `onToggleTheme` from one
// screen to the next. Three independent M0 tasks hit it by three different routes: the extraction spike
// saw the function-typed argument crossing `Navigator.push`; the hand-written React reference **could
// not pass it** and had to pin the light theme; the compatibility tool flagged it independently. It is
// not an exotic case. It is what prop-drilling looks like the moment a route boundary appears.
//
// Every URL-routed target hits it identically — React, Vue, Angular, Svelte — so it is solved once,
// here, in the IR, rather than N times in N generators, inconsistently (ADR-1).
//
// ## What it does
//
// For every argument on every route transition:
//
// 1. **A function-typed binding referencing a `sig.Action`** — promote the signals that action writes,
//    and the action itself, into a synthesized `app.Store{origin: "promoted"}`. Remove the argument from
//    the transition. Emit `BRG2302` (info): promotion is **never silent**.
// 2. **A binding reading a component-scoped signal** owned by a component that is not on the
//    destination route — same promotion.
// 3. **A non-primitive data object** — *not* promotion. `BRG2301` (error): a URL carries an identifier,
//    not an object graph (ADR-11a).
// 4. **A primitive** — unchanged. Primitives cross a URL boundary fine.
//
// **A callback that closes over something unpromotable** — a context, a non-signal local, an opaque
// expression — is `BRG2303` (error), routed to the override system. It is never dropped and never
// guessed at.
//
// ## INV-18
//
// After N11, **no argument in a route transition may be of function type**. A violation is a compiler
// bug, not a user error, and the pass checks its own output for it.

import type { AnyUirNode, NodeId } from '@bridge/uir';
import { nodeIdOfContent } from '@bridge/uir';

import { navGraph, type NavGraph } from '../analysis/nav_graph.js';
import { Program } from '../program.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';

export class N11PromoteCrossRouteState implements Pass {
  readonly id = 'N11';
  readonly name = 'promote-cross-route-state';

  /** Without N5 a callback is an anonymous expression with no action to promote (ADR-11). */
  readonly requires: readonly string[] = ['N5'];
  readonly requiresAnalyses: readonly Analysis[] = ['nav-graph'];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = ['nav-graph', 'reactivity-graph'];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const graph: NavGraph = navGraph(program);
    if (graph.transitions.length === 0) return program;

    const actions = index(program, 'sig.Action');
    const signals = index(program, 'sig.Signal');

    /** Signals to promote, and the actions that write them. Sorted at use — a set has no order. */
    const promotedSignals = new Set<NodeId>();
    const promotedActions = new Set<NodeId>();
    const strippedArguments = new Map<NodeId, Set<string>>();

    for (const transition of graph.transitions) {
      for (const argument of transition.arguments) {
        const verdict = classify(argument.binding, actions, signals);

        switch (verdict.kind) {
          case 'primitive':
            break;

          case 'action': {
            // Case 1. The `onToggleTheme` shape.
            promotedActions.add(verdict.action);
            for (const signal of verdict.writes) promotedSignals.add(signal);
            strip(strippedArguments, transition.id, argument.name);

            context.report({
              code: 'BRG2302',
              severity: 'info',
              nodeId: transition.id,
              message:
                `The callback \`${argument.name}\` crosses a route boundary, and a closure cannot be ` +
                `serialized into a URL. The state it writes is promoted into a store, and the argument ` +
                `is removed. Promotion is never silent (ADR-11).`,
            });
            break;
          }

          case 'signal': {
            // Case 2. The `isDark` shape.
            promotedSignals.add(verdict.signal);
            strip(strippedArguments, transition.id, argument.name);

            context.report({
              code: 'BRG2302',
              severity: 'info',
              nodeId: transition.id,
              message:
                `\`${argument.name}\` reads component-scoped state across a route boundary. The signal ` +
                `is promoted into a store so that it outlives the component that declared it (ADR-11).`,
            });
            break;
          }

          case 'object':
            // Case 3. ADR-11a. NOT promotion — and not silence either.
            context.report({
              code: 'BRG2301',
              severity: 'error',
              nodeId: transition.id,
              message:
                `\`${argument.name}\` passes a live object across a route boundary. A URL carries an ` +
                `identifier, not an object graph — a user who reloads the page, or arrives from a ` +
                `bookmark, has no object to pass. Pass an id and load from it (ADR-11a).`,
            });
            break;

          case 'unpromotable':
            // A callback closing over something with no identity the IR can move.
            context.report({
              code: 'BRG2303',
              severity: 'error',
              nodeId: transition.id,
              message:
                `The callback \`${argument.name}\` crosses a route boundary but closes over ` +
                `${verdict.reason}, which cannot be promoted into a store. It is not dropped and it is ` +
                `not guessed at: an override must supply it (ADR-11).`,
            });
            break;
        }
      }
    }

    if (promotedSignals.size === 0 && promotedActions.size === 0) return program;

    return rewrite(program, promotedSignals, promotedActions, strippedArguments);
  }
}

/** What an argument is, for promotion purposes. */
type Verdict =
  | { kind: 'primitive' }
  | { kind: 'action'; action: NodeId; writes: readonly NodeId[] }
  | { kind: 'signal'; signal: NodeId }
  | { kind: 'object' }
  | { kind: 'unpromotable'; reason: string };

/** Classifies an argument binding. Never guesses: an unrecognised shape is unpromotable, not a primitive. */
function classify(
  binding: Record<string, unknown> | undefined,
  actions: ReadonlyMap<NodeId, AnyUirNode>,
  signals: ReadonlyMap<NodeId, AnyUirNode>,
): Verdict {
  if (binding === undefined) return { kind: 'primitive' };

  // A constant. Primitives cross a URL boundary fine — that is what a URL is for.
  if (binding['kind'] === 'bind.Const') return { kind: 'primitive' };

  // A signal read. Component-scoped state crossing a boundary must be promoted; store-scoped state
  // already outlives the component and needs nothing.
  if (binding['kind'] === 'bind.Signal') {
    const id = binding['signal'] as NodeId;
    const signal = signals.get(id);
    if (signal === undefined) return { kind: 'unpromotable', reason: 'a signal that does not exist' };
    const scope = (signal as unknown as Record<string, unknown>)['scope'];
    return scope === 'component' ? { kind: 'signal', signal: id } : { kind: 'primitive' };
  }

  if (binding['kind'] !== 'bind.Expr') return { kind: 'primitive' };

  const expr = binding['expr'] as Record<string, unknown> | undefined;
  if (expr === undefined) return { kind: 'primitive' };

  // A reference to a lifted action — N5's output, and the reason N11 depends on it. Without N5 this is
  // an anonymous lambda with no name to promote.
  if (expr['kind'] === 'logic.Ref' && typeof expr['target'] === 'string') {
    const target = expr['target'] as NodeId;
    const action = actions.get(target);
    if (action !== undefined) {
      const declared = (action as unknown as Record<string, unknown>)['writes'];
      const writes = Array.isArray(declared) ? (declared as NodeId[]) : [];
      // An action that writes nothing has no state to promote — and a callback with no state behind it
      // is a callback whose behaviour lives entirely in its body. There is nothing to move.
      return writes.length === 0
        ? { kind: 'unpromotable', reason: 'no state that the compiler can name' }
        : { kind: 'action', action: target, writes };
    }
  }

  // A closure that N5 declined to lift — it captured a local, a context, an opaque expression. N5 said
  // so (BRG2105); N11 says what it costs.
  if (expr['kind'] === 'logic.Lambda') {
    return { kind: 'unpromotable', reason: 'a value the compiler has no id for' };
  }

  // A constructed object — the `arguments: product` shape.
  if (expr['kind'] === 'logic.New') return { kind: 'object' };

  return { kind: 'primitive' };
}

/** Promotes the signals and actions into a synthesized store, and strips the arguments. */
function rewrite(
  program: Program,
  promotedSignals: ReadonlySet<NodeId>,
  promotedActions: ReadonlySet<NodeId>,
  stripped: ReadonlyMap<NodeId, Set<string>>,
): Program {
  // Sorted. A store's contents are a *set*, and its id is a hash of its content — so an order that
  // depended on traversal would give the same store two ids on two runs (D2, §A16).
  const signals = [...promotedSignals].sort();
  const actions = [...promotedActions].sort();

  const content = {
    kind: 'app.Store',
    name: 'PromotedStore',
    // Never `declared`. A store the compiler synthesized and a store the user wrote are different
    // things, and conflating them would make N11's own diagnostics meaningless.
    origin: 'promoted',
    ...(signals.length > 0 ? { signals } : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };
  const storeId = nodeIdOfContent(content);

  const span = program.get(signals[0] ?? actions[0]!)?.span ?? {
    file: 'synthesized',
    line: 1,
    column: 1,
  };
  const store = { ...content, id: storeId, span } as unknown as AnyUirNode;

  const replacements = new Map<NodeId, AnyUirNode>();

  // Every promoted signal now lives in the store. **Its id does not change** — it is the same signal,
  // in a different place. Re-minting it would break every reader that already refers to it, which is
  // exactly the property the symbol-derived id was designed to give us (M1-T3).
  for (const id of signals) {
    const signal = program.get(id);
    if (signal === undefined) continue;
    replacements.set(id, {
      ...(signal as unknown as Record<string, unknown>),
      scope: 'store',
      store: storeId,
    } as unknown as AnyUirNode);
  }

  // The arguments are gone from the transitions. INV-18: after N11, no argument in a route transition
  // may be of function type.
  for (const [transitionId, names] of stripped) {
    const transition = program.get(transitionId);
    if (transition === undefined) continue;

    const record = transition as unknown as Record<string, unknown>;
    const args = Array.isArray(record['arguments'])
      ? (record['arguments'] as Record<string, unknown>[])
      : [];
    const kept = args.filter((a) => !names.has(String(a['name'])));

    replacements.set(transitionId, {
      ...record,
      ...(kept.length > 0 ? { arguments: kept } : { arguments: undefined }),
    } as unknown as AnyUirNode);
  }

  return Program.of([...program.with(replacements).nodes, store]);
}

function strip(into: Map<NodeId, Set<string>>, transition: NodeId, name: string): void {
  const names = into.get(transition) ?? new Set<string>();
  names.add(name);
  into.set(transition, names);
}

function index(program: Program, kind: 'sig.Action' | 'sig.Signal'): Map<NodeId, AnyUirNode> {
  const out = new Map<NodeId, AnyUirNode>();
  for (const node of program.ofKind(kind)) out.set(node.id, node);
  return out;
}
