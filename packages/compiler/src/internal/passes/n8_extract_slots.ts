// N8 — extract-slots.
//
// **Verification first, rewrite second** — the contract N2/N3/N4 already carry, for the same reason.
//
// The Flutter frontend already produces canonical slots and ordered children: extraction has the
// resolved scope, the resolved types, and (since M2-T10A) the same generated widget catalog this pass
// reads. So for a canonical program N8 **verifies and returns the identical Program object**. It
// allocates nothing and rewrites nothing.
//
// It is not deleted for that, and the reason matters: deleting it would make the pipeline's shape depend
// on which frontend fed it. A SwiftUI or React frontend may leave named children un-lifted, and it must
// be normalized by the *same* eleven passes — or the pass numbering means nothing across frontends and
// the IR is not universal.
//
// ## What it verifies
//
// The invariants every later pass and every generator is written against:
//
//   1. no ordered widget list is buried inside `props`;
//   2. every slot a widget carries is one the catalog declares for it;
//   3. no name is assigned as both a slot and a prop;
//   4. there is exactly one ordered children collection.
//
// ## What it will rewrite, and what it refuses to
//
// **It rewrites** a `UiNode` sitting in `slots` under the name the catalog calls that widget's *children*
// property. That node is already a `UiNode` — moving it into `children` loses nothing, and the catalog
// says exactly where it belongs. A frontend that treats every named child as a slot (which ours did,
// before M2-T10A) produces exactly this.
//
// **It refuses** to rebuild elements from expressions. A widget list buried in `props` is a
// `bind.Expr(logic.ListLit[logic.New, …])` — a list of *expressions*. Turning those into `ui.Element`s
// means re-doing the binding classification (`bind.Const` vs `bind.Signal` vs `bind.Param`), and that
// needs the resolved scope, which exists only in the analyzer. N8 could only wrap every prop in
// `bind.Expr`: nothing constant, so it re-renders forever; nothing reactive, so it never updates. It
// would *look* like a fix. So it reports (`BRG2110`) and leaves the program exactly as it found it.
//
// This pass contains no widget names. Every fact comes from `context.widgets`.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import { Program } from '../program.js';
import type { WidgetRef } from '../plugins/widget_registry.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';
import { mapTree } from '../normalize/tree.js';

export class N8ExtractSlots implements Pass {
  readonly id = 'N8';
  readonly name = 'extract-slots';

  /** After N7: a wrapper that flattened away has no slots left to verify. */
  readonly requires: readonly string[] = ['N7'];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const replacements = new Map<NodeId, AnyUirNode>();

    for (const node of program.nodes) {
      const next = mapTree(node, {
        node: (n) => (n['kind'] === 'ui.Element' ? check(n, context) : undefined),
      });
      if (next !== node) replacements.set(node.id, next as AnyUirNode);
    }

    // `with` returns the same object when nothing was replaced. For a canonical Flutter program that is
    // the whole of N8: it looked, it found nothing to do, and it handed back what it was given.
    return program.with(replacements);
  }
}

