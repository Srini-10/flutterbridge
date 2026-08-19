// N11 — promote-cross-route-state (ADR-11, amended M7-E3).
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
// For every argument on every route boundary — a declarative `app.Route` or an imperative
// `app.RouteTransition`, unified by the nav-graph as a `ComponentBoundary` (M7-E3):
//
// 1. **A function-typed binding referencing a `sig.Action`** — promote the signals that action writes,
//    and the action itself, into a synthesized `app.Store{origin: "promoted"}`. Remove the argument from
//    the boundary. Emit `BRG2302` (info): promotion is **never silent**.
// 2. **A binding reading a component-scoped signal** owned by a component that is not on the
//    destination route — same promotion.
// 3. **A non-primitive data object** — *not* promotion. `BRG2301` (error): a URL carries an identifier,
//    not an object graph (ADR-11a).
// 4. **A forwarded parameter reference** — a binding that reads the *source* component's own
//    constructor parameter (`bind.Param`, or an untargeted `logic.Ref`: a `ParamDecl` has no id, so
//    nothing can name it as a `target`). This is the multi-hop case the M7-E2 ADR amendment scoped out:
//    the compiler cannot prove what such a reference resolves to without inferring from its name, which
//    is disallowed. `BRG2305` (error): named, not guessed at.
// 5. **A primitive** — unchanged. Primitives cross a URL boundary fine.
//
// **A callback that closes over something unpromotable** — a context, a non-signal local, an opaque
// expression — is `BRG2303` (error), routed to the override system. It is never dropped and never
// guessed at.
//
// ## Interface rewriting (M7-E3, ADR-11 amendment)
//
// A promoted argument that satisfies a *required* destination-component parameter leaves that
// parameter dangling — still declared, no longer supplied. This pass now proves, and only then acts on,
// whether the parameter itself can be retired:
//
// - **Reaching-caller consensus.** A parameter is eligible for removal only when *every* boundary that
//   constructs the destination component supplies it, and every supply promotes to the identical
//   underlying declaration. One caller supplying a plain primitive, one caller omitting the argument, or
//   two callers promoting two different signals, all block removal — `BRG2306` names which.
// - **Outbound safety.** A parameter is *not* removed if the destination component itself forwards it,
//   by the same name, into a further boundary this pass cannot promote (case 4 above) — removing the
//   parameter in that case would not fix the forward; it would orphan it. This is the single-hop
//   boundary: a component that only forwards a value is not itself where the value is consumed, and
//   proving the forward's identity is a different, larger analysis than this pass performs.
// - **The rewrite**, once both hold: the parameter is removed from `ui.Component.params`; every
//   `bind.Param` read of it inside that component's own render tree is rewritten to read the promoted
//   store directly (`bind.Signal`, or a `logic.Ref` at the promoted action) — the same vocabulary any
//   other store consumption already uses, not a new one. `BRG2304` announces the rewrite.
//
// `ui.Component` is a **declaration**: its id is a hash of its stable symbol (`comp:path#Name`), never
// of `params` or `render` (ADR-17 ISSUE-6). Removing a parameter and rewriting reads therefore never
// changes the component's own id — every existing reference to it, and every override anchor beneath
// it, survives untouched.
//
// ## INV-18
//
// After N11, **no argument in a route boundary may be of function type**, except one this pass could
// not prove safe to touch (cases 3 and 4 above, which are reported, not silently carried). A violation
// elsewhere is a compiler bug, not a user error.

import type { AnyUirNode, NodeId } from '@bridge/uir';
import { nodeIdOfContent } from '@bridge/uir';

