// N7 — flatten-wrappers.
//
// Removes structure that carries no meaning, so that nothing downstream has to carry it either.
//
// It runs **after N6** (`requires: ['N6']`), and that ordering is the whole point: N6 turns
// `bind.Expr(1 < 2)` into `bind.Const(true)`, and only then can N7 see that the `ui.Cond` guarding it
// has no decision left to make. Before const-folding, every branch looks live.
//
//     ui.Cond{ test: bind.Const(true), then: A, otherwise: B }   ->   A
//     logic.Block{ statements: [ logic.Block{ [s1, s2] } ] }     ->   logic.Block{ [s1, s2] }
//
// ## What it flattens, and why only these
//
// Everything here is **frontend- and target-neutral**. A `ui.Cond` whose condition is a constant has
// exactly one reachable branch in every language that has ever existed; a block inside a block is a
// block. Neither fact depends on Flutter, on React, or on Dart.
//
// ## Transparent wrappers, and how N7 flattens them without knowing what Flutter is
//
//     Container(child: X)      with no decoration, colour, padding, size, …   ->   X
//
// A `Container` with none of its own props set renders exactly its child: it exists because a developer
// needed somewhere to hang one. A generator that emits it produces a `<div>` for nothing, and a tree of
// them produces the div-soup that makes generated code look generated.
//
// But knowing *that* — and knowing that a `Center` with no props is **not** a pass-through, because its
// identity is its behaviour — is a fact about a widget catalog, i.e. about a framework. **N7 does not
// know it.** It asks the registry:
//
//     context.widgets.isTransparent(component, propsOf(element))
//
// and the registry answers from metadata an adapter declared, loaded at runtime by the plugin host. The
// word `Container` does not appear in this file, and the same pass normalizes a SwiftUI tree unchanged.
//
// A widget the registry has never heard of is **never transparent**. That is the safe default: guessing
// that a prop-less widget must be a pass-through is how a compiler silently deletes a layout.

import type { AnyUirNode, NodeId } from '@bridge/uir';

import { Program } from '../program.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';
import { mapTree } from '../normalize/tree.js';

export class N7FlattenWrappers implements Pass {
  readonly id = 'N7';
  readonly name = 'flatten-wrappers';

  /** N6 first: a branch cannot be seen to be dead until its condition has been folded to a constant. */
  readonly requires: readonly string[] = ['N6'];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const replacements = new Map<NodeId, AnyUirNode>();

    for (const node of program.nodes) {
      const next = mapTree(node, {
        node: (n) => collapse(n, context),
        prune: (item) => dropped(item, context),
        item: (item) => spliced(item),
      });
      if (next !== node) replacements.set(node.id, next as AnyUirNode);
    }

    return program.with(replacements);
  }
}

/**
 * A dead branch, dropped from its list before anything descends into it.
 *
 * A `ui.Cond` that is constantly false with no `otherwise` renders nothing, and nothing is only a legal
 * value inside a list — removing it from a *required* field (a `ui.Cond`'s own `then`) would produce a
 * node the schema rejects, so `collapse` leaves that case alone and this drops it here.
 *
 * It is a **prune**, not a rewrite, and the difference is visible to the user: the subtree is never
 * walked, so no pass reports anything about code that is about to stop existing. A diagnostic pointing
 * inside a branch that cannot render is worse than no diagnostic at all.
 */
function dropped(item: unknown, context: PassContext): readonly unknown[] | undefined {
  if (!isDeadBranch(item)) return undefined;

  report(item as Record<string, unknown>, false, context);
  return [];
}

/**
 * The statements a redundant `logic.Block` splices into its enclosing statement list.
 *
 * A block inside a statement list adds a scope and nothing else, and the UIR has no scopes. The Flutter
 * adapter's `setState` unwrap (INV-22) leaves one behind wherever it rewrote a non-block statement; this
 * is where it stops being visible at all.
 */
function spliced(item: unknown): readonly unknown[] | undefined {
  if (item === null || typeof item !== 'object') return undefined;

  const node = item as Record<string, unknown>;
  if (node['kind'] !== 'logic.Block') return undefined;

  // An absent `statements` is an empty block. It does nothing, in any language.
  const statements = node['statements'];
  return Array.isArray(statements) ? statements : [];
}