/** Verifies one element, and returns a rewritten one if — and only if — it can do so without loss. */
function check(
  element: Record<string, unknown>,
  context: PassContext,
): Record<string, unknown> | undefined {
  const component = element['component'] as { name?: unknown; library?: unknown } | undefined;
  if (typeof component?.name !== 'string') return undefined;

  const widget: WidgetRef = {
    name: component.name,
    ...(typeof component.library === 'string' ? { library: component.library } : {}),
  };

  const slots = asRecord(element['slots']);
  const props = asRecord(element['props']);
  const children = Array.isArray(element['children']) ? element['children'] : [];
  const id = element['id'] as string;

  // ── 1. A name assigned as both a slot and a prop. ──
  //
  // Nothing in the schema forbids it, and it is meaningless: the generator would have to render the
  // same parameter twice, as two different things.
  for (const name of Object.keys(slots).sort()) {
    if (name in props) {
      context.report({
        code: 'BRG2111',
        severity: 'error',
        nodeId: id,
        message:
          `\`${component.name}\` assigns \`${name}\` as both a slot and a prop. One parameter cannot ` +
          `be both a child and a value, and a generator would have to render it twice.`,
      });
    }
  }

  // ── 2. A slot the catalog does not declare for this widget. ──
  //
  // Only asked of a widget the catalog *knows*. An application's own widget is not in anybody's Material
  // catalog, and a `SeparatedRow` with a `header` slot is not a violation — it is a widget we have no
  // metadata for, which is a different thing entirely, and it is silent.
  const known = context.widgets.specOf(widget);
  if (known !== undefined) {
    const declared = new Set(known.slots ?? []);
    for (const name of Object.keys(slots).sort()) {
      if (name === known.childrenProp) continue;
      if (declared.has(name)) continue;

      context.report({
        code: 'BRG2112',
        severity: 'warning',
        nodeId: id,
        message:
          `The catalog does not declare \`${name}\` as a slot of \`${component.name}\`. Either the ` +
          `frontend produced a child the catalog has never heard of, or the catalog is incomplete — ` +
          `and a generator will have to guess where it goes.`,
      });
    }
  }

  // ── 3. An ordered widget list buried in props. ──
  //
  // The invariant that cost a milestone. It cannot be repaired here — see the file header — so it is
  // named, and the program is left exactly as it was found.
  for (const name of Object.keys(props).sort()) {
    if (!isWidgetList(props[name])) continue;

    context.report({
      code: 'BRG2110',
      severity: 'error',
      nodeId: id,
      message:
        `\`${component.name}.${name}\` holds a list of widgets inside \`props\`, as an expression. ` +
        `No pass and no generator can see those as UI. It cannot be repaired here: rebuilding elements ` +
        `from expressions loses the const/signal/param classification of every prop, which needs the ` +
        `resolved scope and exists only in the frontend. ` +
        `Most often the **catalog** is what is missing, not the frontend: extraction asks the catalog for ` +
        `a widget's children property first and only falls back to inferring one from the argument's type, ` +
        `and that fallback correctly declines when the list's element type is not itself a widget. ` +
        `Declaring \`childrenProp: "${name}"\` for \`${component.name}\` is what puts them in the tree.`,
    });
  }

  // ── 4. The lossless rewrite: a UiNode slotted under the widget's CHILDREN property. ──
  //
  // The catalog says `slivers` is `CustomScrollView`'s ordered children. A frontend that treated every
  // named child as a slot put it in `slots`. The node is already a `UiNode`; moving it loses nothing,
  // and the catalog says exactly where it belongs.
  const childrenProp = known?.childrenProp;
  if (childrenProp === undefined || !(childrenProp in slots)) return undefined;

  if (children.length > 0) {
    // Two ordered children collections, and no way to know which comes first. Ordering is semantic — it
    // is the order they appear on screen — so a guess here is a guess about what the user sees.
    context.report({
      code: 'BRG2113',
      severity: 'error',
      nodeId: id,
      message:
        `\`${component.name}\` has children in both \`children\` and the slot \`${childrenProp}\`, ` +
        `which the catalog calls its children property. Which comes first is not recoverable, and child ` +
        `order is what the user sees.`,
    });
    return undefined;
  }

  const { [childrenProp]: lifted, ...rest } = slots;

  return {
    ...element,
    // The element keeps its id: it is the same element, with its children where they belong. Re-minting
    // it would orphan every override anchor that addresses it.
    children: [lifted],
    ...(Object.keys(rest).length > 0 ? { slots: rest } : { slots: undefined }),
  };
}

/**
 * Whether a binding holds a list of widgets.
 *
 * A `bind.Expr` wrapping a `logic.ListLit` whose elements are all constructor calls. That is what a
 * widget list looks like once it has fallen into `props` — and what it looks like is *exactly* the
 * problem: it is a list of expressions, not of `UiNode`s.
 */
function isWidgetList(binding: unknown): boolean {
  if (binding === null || typeof binding !== 'object') return false;

  const expr = (binding as Record<string, unknown>)['expr'];
  if (expr === null || typeof expr !== 'object') return false;

  const literal = expr as Record<string, unknown>;
  if (literal['kind'] !== 'logic.ListLit') return false;

  const elements = literal['elements'];
  return (
    Array.isArray(elements) &&
    elements.length > 0 &&
    elements.every(
      (e) => e !== null && typeof e === 'object' && (e as Record<string, unknown>)['kind'] === 'logic.New',
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