import { navGraph, type ComponentBoundary, type NavGraph } from '../analysis/nav_graph.js';
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
    if (graph.boundaries.length === 0) return program;

    const actions = index(program, 'sig.Action');
    const signals = index(program, 'sig.Signal');
    const components = index(program, 'ui.Component');

    /** Signals to promote, and the actions that write them. Sorted at use — a set has no order. */
    const promotedSignals = new Set<NodeId>();
    const promotedActions = new Set<NodeId>();
    const strippedArguments = new Map<NodeId, Set<string>>();
    /** Component id → param name → the verdict that justified removing it (M7-E3). */
    const paramRemovals = new Map<NodeId, Map<string, PromotedVerdict>>();

    // Every (boundary, argument) classified once, up front. Consensus and the outbound-safety check
    // both need to compare a boundary's verdict against *other* boundaries', so classification cannot
    // be interleaved with reporting the way a single-boundary loop could get away with.
    const classified: readonly Classified[] = graph.boundaries.flatMap((boundary) =>
      boundary.arguments.map((argument) => ({
        boundary,
        argument,
        verdict: classify(argument.binding, actions, signals),
      })),
    );

    // Object, unpromotable and forwarded verdicts never depend on what any other boundary does — a
    // live object is a live object regardless of how many other routes reach the same component — so
    // they are reported unconditionally, exactly as this pass has always reported case 3.
    for (const c of classified) {
      if (c.verdict.kind === 'object') {
        context.report({
          code: 'BRG2301',
          severity: 'error',
          nodeId: c.boundary.id,
          message:
            `\`${c.argument.name}\` passes a live object across a route boundary. A URL carries an ` +
            `identifier, not an object graph — a user who reloads the page, or arrives from a ` +
            `bookmark, has no object to pass. Pass an id and load from it (ADR-11a).`,
        });
      } else if (c.verdict.kind === 'unpromotable') {
        context.report({
          code: 'BRG2303',
          severity: 'error',
          nodeId: c.boundary.id,
          message:
            `The callback \`${c.argument.name}\` crosses a route boundary but closes over ` +
            `${c.verdict.reason}, which cannot be promoted into a store. It is not dropped and it is ` +
            `not guessed at: an override must supply it (ADR-11).`,
        });
      } else if (c.verdict.kind === 'forwarded') {
        context.report({
          code: 'BRG2305',
          severity: 'error',
          nodeId: c.boundary.id,
          message:
            `\`${c.argument.name}\` forwards the source component's own constructor parameter across ` +
            `a route boundary. A parameter has no id (ADR-17), so this pass cannot prove what the ` +
            `forwarded value resolves to without inferring from its name, which it refuses to do. If ` +
            `it should be promoted, promote it at the boundary it actually originates from — the ` +
            `owner of tracing a value through more than one component boundary is a future, ` +
            `whole-program provenance analysis, not this pass (ADR-11 amendment §"multi-hop").`,
        });
      }
    }

    // A destination only has an interface worth protecting when a real `ui.Component` declares one —
    // a boundary naming a route this program does not resolve, or a component id nothing declares, has
    // nothing for consensus to reconcile against. Both promote on their own evidence alone, exactly as
    // this pass always has, before this amendment existed.
    const hasInterface = (boundary: ComponentBoundary): boolean =>
      boundary.component !== undefined && components.has(boundary.component);

    for (const c of classified) {
      if (c.verdict.kind !== 'action' && c.verdict.kind !== 'signal') continue;
      if (!hasInterface(c.boundary)) {
        promote(c.verdict, promotedActions, promotedSignals);
        strip(strippedArguments, c.boundary.id, c.argument.name);
        report(context, c);
      }
    }

    // Boundaries whose destination is a real component: group by (component, argument name) and
    // require consensus before promoting *or* stripping — a caller that disagrees blocks the whole
    // group, not just itself, because a stripped argument on one boundary and an untouched required
    // param is exactly the missing-prop failure this amendment exists to prevent.
    const knownGroups = groupByComponentAndName(classified.filter((c) => hasInterface(c.boundary)));
    for (const [component, byName] of knownGroups) {
      for (const [name, entries] of byName) {
        const hasPromotable = entries.some((c) => c.verdict.kind === 'action' || c.verdict.kind === 'signal');
        if (!hasPromotable) continue; // ordinary prop-passing — nothing this pass is asked to decide

        const reaching = graph.boundariesByComponent.get(component) ?? [];
        const perBoundary = reaching.map((b) => {
          const argument = b.arguments.find((a) => a.name === name);
          return {
            boundary: b,
            argument,
            verdict: argument === undefined ? undefined : classify(argument.binding, actions, signals),
          };
        });

        const missing = perBoundary.some((p) => p.verdict === undefined);
        const allPromotable = !missing && perBoundary.every((p) => p.verdict!.kind === 'action' || p.verdict!.kind === 'signal');
        const targetKey = (v: Verdict): string =>
          v.kind === 'action' ? `a:${v.action}` : v.kind === 'signal' ? `s:${v.signal}` : '';
        const targets = allPromotable ? new Set(perBoundary.map((p) => targetKey(p.verdict!))) : undefined;
        const sameTarget = targets !== undefined && targets.size === 1;

        if (missing || !allPromotable || !sameTarget) {
          const blockers = perBoundary
            .filter((p) => p.verdict === undefined || (p.verdict.kind !== 'action' && p.verdict.kind !== 'signal'))
            .map((p) => (p.verdict === undefined ? `\`${p.boundary.id}\` does not supply it at all` : `\`${p.boundary.id}\` supplies it as ${describe(p.verdict)}`));
          const conflict =
            blockers.length > 0
              ? blockers.join('; ')
              : 'reaching callers promote it to different underlying declarations';
          context.report({
            code: 'BRG2306',
            severity: 'error',
            nodeId: component,
            message:
              `\`${name}\` is promotable on some, but not every, route reaching this component: ` +
              `${conflict}. A parameter can only be removed from a component's declared interface ` +
              `when every caller agrees — otherwise a caller that still supplies it locally would be ` +
              `passing an argument to a parameter that no longer exists. The parameter is left in ` +
              `place, and every reaching boundary keeps its own argument as it was.`,
          });
          continue;
        }

        // Consensus holds. Before acting on it, check the one thing consensus among *inbound* callers
        // cannot see: whether this component forwards the same-named value onward, by an untargeted
        // reference this pass already refused to promote (case 4). Removing the parameter here would
        // not fix that forward — it would orphan it.
        const outboundHazard = graph.boundaries.some(
          (b) =>
            b.source === component &&
            b.arguments.some((a) => {
              if (a.name !== name) return false;
              const v = classify(a.binding, actions, signals);
              return v.kind === 'forwarded';
            }),
        );
        if (outboundHazard) {
          context.report({
            code: 'BRG2305',
            severity: 'error',
            nodeId: component,
            message:
              `\`${name}\` is promotable on every route reaching this component, but the component ` +
              `itself forwards \`${name}\` onward into a further boundary this pass could not prove ` +
              `the identity of (case 4 above). Removing \`${name}\` from this component's declared ` +
              `interface would not repair that forward — it would leave it reading a parameter that ` +
              `no longer exists. The parameter is kept, and nothing is rewritten, until the forward ` +
              `itself can be promoted (a future, whole-program provenance analysis — ADR-11 amendment ` +
              `§"multi-hop").`,
          });
          continue;
        }

        // Consensus already proved `allPromotable && sameTarget` above — every entry's verdict is
        // `action` or `signal`, and all resolve to the same declaration.
        const verdict = perBoundary[0]!.verdict! as PromotedVerdict;
        promote(verdict, promotedActions, promotedSignals);
        for (const p of perBoundary) {
          strip(strippedArguments, p.boundary.id, name);
          report(context, { boundary: p.boundary, argument: p.argument!, verdict: p.verdict! });
        }

        const byNameForComponent = paramRemovals.get(component) ?? new Map<string, PromotedVerdict>();
        byNameForComponent.set(name, verdict);
        paramRemovals.set(component, byNameForComponent);

        context.report({
          code: 'BRG2304',
          severity: 'info',
          nodeId: component,
          message:
            `\`${name}\` is removed from this component's declared parameters: every route reaching ` +
            `it promoted the value to the same store, so the component now reads it there directly ` +
            `instead of receiving it as a prop. The interface change is never silent (ADR-11 ` +
            `amendment §"Decision").`,
        });
      }
    }

    if (promotedSignals.size === 0 && promotedActions.size === 0 && paramRemovals.size === 0) {
      return program;
    }

    return rewrite(program, promotedSignals, promotedActions, strippedArguments, paramRemovals, components);
  }
}

