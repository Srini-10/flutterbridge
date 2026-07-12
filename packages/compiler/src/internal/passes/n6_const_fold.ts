// N6 — const-fold.
//
// Evaluates what can be evaluated now, so that nothing downstream has to evaluate it at runtime.
//
//     bind.Expr( Binary{ '+', Lit 8, Lit 4 } )   ->   bind.Const( 12 )
//
// ## Why a *compiler* pass and not a generator convenience
//
// A `bind.Expr` and a `bind.Const` are not two spellings of one thing (M1-T8, binding_extractor):
//
// * a **`bind.Const`** is emitted inline and **never subscribed to** — it cannot change, so nothing
//   re-renders for it;
// * a **`bind.Expr`** is an expression the generator must evaluate, and — depending on what it reads —
//   possibly re-evaluate.
//
// So folding `EdgeInsets.all(8 + 4)` is not cosmetic tidying. It moves a value out of the reactive
// graph entirely. Every constant left unfolded is a runtime evaluation, and in a widget tree that is a
// runtime evaluation *per render*.
//
// ## What it will not do
//
// **It never folds something whose value it is not certain of.** `1 / 3` is folded (IEEE-754 is exact
// and specified); `a + b` where either operand is a signal is not folded at all. Division by zero is
// left alone — Dart's `1 ~/ 0` throws and JavaScript's `1 / 0` is `Infinity`, and a compiler that
// silently picks one has changed the program.
//
// Nothing here is Flutter-specific, or Dart-specific: it folds `logic.Binary` and `logic.Unary` over
// `logic.Lit`, which every frontend produces.

import { nodeIdOfContent, type AnyUirNode, type NodeId } from '@bridge/uir';

import { Program } from '../program.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';
import { mapTree } from '../normalize/tree.js';

export class N6ConstFold implements Pass {
  readonly id = 'N6';
  readonly name = 'const-fold';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const replacements = new Map<NodeId, AnyUirNode>();

    for (const node of program.nodes) {
      const next = mapTree(node, { node: (n) => foldNode(n, context) });
      if (next !== node) replacements.set(node.id, next as AnyUirNode);
    }

    return program.with(replacements);
  }
}

/** The node [node] folds to, or undefined if it does not fold. */
function foldNode(
  node: Record<string, unknown>,
  context: PassContext,
): Record<string, unknown> | undefined {
  switch (node['kind']) {
    case 'logic.Binary':
      return foldBinary(node, context);
    case 'logic.Unary':
      return foldUnary(node);
    case 'bind.Expr':
      return foldBinding(node);
    default:
      return undefined;
  }
}

/**
 * A `bind.Expr` whose expression is a literal is a **constant binding**.
 *
 * This is the fold that matters. It takes the value out of the reactive graph: a `bind.Const` is
 * emitted inline and never subscribed to, so nothing re-renders for it — ever.
 */
function foldBinding(node: Record<string, unknown>): Record<string, unknown> | undefined {
  const expr = node['expr'] as Record<string, unknown> | undefined;
  if (expr?.['kind'] !== 'logic.Lit') return undefined;

  // A `logic.Lit` with no `value` is the null literal — and `bind.Const.value` is *required*, while
  // canonical JSON omits nulls (§A15). So a null constant has no `bind.Const` form, and it stays a
  // `bind.Expr(Lit)` — which is exactly the workaround ISSUE-14 records, and exactly why folding it
  // would produce a node the schema rejects (BRG1204).
  if (!('value' in expr)) return undefined;

  return {
    kind: 'bind.Const',
    id: node['id'],
    span: node['span'],
    value: expr['value'],
    ...(node['anchor'] !== undefined ? { anchor: node['anchor'] } : {}),
  };
}

/** Arithmetic and comparison over two literals. */
function foldBinary(
  node: Record<string, unknown>,
  context: PassContext,
): Record<string, unknown> | undefined {
  const left = literalOf(node['left']);
  const right = literalOf(node['right']);
  if (left === undefined || right === undefined) return undefined;

  const operator = node['operator'];
  if (typeof operator !== 'string') return undefined;

  const value = evaluate(operator, left, right, node, context);
  if (value === undefined) return undefined;

  return literal(value, node);
}