/** The node [node] collapses to, or undefined if it does not collapse. */
function collapse(node: Record<string, unknown>, context: PassContext): unknown | undefined {
  if (node['kind'] === 'ui.Element') return collapseElement(node, context);
  if (node['kind'] !== 'ui.Cond') return undefined;

  const value = constantTest(node);
  if (value === undefined) return undefined;

  const taken = value ? node['then'] : node['otherwise'];

  // Constantly false with no `otherwise`: it collapses to *nothing*, and nothing is only a legal value
  // inside a list. The list handler drops it there; here — where the Cond sits in a required field — it
  // is left alone, because a `ui.Cond` with no `then` is a node the schema rejects.
  if (taken === undefined) return undefined;

  report(node, value, context);
  return taken;
}

/**
 * The constant value of a `ui.Cond`'s test, or undefined if the test is not constant.
 *
 * A condition that is constantly true or false has **one reachable branch**. The unreachable one is
 * removed, not kept "just in case": carrying it forward means a generator emitting a branch that can
 * never run, a verifier screenshotting a state that cannot exist, and an override addressing an anchor
 * inside code that is not there.
 */
function constantTest(node: Record<string, unknown>): boolean | undefined {
  const test = node['test'] as Record<string, unknown> | undefined;
  if (test?.['kind'] !== 'bind.Const') return undefined;

  const value = test['value'];
  return typeof value === 'boolean' ? value : undefined;
}

/** Whether [value] is a `ui.Cond` that renders nothing at all. */
function isDeadBranch(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;

  const node = value as Record<string, unknown>;
  return (
    node['kind'] === 'ui.Cond' &&
    constantTest(node) === false &&
    node['otherwise'] === undefined
  );
}

function report(node: Record<string, unknown>, value: boolean, context: PassContext): void {
  context.report({
    code: 'BRG2107',
    severity: 'info',
    nodeId: node['id'] as string,
    message:
      `This condition is constantly ${value}, so the ${value ? 'else' : 'then'} branch can never ` +
      `render. It is removed rather than carried forward: a generator would otherwise emit a branch ` +
      `that cannot run, and an override could address an anchor inside code that is not there.`,
  });
}

/**
 * A `ui.Element` the registry calls a transparent wrapper collapses to its only child.
 *
 * Only when it really is a pass-through: exactly one child, no slots, no key, no semantics, no layout
 * intent, and none of the props the catalog says make it significant. Every one of those is something a
 * generator would have to emit, and a wrapper that carries one is not a wrapper — it is a widget.
 */
function collapseElement(
  node: Record<string, unknown>,
  context: PassContext,
): unknown | undefined {
  const children = node['children'];
  if (!Array.isArray(children) || children.length !== 1) return undefined;

  // Anything else the element carries is something the generator must render. A `Container` with a key
  // is addressable; one with semantics is announced to a screen reader; one with layout intent has been
  // measured. None of those survive being deleted.
  if (
    node['slots'] !== undefined ||
    node['key'] !== undefined ||
    node['semantics'] !== undefined ||
    node['layout'] !== undefined
  ) {
    return undefined;
  }

  const component = node['component'] as { name?: unknown; library?: unknown } | undefined;
  if (typeof component?.name !== 'string') return undefined;

  const props = node['props'];
  const propNames = props !== null && typeof props === 'object' ? Object.keys(props) : [];

  const widget = {
    name: component.name,
    ...(typeof component.library === 'string' ? { library: component.library } : {}),
  };
  if (!context.widgets.isTransparent(widget, propNames)) return undefined;

  context.report({
    code: 'BRG2109',
    severity: 'info',
    nodeId: node['id'] as string,
    message:
      `\`${component.name}\` carries none of the props that make it significant, so it renders exactly ` +
      `its child. It is removed: emitting it would produce an element that does nothing, and a tree of ` +
      `those is what makes generated code look generated.`,
  });

  return children[0];
}

