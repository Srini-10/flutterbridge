// N1 — desugar-cascades.
//
// A Dart cascade (`obj..a = 1..b = 2`) is a sequence of writes to one receiver, written as one
// expression. There is no UIR node for it, and there should not be: it is Dart syntax, not a semantic
// idea, and a React generator has no use for the concept.
//
// **Normalize if necessary, otherwise verify.** The Flutter frontend does not desugar cascades — it
// emits `logic.OpaqueExpr{reason: 'cascade'}` (M1-T8) — and this pass is where they would be rewritten
// into a sequence of `logic.Assign`s. Rewriting an *opaque* node means recovering structure from a
// source string, which the UIR deliberately cannot do.
//
// So what this pass does today is **name the loss**. A cascade that reached normalization is a cascade
// the frontend could not model, and it will reach the generator as opaque source. That is a real,
// visible gap — 36 of them across the C1 corpus — and it belongs in the diagnostics, not in a comment.
//
// The pass is a rewrite the moment a frontend gives it something to rewrite: an `Expr` shaped like a
// cascade rather than an opaque blob. Nothing about it is Flutter-specific.

import type { AnyUirNode } from '@bridge/uir';

import type { Program } from '../program.js';
import { walk, type Analysis, type Pass, type PassContext } from '../normalize/pass.js';

export class N1DesugarCascades implements Pass {
  readonly id = 'N1';
  readonly name = 'desugar-cascades';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    for (const node of walk(program)) {
      if (!isOpaqueCascade(node)) continue;

      context.report({
        code: 'BRG2101',
        severity: 'warning',
        nodeId: node.id,
        message:
          `A cascade reached normalization as an opaque expression, so it cannot be desugared into ` +
          `assignments. It will reach the generator as Dart source text, which no generator can ` +
          `compile. The frontend must model it, or an override must supply it.`,
      });
    }

    // Nothing was rewritten. Returning the same object is the contract: it is how the pass manager
    // knows the pass changed nothing, and how the pipeline's fixed point is checked at all.
    return program;
  }
}

function isOpaqueCascade(node: AnyUirNode): boolean {
  return node.kind === 'logic.OpaqueExpr' && node.reason === 'cascade';
}
