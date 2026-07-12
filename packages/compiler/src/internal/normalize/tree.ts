// The one tree rewrite.
//
// Every rewriting pass does the same thing: walk a node's children, rebuild the node if any of them
// changed, then give the node itself a chance to become something else. Five passes hand-rolled that,
// five times, and five copies of a traversal is five places for the *same-object-when-unchanged*
// contract to be broken subtly and independently — which is the contract the entire fixed-point check
// rests on (`manifest.changed` is an identity comparison, not a deep one).
//
// So it exists once, here, and the passes say only what is different about them.

/** What a pass wants done to a tree. */
export interface TreeVisitor {
  /**
   * Replaces an object node, or returns `undefined` to keep it.
   *
   * Called **bottom-up**: a node's children have already been visited, so `(1 + 2) * 3` folds the sum
   * before it is asked to fold the product, and an inner `ui.Cond` collapses before the outer one is
   * asked whether it can.
   */
  node?(node: Record<string, unknown>): unknown | undefined;

  /**
   * Drops or replaces an item inside a list **without descending into it**, or returns `undefined` to
   * visit it normally.
   *
   * Called *before* the item is visited, and that is the entire point: a subtree that is about to be
   * deleted must not be walked, because walking it means reporting diagnostics about code that will not
   * exist. A dead branch is not a warning — it is nothing.
   */
  prune?(item: unknown): readonly unknown[] | undefined;

  /**
   * Expands or drops an item inside a list *after* it has been visited, or returns `undefined` to keep
   * it as it is.
   *
   * Returning `[]` removes it; returning several splices them in. Together with `prune`, this is the
   * only place a node may vanish, and that is deliberate: a required field cannot hold "nothing", so a
   * node that collapses to nothing is only legal inside a list.
   */
  item?(item: unknown): readonly unknown[] | undefined;
}

/**
 * Rebuilds [value] through [visitor].
 *
 * **Returns the identical object when nothing changed.** Not a deep-equal copy — the same reference.
 * That is what makes "the pipeline reached a fixed point" a pointer comparison rather than a full
 * re-serialization, and it is why a pass that finds nothing to do costs nothing.
 */
export function mapTree(value: unknown, visitor: TreeVisitor): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out: unknown[] = [];

    for (const item of value) {
      const pruned = visitor.prune?.(item);
      if (pruned !== undefined) {
        out.push(...pruned);
        changed = true;
        continue;
      }

      const visited = mapTree(item, visitor);
      if (visited !== item) changed = true;

      const expanded = visitor.item?.(visited);
      if (expanded === undefined) {
        out.push(visited);
      } else {
        out.push(...expanded);
        changed = true;
      }
    }

    return changed ? out : value;
  }

  if (value === null || typeof value !== 'object') return value;

  let changed = false;
  const rebuilt: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const visited = mapTree(child, visitor);
    if (visited !== child) changed = true;
    rebuilt[key] = visited;
  }

  const current = changed ? rebuilt : (value as Record<string, unknown>);
  return visitor.node?.(current) ?? current;
}
