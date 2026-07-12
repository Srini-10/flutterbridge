// N9 — key-inference.
//
// A repeated subtree needs a **key**: it is how a reconciler tells one item from another across a
// re-render. Without one, every URL-routed target falls back to the item's *index* — and an index is
// not an identity. Delete the first row of a keyless list and every row below it silently inherits the
// state of the row that used to be beneath it: a checked checkbox moves, focus jumps, an animation
// plays on the wrong element.
//
// ## What it will infer, and what it will not
//
// **It infers nothing from position.** An index-derived key is worse than no key: it *looks* like an
// identity and is not, so it silences the generator's own fallback warning while providing none of the
// safety.
//
// The one inference it makes is not really an inference at all — it is a **lift**. If a `ui.List`'s
// template already carries a key (`for (item in items) Tile(key: ValueKey(item.id))`), that key is
// per-item by construction: the author wrote it, it is evaluated once per item, and it is exactly what
// the list needs. N9 lifts it from the template's root onto the `ui.List` itself, where a generator
// reads it. Nothing is invented; a fact already in the program is moved to where the contract says it
// lives.
//
// **Everything else keeps no key**, and says so (`BRG2114`, info). A `ui.List` whose template has no
// key has no stable identity anywhere in the program, and the compiler will not manufacture one.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import { Program } from '../program.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';
import { mapTree } from '../normalize/tree.js';

export class N9KeyInference implements Pass {
  readonly id = 'N9';
  readonly name = 'key-inference';

  /** After N8: a template that was still sitting in a slot is not a template yet. */
  readonly requires: readonly string[] = ['N8'];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const replacements = new Map<NodeId, AnyUirNode>();

    for (const node of program.nodes) {
      const next = mapTree(node, {
        node: (n) => (n['kind'] === 'ui.List' ? keyed(n, context) : undefined),
      });
      if (next !== node) replacements.set(node.id, next as AnyUirNode);
    }

    return program.with(replacements);
  }
}

/** A `ui.List` with its key lifted from its template, or undefined if there is nothing to lift. */
function keyed(list: Record<string, unknown>, context: PassContext): Record<string, unknown> | undefined {
  // Already keyed. The author said what identity is, and nothing here improves on that.
  if (list['key'] !== undefined) return undefined;

  const template = list['template'];
  const key =
    template !== null && typeof template === 'object'
      ? (template as Record<string, unknown>)['key']
      : undefined;

  if (key === undefined) {
    context.report({
      code: 'BRG2114',
      severity: 'info',
      nodeId: list['id'] as string,
      message:
        'This list has no key, and none can be inferred: nothing in the program states what identifies ' +
        'one item from another. A generator will fall back to the item index — which is not an identity, ' +
        'and reorders state when the list changes. Give the template a key.',
    });
    return undefined;
  }

  // The list keeps its id. It is the same list, now saying out loud what its template already said.
  return { ...list, key };
}