/** What an argument is, for promotion purposes. */
type Verdict =
  | { kind: 'primitive' }
  | { kind: 'action'; action: NodeId; writes: readonly NodeId[]; ref: Record<string, unknown> }
  | { kind: 'signal'; signal: NodeId }
  | { kind: 'object' }
  | { kind: 'unpromotable'; reason: string }
  | { kind: 'forwarded' };

/** A verdict that carries enough to synthesize an internal store-read (M7-E3's rewrite step needs it). */
type PromotedVerdict = Extract<Verdict, { kind: 'action' | 'signal' }>;

interface Classified {
  readonly boundary: ComponentBoundary;
  readonly argument: { readonly name: string; readonly binding?: Record<string, unknown> };
  readonly verdict: Verdict;
}

function promote(verdict: PromotedVerdict, promotedActions: Set<NodeId>, promotedSignals: Set<NodeId>): void {
  if (verdict.kind === 'action') {
    promotedActions.add(verdict.action);
    for (const signal of verdict.writes) promotedSignals.add(signal);
  } else {
    promotedSignals.add(verdict.signal);
  }
}

function describe(verdict: Verdict): string {
  if (verdict.kind === 'action') return 'a promotable callback';
  if (verdict.kind === 'signal') return 'a promotable signal';
  if (verdict.kind === 'object') return 'a live object';
  if (verdict.kind === 'unpromotable') return `an unpromotable callback (${verdict.reason})`;
  if (verdict.kind === 'forwarded') return 'a forwarded parameter reference';
  return 'a primitive';
}