/** `-x`, `!x` over a literal. */
function foldUnary(node: Record<string, unknown>): Record<string, unknown> | undefined {
  const operand = literalOf(node['operand']);
  if (operand === undefined) return undefined;

  const operator = node['operator'];
  if (operator === '-' && typeof operand === 'number') return literal(-operand, node);
  if (operator === '!' && typeof operand === 'boolean') return literal(!operand, node);
  return undefined;
}

/**
 * The value of `left <op> right`, or undefined if it is not one this pass is certain of.
 *
 * Undefined is the *safe* answer, and it is the one taken whenever there is any doubt at all. A
 * compiler that folds a thing it is not sure about has not optimized the program; it has replaced it.
 */
function evaluate(
  operator: string,
  left: string | number | boolean,
  right: string | number | boolean,
  node: Record<string, unknown>,
  context: PassContext,
): string | number | boolean | undefined {
  if (typeof left === 'number' && typeof right === 'number') {
    switch (operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        // Left alone. Dart's `1 ~/ 0` throws; JavaScript's `1 / 0` is Infinity; and §A15 prohibits
        // Infinity from canonical form outright. A compiler that picks one of those has changed the
        // program — so it declines, and the runtime does whatever the runtime does.
        if (right === 0) {
          context.report({
            code: 'BRG2106',
            severity: 'info',
            nodeId: node['id'] as string,
            message:
              'A constant division by zero is not folded. What it evaluates to differs between ' +
              'targets, and infinity has no canonical form (§A15) — so the compiler leaves the ' +
              'program saying exactly what it said.',
          });
          return undefined;
        }
        return left / right;
      case '%':
        // Dart's `%` is always non-negative for a positive divisor; JavaScript's is not. Folding it
        // would bake one language's answer into a target-neutral IR.
        return undefined;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      default:
        return undefined;
    }
  }

  if (typeof left === 'string' && typeof right === 'string') {
    switch (operator) {
      case '+':
        return left + right;
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      default:
        return undefined;
    }
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    switch (operator) {
      case '&&':
        return left && right;
      case '||':
        return left || right;
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      default:
        return undefined;
    }
  }

  // Mixed types. `1 == '1'` means different things in different languages, and none of them is a thing
  // this compiler is willing to decide on the user's behalf.
  return undefined;
}

/** The literal value of [value], if it is a `logic.Lit` carrying one. */
function literalOf(value: unknown): string | number | boolean | undefined {
  if (value === null || typeof value !== 'object') return undefined;

  const node = value as Record<string, unknown>;
  if (node['kind'] !== 'logic.Lit') return undefined;

  const literal = node['value'];
  return typeof literal === 'string' || typeof literal === 'number' || typeof literal === 'boolean'
    ? literal
    : undefined;
}

/** A `logic.Lit` carrying [value], keeping [from]'s span and taking a freshly minted id. */
function literal(value: string | number | boolean, from: Record<string, unknown>): Record<string, unknown> {
  // A new id, because it is a **new node**: `8 + 4` and `12` are different content, and content is what
  // an id is a hash of (§A16). Keeping the old id would give one id two meanings — the failure mode
  // content addressing exists to prevent.
  const content = {
    kind: 'logic.Lit',
    value,
    type: typeOf(value, from),
  };

  return { ...content, id: nodeIdOfContent(content), span: from['span'] };
}

/**
 * The type of a folded value.
 *
 * Taken from the node that was folded, when it still fits — `int + int` is an `int`, and the `Binary`
 * already said so. A comparison is a `bool` whatever its operands were.
 */
function typeOf(value: string | number | boolean, from: Record<string, unknown>): unknown {
  if (typeof value === 'boolean') return { name: 'bool' };
  const declared = from['type'];
  if (declared !== undefined) return declared;
  return typeof value === 'string' ? { name: 'String' } : { name: 'num' };
}
