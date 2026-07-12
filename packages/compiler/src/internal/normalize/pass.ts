// The pass contract.
//
// Spec §3.3 fixes eleven normalization passes, their order, and their dependencies. This is that
// contract in code.
//
// ## "Normalize if necessary, otherwise verify the invariant"
//
// A pass does **not** assume it always rewrites something. Extraction from Flutter already emits
// `ui.Cond` for a collection-`if`, because a collection-`if` inside a `children:` list genuinely *is*
// a conditional subtree — there was nothing to desugar. A future SwiftUI or React frontend may emit
// something less canonical, and the same pass must then do the work.
//
// So every pass has one contract with two halves:
//
//   * if the input is not canonical, make it canonical;
//   * if it already is, **verify that it is**, and say so if it is not.
//
// This is what keeps the pass graph frontend-independent. Deleting a pass because *our current
// frontend* happens to make it redundant would make the pipeline's shape depend on which frontend fed
// it — which is precisely what normalization exists to prevent.

import type { AnyUirNode } from '@bridge/uir';

export type { Diagnostic } from '../diagnostic.js';

import type { Diagnostic } from '../diagnostic.js';
import type { WidgetRegistry } from '../plugins/widget_registry.js';
import type { Program } from '../program.js';

/** What a pass may reach. Deliberately narrow: no clock, no filesystem, no randomness. */
export interface PassContext {
  /** Records a finding. */
  report(diagnostic: Diagnostic): void;

  /**
   * What the loaded adapters know about widgets — **metadata, never behaviour**.
   *
   * A pass asks `slotsOf(widget)` and gets an answer. It cannot ask an adapter to *do* anything, because
   * the SPI gives an adapter nothing to do — which is what stops a normalization pass from learning the
   * word `Scaffold` and taking the whole pipeline down to one framework with it.
   *
   * Empty when no adapters are loaded. A pass that needs the catalog and does not have it does less, and
   * says so; it never guesses.
   */
  readonly widgets: WidgetRegistry;
}

/**
 * An analysis a pass may depend on, and which a pass may invalidate.
 *
 * Named in Spec §3.3: N11 `requires: nav-graph` and `invalidates: nav-graph, reactivity-graph`. The
 * pass manager uses these to reject a pipeline whose order cannot satisfy them — a pass that runs
 * before the analysis it needs is a pass that silently does nothing.
 */
export type Analysis = 'nav-graph' | 'reactivity-graph' | 'layout-boundedness';

/** One normalization pass. Pure, deterministic, idempotent. */
export interface Pass {
  /** `N1`… `N11`. The spec's numbering, and it never changes. */
  readonly id: string;

  /** The spec's name: `desugar-cascades`, `promote-cross-route-state`. */
  readonly name: string;

  /** Passes that must have run first. */
  readonly requires: readonly string[];

  /** Analyses that must be current when this pass runs. */
  readonly requiresAnalyses: readonly Analysis[];

  /** Analyses this pass computes, making them current. */
  readonly produces: readonly Analysis[];

  /** Analyses this pass makes stale. */
  readonly invalidates: readonly Analysis[];

  /**
   * Whether this build implements the pass.
   *
   * The same discipline the analyzer's stages use, for the same reason: a pipeline that silently skips
   * a pass it has not built produces output that *looks* normalized. The pass manager refuses to run a
   * pipeline with a hole in it rather than hand a downstream stage a program that is not what it
   * claims to be.
   */
  readonly implemented: boolean;

  /** Runs the pass. */
  run(program: Program, context: PassContext): Program;
}

/** Every node in [program], including those nested inside other nodes. */
export function walk(program: Program): readonly AnyUirNode[] {
  const out: AnyUirNode[] = [];
  for (const node of program.nodes) collect(node, out);
  return out;
}

/**
 * Every node in [value], depth first, the node itself before its children.
 *
 * **Not a generator, and that is a measured decision.** These were `function*`, and `yield*` delegation
 * costs O(depth) *per yielded node* — every value is re-yielded up through the whole generator stack it
 * came from. On the deepest corpus app that made one traversal 31.8 ms where the identical visit set
 * costs 3.5 ms eagerly: a 9× tax, paid eleven times over, once per pass.
 *
 * The visit set and its order are exactly what the generators produced. The only thing given up is
 * laziness, and no caller was lazy: every one of them drains the whole walk.
 */
export function walkNode(value: unknown): readonly AnyUirNode[] {
  const out: AnyUirNode[] = [];
  collect(value, out);
  return out;
}

/** Appends every node in [value] to [out], depth first, the node before its children. */
function collect(value: unknown, out: AnyUirNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (typeof record['kind'] === 'string' && typeof record['id'] === 'string') {
    out.push(record as unknown as AnyUirNode);
  }
  for (const nested of Object.values(record)) collect(nested, out);
}