function report(context: PassContext, c: Classified): void {
  if (c.verdict.kind === 'action') {
    context.report({
      code: 'BRG2302',
      severity: 'info',
      nodeId: c.boundary.id,
      message:
        `The callback \`${c.argument.name}\` crosses a route boundary, and a closure cannot be ` +
        `serialized into a URL. The state it writes is promoted into a store, and the argument ` +
        `is removed. Promotion is never silent (ADR-11).`,
    });
  } else if (c.verdict.kind === 'signal') {
    context.report({
      code: 'BRG2302',
      severity: 'info',
      nodeId: c.boundary.id,
      message:
        `\`${c.argument.name}\` reads component-scoped state across a route boundary. The signal ` +
        `is promoted into a store so that it outlives the component that declared it (ADR-11).`,
    });
  }
}

/** Groups classified boundaries whose destination component is known, by (component, argument name). */
function groupByComponentAndName(
  classified: readonly Classified[],
): Map<NodeId, Map<string, Classified[]>> {
  const byComponent = new Map<NodeId, Map<string, Classified[]>>();
  for (const c of classified) {
    if (c.boundary.component === undefined) continue;
    const byName = byComponent.get(c.boundary.component) ?? new Map<string, Classified[]>();
    const list = byName.get(c.argument.name) ?? [];
    list.push(c);
    byName.set(c.argument.name, list);
    byComponent.set(c.boundary.component, byName);
  }
  return byComponent;
}

