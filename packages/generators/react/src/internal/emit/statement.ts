// The statement emitter — `logic.*` Stmt → TypeScript.
//
// The other half of ADR-19's "behaviour is closures": an action's body is `readonly Stmt[]`, and it becomes
// real TypeScript here so the runtime never has to interpret it.
//
// Statements are less treacherous than expressions — a `for` is a `for` in both languages — with one
// exception that matters, `logic.Switch`, documented at its case. The rule is the same: anything without a
// faithful lowering is reported (`BRG3003`), never approximated.

import type { Stmt } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { emitExpression, setStatementLowering, type EmitScope } from './expression.js';
import { identifierOf } from './module.js';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

function asArray(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

/**
 * Lowers a statement list to lines of TypeScript.
 *
 * @param statements - the `logic.*` statement nodes, in order.
 * @param scope - what is in scope, and where to report.
 * @returns the lines, unindented. The caller places them.
 */
export function emitStatements(statements: unknown, scope: EmitScope): string[] {
  return asArray(statements).flatMap((statement) => emitStatement(statement, scope));
}

/** Lowers one statement. Returns its lines; a block returns several. */
export function emitStatement(statement: Stmt | Node | undefined, scope: EmitScope): string[] {
  if (statement === undefined || statement === null) return [];
  const node = statement as Node;

  switch (kindOf(node)) {
    case 'logic.ExprStmt':
      return [`${emitExpression(node['expr'] as Node, scope)};`];

    case 'logic.VarDecl': {
      const name = identifierOf(String(node['name'] ?? '_'));
      const initializer = node['initializer'];
      // Dart's `final` is `const`; a reassignable local is `let`. `var` is never emitted — it has function
      // scope, which is not what any Dart local means. A `final` with no initializer cannot be `const`.
      const keyword = node['isFinal'] === true ? 'const' : 'let';
      if (initializer === undefined) return [`let ${name};`];
      return [`${keyword} ${name} = ${emitExpression(initializer as Node, scope)};`];
    }

    case 'logic.Return': {
      const value = node['value'];
      return value === undefined ? ['return;'] : [`return ${emitExpression(value as Node, scope)};`];
    }

    case 'logic.If': {
      const lines = [`if (${emitExpression(node['test'] as Node, scope)}) {`];
      lines.push(...indent(emitStatement(node['then'] as Node, scope)));
      const otherwise = node['otherwise'];
      if (otherwise === undefined) {
        lines.push('}');
      } else {
        lines.push('} else {');
        lines.push(...indent(emitStatement(otherwise as Node, scope)));
        lines.push('}');
      }
      return lines;
    }

    case 'logic.Block':
      return emitStatements(node['statements'], scope);

    case 'logic.While': {
      const body = indent(emitStatement(node['body'] as Node, scope));
      const test = emitExpression(node['test'] as Node, scope);
      // `do { } while (t)` runs its body once before testing; emitting it as a `while` would skip that first
      // run whenever the test starts false.
      if (node['isDoWhile'] === true) return ['do {', ...body, `} while (${test});`];
      return [`while (${test}) {`, ...body, '}'];
    }

    case 'logic.For': {
      // Dart's `for (final x in xs)` and C-style `for` are both `logic.For`; which one is decided by whether
      // there is an iterable.
      const iterable = node['iterable'];
      if (iterable !== undefined) {
        const variable = identifierOf(String(node['loopVariable'] ?? '_'));
        const lines = [`for (const ${variable} of ${emitExpression(iterable as Node, scope)}) {`];
        lines.push(...indent(emitStatement(node['body'] as Node, scope)));
        lines.push('}');
        return lines;
      }
      const init = node['init'] === undefined ? '' : emitStatement(node['init'] as Node, scope).join(' ');
      const condition = node['test'] === undefined ? '' : emitExpression(node['test'] as Node, scope);
      const update = node['update'] === undefined ? '' : emitExpression(node['update'] as Node, scope);
      const lines = [`for (${init.replace(/;$/, '')}; ${condition}; ${update}) {`];
      lines.push(...indent(emitStatement(node['body'] as Node, scope)));
      lines.push('}');
      return lines;
    }

    case 'logic.Break':
      return ['break;'];

    case 'logic.Continue':
      return ['continue;'];

    case 'logic.Throw':
      return [`throw ${emitExpression(node['value'] as Node, scope)};`];

    case 'logic.TryCatch': {
      const lines = ['try {'];
      lines.push(...indent(emitStatement(node['body'] as Node, scope)));
      const clauses = asArray(node['catches']);
      if (clauses.length === 0) {
        lines.push('} catch {');
      } else {
        // Dart dispatches catch clauses on the exception's *type*; JavaScript has one catch block. One clause
        // lowers exactly; several would need a type test per clause, and Dart's type test is not `instanceof`
        // for every type. Rather than emit a chain that is right for classes and wrong for everything else,
        // the extra clauses are reported.
        const first = clauses[0] as Node;
        const binding = identifierOf(String(first['exception'] ?? 'error'));
        lines.push(`} catch (${binding}) {`);
        lines.push(...indent(emitStatement(first['body'] as Node, scope)));
        if (clauses.length > 1) {
          scope.report(
            GeneratorDiagnosticCode.UnsupportedStatement,
            'error',
            `this try/catch has ${clauses.length} typed catch clauses. Dart dispatches them on the ` +
              `exception's type; JavaScript has one catch block, and Dart's type test is not \`instanceof\` ` +
              `for every type. Only the first clause is lowered — the rest need an override.`,
            idOf(node),
          );
        }
      }
      const finallyBlock = node['finallyBlock'];
      if (finallyBlock !== undefined) {
        lines.push('} finally {');
        lines.push(...indent(emitStatement(finallyBlock as Node, scope)));
      }
      lines.push('}');
      return lines;
    }

    case 'logic.Switch': {
      // Dart's `switch` does not fall through — a non-empty case without `break` is a compile error in Dart,
      // and every case ends implicitly. JavaScript falls through by default. So `break;` is emitted at the end
      // of every case that does not already leave: omitting it turns one branch into all the branches below
      // it, which runs code the author never wrote and produces no error anywhere.
      const lines = [`switch (${emitExpression(node['subject'] as Node, scope)}) {`];
      for (const entry of asArray(node['cases'])) {
        const item = entry as Node;
        const test = item['value'];
        lines.push(`  case ${emitExpression(test as Node, scope)}: {`);
        const body = emitStatements(item['body'], scope);
        lines.push(...indent(indent(body)));
        if (!leaves(body)) lines.push('    break;');
        lines.push('  }');
      }
      const fallback = node['defaultCase'] ?? node['default'];
      if (fallback !== undefined) {
        lines.push('  default: {');
        lines.push(...indent(indent(emitStatements(fallback, scope))));
        lines.push('  }');
      }
      lines.push('}');
      return lines;
    }

    case 'logic.OpaqueStmt': {
      const source = typeof node['source'] === 'string' ? node['source'] : '<unknown>';
      scope.report(
        GeneratorDiagnosticCode.OpaqueConstruct,
        'error',
        `\`${source}\` has no UIR representation and reached the generator as opaque source (INV-4). ` +
          `Lowering it would mean guessing what it does; it needs an override.`,
        idOf(node),
      );
      return [];
    }

    case 'logic.Navigate': {
      // ADR-0025 D2. The analyzer replaced the framework call with this node, so the generator lowers a
      // *stack effect* and never learns which package the author wrote — a `go_router` `context.go` and
      // a `Navigator.pushNamed` arrive identically. That is the property ADR-0025 §5 exists to protect.
      const action = String(node['action'] ?? '');
      const router = scope.routerLocal;
      if (router === undefined) {
        // The component emitter declares the router whenever the component contains one of these, so
        // this is unreachable from a whole component and reachable only if a `logic.Navigate` is lowered
        // outside one. Reported rather than assumed away: emitting `undefined.pop()` would be a runtime
        // crash on click, which is the failure mode this project refuses to ship.
        scope.report(
          GeneratorDiagnosticCode.UnresolvedReference,
          'error',
          'a navigation is lowered outside a component, so there is no router in scope for it. The ' +
            'router is declared per component; a navigation reached this generator from somewhere that ' +
            'has none.',
          idOf(node),
        );
        return [];
      }

      switch (action) {
        case 'pop':
          return [`${router}.pop();`];
        default:
          // `push`, `replace` and `popUntil` are modelled by the schema and not lowered yet — a push
          // needs its `transition` resolved to a destination, and `popUntil` carries no predicate
          // (ADR-0025 D2 says so explicitly). Named precisely rather than left to the generic statement
          // refusal below, because M6-E's finding was that a navigation refusal must say which
          // capability is missing and who owns it, and a new node kind is not a licence to stop.
          scope.report(
            GeneratorDiagnosticCode.UnsupportedCapability,
            'error',
            `a \`${action}\` navigation reaches this generator as a \`logic.Navigate\` (ADR-0025 D2) ` +
              'and is not lowered yet. The runtime kit already performs it — `useRouter()` exposes ' +
              '`push`, `replace` and `pop` — so the remaining work is resolving the transition this ' +
              'node names to a destination the router can take. That belongs to this generator, and no ' +
              'part of it belongs to your program.',
            idOf(node),
          );
          return [];
      }
    }

    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedStatement,
        'error',
        `\`${kindOf(node)}\` has no lowering in this generator`,
        idOf(node),
      );
      return [];
  }
}

/** Whether a lowered block already leaves, so an added `break` would be unreachable. */
function leaves(lines: readonly string[]): boolean {
  const last = lines[lines.length - 1]?.trim() ?? '';
  return last.startsWith('return') || last.startsWith('throw') || last === 'break;' || last === 'continue;';
}

function indent(lines: readonly string[]): string[] {
  return lines.map((line) => (line === '' ? '' : `  ${line}`));
}

// Hands the statement emitter to the expression emitter, which needs it for a lambda with a statement body
// and cannot import it without creating a cycle. See `setStatementLowering` for why the dependency runs this
// way round.
setStatementLowering((body, scope) => emitStatements(body, scope));
