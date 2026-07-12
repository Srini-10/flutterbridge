// N2 — desugar-collection-ctrl → `ui.Cond`.
//
// **A verification pass with an optional rewrite** (M2-T6 ruling).
//
// The Flutter frontend already emits `ui.Cond` for `if (x) Widget()` inside a `children:` list, and for
// a ternary between two widgets — because a collection-`if` in a widget list genuinely *is* a
// conditional subtree. There was nothing to desugar.
//
// The pass is not deleted for that, and the reason matters: deleting it would make the pipeline's shape
// depend on which frontend fed it. A SwiftUI or React frontend may well emit something less canonical,
// and it must be normalized by the *same* eleven passes, or the IR is not universal and the pass
// numbering means nothing across frontends.
//
// So the contract is: **ensure the transformation has happened.** Here, that means asserting the
// invariant every later pass and every generator is written against —
//
//   > conditional UI is a `ui.Cond`, never a conditional *expression* that happens to yield a widget.
//
// A `bind.Expr` wrapping a `logic.Conditional` whose branches are widgets is exactly the un-desugared
// form, and a generator handed one would emit a ternary that evaluates two subtrees instead of a branch
// that renders one.

import type { AnyUirNode } from '@bridge/uir';

import type { Program } from '../program.js';
import { walk, type Analysis, type Pass, type PassContext } from '../normalize/pass.js';

export class N2DesugarCollectionCtrl implements Pass {
  readonly id = 'N2';
  readonly name = 'desugar-collection-ctrl';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    for (const node of walk(program)) {
      const reason = unDesugared(node);
      if (reason === undefined) continue;

      context.report({
        code: 'BRG2102',
        severity: 'error',
        nodeId: node.id,
        message:
          `Conditional UI reached normalization un-desugared (${reason}). Every later pass and every ` +
          `generator is written against the invariant that a conditional subtree is a ui.Cond — one ` +
          `branch is rendered, not both evaluated. The frontend must emit ui.Cond.`,
      });
    }
    return program;
  }
}

/**
 * Why [node] is an un-desugared conditional **in a UI position**, or undefined if it is not one.
 *
 * A `ui.Opaque` — not a `logic.OpaqueExpr`. The distinction is the whole check, and getting it wrong
 * made this pass report four errors on compass_app and eight on wonderous that were not errors at all.
 *
 * A collection-`if` inside a *widget* list is conditional UI, and it must be a `ui.Cond`. A
 * collection-`if` inside a list of **strings** is a Dart expression that the UIR has no node for — it is
 * `logic.OpaqueExpr`, extraction already said so (BRG1302), and it has nothing to do with rendering. N2
 * flagging it was flagging data as if it were UI.
 */
function unDesugared(node: AnyUirNode): string | undefined {
  if (node.kind !== 'ui.Opaque') return undefined;
  return /collection-if|conditional/i.test(node.reason) ? node.reason : undefined;
}