/** Classifies an argument binding. Never guesses: an unrecognised shape is unpromotable, not a primitive. */
function classify(
  binding: Record<string, unknown> | undefined,
  actions: ReadonlyMap<NodeId, AnyUirNode>,
  signals: ReadonlyMap<NodeId, AnyUirNode>,
): Verdict {
  if (binding === undefined) return { kind: 'primitive' };

  // A constant. Primitives cross a URL boundary fine — that is what a URL is for.
  if (binding['kind'] === 'bind.Const') return { kind: 'primitive' };

  // A direct read of the *source* component's own constructor parameter. `ParamDecl` has no id (it is
  // a value, not a node — the same reason a `logic.Ref` to one below has no `target`), so this pass
  // cannot tell what the forwarded value is without inferring from `param`'s name. Case 4.
  if (binding['kind'] === 'bind.Param') return { kind: 'forwarded' };

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

  if (expr['kind'] === 'logic.Ref') {
    // A reference to a lifted action — N5's output, and the reason N11 depends on it. Without N5 this
    // is an anonymous lambda with no name to promote.
    if (typeof expr['target'] === 'string') {
      const target = expr['target'] as NodeId;
      const action = actions.get(target);
      if (action !== undefined) {
        const declared = (action as unknown as Record<string, unknown>)['writes'];
        const writes = Array.isArray(declared) ? (declared as NodeId[]) : [];
        // An action that writes nothing has no state to promote — and a callback with no state behind
        // it is a callback whose behaviour lives entirely in its body. There is nothing to move.
        return writes.length === 0
          ? { kind: 'unpromotable', reason: 'no state that the compiler can name' }
          : { kind: 'action', action: target, writes, ref: expr };
      }
      return { kind: 'primitive' };
    }
    // An untargeted `logic.Ref` inside a route-argument binding: the same forwarded-parameter shape as
    // `bind.Param` above, reached through the expression path instead of the binding path (M7-E3).
    return { kind: 'forwarded' };
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

/** Promotes the signals and actions into a synthesized store, strips arguments, and rewrites interfaces. */
function rewrite(
  program: Program,
  promotedSignals: ReadonlySet<NodeId>,
  promotedActions: ReadonlySet<NodeId>,
  stripped: ReadonlyMap<NodeId, Set<string>>,
  paramRemovals: ReadonlyMap<NodeId, ReadonlyMap<string, PromotedVerdict>>,
  components: ReadonlyMap<NodeId, AnyUirNode>,
): Program {
  const replacements = new Map<NodeId, AnyUirNode>();
  let storeId: NodeId | undefined;
  let store: AnyUirNode | undefined;

  if (promotedSignals.size > 0 || promotedActions.size > 0) {
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
    storeId = nodeIdOfContent(content);

    const span = program.get(signals[0] ?? actions[0]!)?.span ?? {
      file: 'synthesized',
      line: 1,
      column: 1,
    };
    store = { ...content, id: storeId, span } as unknown as AnyUirNode;

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
  }

  // The arguments are gone from the boundaries — `app.Route.arguments` and `app.RouteTransition.arguments`
  // are the same field on both node kinds, so one loop strips both. INV-18: after N11, no argument in a
  // route boundary this pass promoted may be of function type.
  for (const [boundaryId, names] of stripped) {
    const boundary = program.get(boundaryId);
    if (boundary === undefined) continue;

    const record = boundary as unknown as Record<string, unknown>;
    const args = Array.isArray(record['arguments'])
      ? (record['arguments'] as Record<string, unknown>[])
      : [];
    const kept = args.filter((a) => !names.has(String(a['name'])));

    replacements.set(boundaryId, {
      ...record,
      ...(kept.length > 0 ? { arguments: kept } : { arguments: undefined }),
    } as unknown as AnyUirNode);
  }

  // Component interfaces (M7-E3): remove the promoted parameter and rewrite every internal read of it
  // to the promoted store, exactly the vocabulary any other store consumption already uses.
  for (const [componentId, byName] of paramRemovals) {
    const component = (replacements.get(componentId) ?? components.get(componentId)) as unknown as
      | Record<string, unknown>
      | undefined;
    if (component === undefined) continue;

    const params = Array.isArray(component['params'])
      ? (component['params'] as Record<string, unknown>[])
      : [];
    const keptParams = params.filter((p) => !byName.has(String(p['name'])));

    let render = component['render'];
    for (const [name, verdict] of byName) {
      render = rewriteParamReads(render, name, verdict);
    }

    replacements.set(componentId, {
      ...component,
      ...(keptParams.length > 0 ? { params: keptParams } : { params: undefined }),
      render,
    } as unknown as AnyUirNode);
  }

  const nodes = [...program.with(replacements).nodes];
  if (store !== undefined) nodes.push(store);
  return Program.of(nodes);
}

/**
 * Walks `value` (a nested plain-object/array tree — a component's `render` field), replacing every
 * `bind.Param{param: paramName}` with a direct read of the promoted store. Recomputes the content-hash
 * id of every tree node on the path back to the root that actually changed; leaves everything else,
 * including nodes that did not change, byte-identical (D1: the same input in a different position of
 * the tree must not perturb ids nothing about it changed).
 */
function rewriteParamReads(value: unknown, paramName: string, verdict: PromotedVerdict): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = rewriteParamReads(v, paramName, verdict);
      if (next !== v) changed = true;
      return next;
    });
    return changed ? out : value;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (record['kind'] === 'bind.Param' && record['param'] === paramName) {
      const built = paramReplacement(verdict, record['span']);
      return { ...built, id: nodeIdOfContent(built) };
    }

    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(record)) {
      const next = rewriteParamReads(v, paramName, verdict);
      if (next !== v) changed = true;
      out[key] = next;
    }
    if (!changed) return value;
    // Only a *tree* node (content-addressed) needs a recomputed id when its content changes — a
    // declaration's id is symbol-derived and never depends on this (ADR-17 ISSUE-6). Every node inside
    // a `render` field is a tree node by construction (`ui.Element`, `ui.Cond`, `ui.List`, `bind.*`,
    // `logic.*`), so recomputing unconditionally here is correct for everything this function ever
    // walks into.
    if (typeof out['id'] === 'string') out['id'] = nodeIdOfContent(out);
    return out;
  }

  return value;
}

/** The internal-read replacement for a promoted parameter — a direct store read, not a new mechanism. */
function paramReplacement(verdict: PromotedVerdict, span: unknown): Record<string, unknown> {
  if (verdict.kind === 'signal') {
    return { kind: 'bind.Signal', signal: verdict.signal, span };
  }
  // A promoted callback: the same shape any other action reference already uses — `bind.Expr` wrapping
  // a `logic.Ref` at the action's (unchanged) id — reusing the matched reference's own `type` rather
  // than inventing one, so nothing here guesses at a signature the program never stated.
  const ref = verdict.ref;
  return {
    kind: 'bind.Expr',
    span,
    expr: {
      kind: 'logic.Ref',
      name: ref['name'],
      target: verdict.action,
      type: ref['type'],
      span,
    },
  };
}

function strip(into: Map<NodeId, Set<string>>, boundary: NodeId, name: string): void {
  const names = into.get(boundary) ?? new Set<string>();
  names.add(name);
  into.set(boundary, names);
}

function index(program: Program, kind: 'sig.Action' | 'sig.Signal' | 'ui.Component'): Map<NodeId, AnyUirNode> {
  const out = new Map<NodeId, AnyUirNode>();
  for (const node of program.ofKind(kind)) out.set(node.id, node);
  return out;
}
