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
import { routeNameOf, screenKeyFor } from './routes.js';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

function asArray(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

/**
 * A C-style loop's own `init` clause — `let i = 0`, or, since M9-B, `let i = 0, j = 10` for several
 * declared variables.
 *
 * `logic.For.init` holds a single `logic.VarDecl` for one declared variable (unchanged since before
 * M9-B), or a `logic.Block` of several (M9-B) — the identical shape `logic.VarDecl` emission's own
 * sibling case already uses for an ordinary multi-declaration `VariableDeclarationStatement`. Both are
 * flattened to one `Node[]` here and emitted as one comma-separated declarator list under a single
 * `const`/`let` keyword — Dart's own grammar allows exactly one keyword per declaration list, so every
 * declaration in the list shares `isFinal`, and reading it from the first is sound for all of them.
 */
function initClauseOf(init: unknown, scope: EmitScope): string {
  if (init === undefined) return '';
  const node = init as Node;
  const decls = kindOf(node) === 'logic.Block' ? asArray(node['statements']) : [node];
  if (decls.length === 0) return '';
  const keyword = decls[0]!['isFinal'] === true ? 'const' : 'let';
  return `${keyword} ${decls.map((d) => declaratorOf(d, scope)).join(', ')}`;
}

/** One declarator inside a `let`/`const` declaration list — `name` alone, or `name = <expr>`. */
function declaratorOf(decl: Node, scope: EmitScope): string {
  const name = identifierOf(String(decl['name'] ?? '_'));
  const initializer = decl['initializer'];
  return initializer === undefined ? name : `${name} = ${emitExpression(initializer as Node, scope)}`;
}

/**
 * Whether `node` (a `logic.Switch` with no `default`/`defaultCase`) is structurally *provable* to be
 * exhaustive — every one of a single enum's own declared members is covered by exactly one case, and, if
 * the subject's own resolved type is nullable, a `null` case covers that too (M8-Y).
 *
 * Deliberately independent of *how* the switch was produced — this does not ask whether it came from
 * `switchExpressionAsReturn` (the analyzer has no such marker in `logic.Switch` itself, on purpose: doing
 * so would be a schema change M8-Y's own investigation found unnecessary). It re-derives the same proof
 * structurally, from the case set alone, so it is equally sound for a hypothetical future old-style
 * switch *statement* over a fully-covered enum — and it returns `false`, unchanged from this generator's
 * pre-M8-Y behaviour, for anything it cannot prove: a primitive-typed switch (`int`/`String`), a subset of
 * an enum's members, or a case whose `test` is not a resolvable enum-constant reference or a literal
 * `null`. A `false` here leaves the switch exactly as it always lowered — no `default`, no throw, no
 * claim of completeness this function could not verify.
 */
function isProvablyExhaustiveEnumSwitch(node: Node, scope: EmitScope): boolean {
  const cases = asArray(node['cases']);
  if (cases.length === 0) return false;

  let enumDeclId: string | undefined;
  const covered = new Set<string>();
  let hasNullCase = false;

  for (const entry of cases) {
    const test = entry['test'] as Node | undefined;
    if (test === undefined) return false;
    // A Dart `null` literal's own `value` field is absent from canonical JSON, not `null` — the
    // "absent, not null" convention this schema already uses elsewhere (a `default` case's own test is
    // absent the same way) — so `undefined` here means the literal `null`, not "no test at all".
    if (test['kind'] === 'logic.Lit' && (test['value'] === null || test['value'] === undefined)) {
      hasNullCase = true;
      continue;
    }
    if (test['kind'] !== 'logic.Ref' || typeof test['target'] !== 'string') return false;
    const target = test['target'];
    const declaration = scope.node(target) as unknown as Node | undefined;
    if (declaration === undefined || declaration['kind'] !== 'logic.EnumDecl') return false;
    if (enumDeclId === undefined) enumDeclId = target;
    else if (enumDeclId !== target) return false; // two different enums in one switch — not this proof's shape
    const name = typeof test['name'] === 'string' ? test['name'] : '';
    const member = name.split('.').at(-1) ?? '';
    if (member === '') return false;
    covered.add(member);
  }

  if (enumDeclId === undefined) return false;
  const declaration = scope.node(enumDeclId) as unknown as Node | undefined;
  const values = Array.isArray(declaration?.['values']) ? (declaration['values'] as unknown[]) : undefined;
  if (values === undefined) return false;
  const allMembers = new Set(values.filter((v): v is string => typeof v === 'string'));
  if (allMembers.size !== covered.size || [...allMembers].some((m) => !covered.has(m))) return false;

  const subjectType = (node['subject'] as Node | undefined)?.['type'] as Node | undefined;
  if (subjectType?.['nullable'] === true && !hasNullCase) return false;

  return true;
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
      const init = initClauseOf(node['init'], scope);
      const condition = node['test'] === undefined ? '' : emitExpression(node['test'] as Node, scope);
      // `update` is an *array* of expressions in the schema (Dart's own `for (...; ...; a, b)` admits a
      // comma-separated list) — not a single node. Passing the array straight to `emitExpression` treated
      // it as a malformed node with no `kind`, unconditionally hitting the `<unknown>` default case
      // (`BRG3002`) whenever a C-style loop had any update clause at all — a pre-existing defect M9-A
      // exposed while proving a classic-for build-proof end to end.
      const update = asArray(node['update']).map((u) => emitExpression(u, scope)).join(', ');
      const lines = [`for (${init}; ${condition}; ${update}) {`];
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
        // `exceptionDecl` (ADR-28, amended M8-S) is the declaration-tier identity a `logic.Ref` inside the
        // catch body resolves against via `localName` (populated by `localBindingsIn`, which walks this
        // whole body generically — no change needed there). The emitted identifier here MUST be computed
        // from the same `.name` that declaration carries, or a read that resolves to it would bind to a
        // different identifier than the one this line actually declares. `exceptionName` is the fallback
        // for a document without one (no exception parameter at all is the only remaining case, since the
        // analyzer now always emits both together).
        const exceptionDecl = first['exceptionDecl'] as Node | undefined;
        const exceptionName =
          exceptionDecl !== undefined ? String(exceptionDecl['name'] ?? 'error') : String(first['exceptionName'] ?? 'error');
        const binding = identifierOf(exceptionName);
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
      // `SwitchCase.test` (uir.ts) — read as `item['value']` until M8-Y found it: `logic.Switch` had no
      // real fixture or test exercising a non-empty case, so a case's own test always lowered to the
      // literal text `undefined` unnoticed.
      const lines = [`switch (${emitExpression(node['subject'] as Node, scope)}) {`];
      for (const entry of asArray(node['cases'])) {
        const item = entry as Node;
        const test = item['test'];
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
      } else if (isProvablyExhaustiveEnumSwitch(node, scope)) {
        // No case in the source names this, ever — Dart's own compiler already proved every member of
        // the enum is covered (§ below), the same proof `switchExpressionAsReturn` (M8-Y) relies on to
        // admit the switch at all. TypeScript cannot see that proof from a plain `switch`, so without a
        // `default` it infers an implicit `undefined` return on every call site — corrupting a caller
        // that expects `string` (`Text`'s own `children` prop, concretely). A `throw` here restates the
        // same exhaustiveness Dart already guarantees, in a form `tsc` can check; it is not a new
        // execution path a real program can reach, the same way a `default: assert(false)` in a
        // switch-on-a-closed-enum is idiomatic, unreachable-by-construction code in TypeScript generally.
        lines.push('  default: {');
        lines.push('    throw new Error(\'unreachable: every case of a closed enum was already covered\');');
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

      // A route overlay's own destination (M9-D) is not a page at all — `component.ts`'s own
      // `declareDialogHosts` already rendered it behind a ref, keyed by this same transition id, so
      // showing it is that ref's `show()`, never a router call. Checked *before* `router` is required
      // below: a component whose only navigation opens a dialog declares no router at all
      // (`needsRouter`), so requiring one first would refuse a program this generator now supports.
      if (action === 'push' || action === 'replace') {
        const transitionId = node['transition'];
        const transition =
          typeof transitionId === 'string' ? (scope.node(transitionId) as unknown as Node | undefined) : undefined;
        if (transition !== undefined && transition['inline'] !== undefined && typeof transitionId === 'string') {
          const dialogRef = scope.dialogRefFor?.(transitionId);
          if (dialogRef !== undefined) {
            return [`${dialogRef}.current?.show();`];
          }
        }
      }

      // A return proved to dismiss a specific presentation (M9-E, `logic.Navigate.dismisses`) closes that
      // ref rather than calling a router — the same check, same shape, same "before `router` is required"
      // reasoning as the push/replace case above, and for the identical reason: a component that only
      // ever dismisses a dialog (never pushes/pops a page) declares no router at all (`needsRouter`).
      if (action === 'pop') {
        const dismisses = node['dismisses'];
        if (typeof dismisses === 'string') {
          const dialogRef = scope.dialogRefFor?.(dismisses);
          if (dialogRef !== undefined) {
            return [`${dialogRef}.current?.close();`];
          }
        }
      }

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
        case 'push':
        case 'replace': {
          // The edge this performs, named by `NodeId` (M7-B). Resolved, never searched for: the analyzer
          // minted the transition's identity and put it here, so this is a lookup of a reference the
          // document already carries rather than a reconstruction of one.
          const transitionId = node['transition'];
          const transition =
            typeof transitionId === 'string' ? (scope.node(transitionId) as unknown as Node | undefined) : undefined;
          const destination = transition === undefined ? undefined : destinationOf(transition, scope);
          if (destination === undefined) {
            scope.report(
              GeneratorDiagnosticCode.UnsupportedCapability,
              'error',
              `a \`${action}\` navigation names no destination this generator can resolve. A departure ` +
                'carries the `app.RouteTransition` it performs, and that edge names either a route or a ' +
                'component; this one names neither, or names one that was dropped. That is a compiler ' +
                'gap, not a defect in your program.',
              idOf(node),
            );
            return [];
          }
          const method = action === 'push' ? 'push' : 'replace';
          return [`${router}.${method}(${destination});`];
        }
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

/**
 * The `Destination` literal for a transition — the kit's own vocabulary, not the compiler's.
 *
 * Two shapes, exactly as `Destination` declares them (Spec v2.4 §A17):
 *
 *   * a **route** destination names an `app.Route`, and is keyed by the same name the route table gives
 *     it, so a descriptor and a push cannot disagree about what a route is called;
 *   * a **component** destination is an inline push. It has **no path and none is invented** (§A17.6) —
 *     the identity is the `ui.Component` node id, which is what `RouterOutlet`'s `components` map is
 *     keyed by.
 *
 * Route arguments are deliberately not passed. `RouteArgument`s exist on the edge, but ADR-0025 D1 is
 * schema-only and nothing populates them yet; emitting a `params` object from an unpopulated field would
 * put an empty object where the developer wrote values.
 */
function destinationOf(transition: Node, scope: EmitScope): string | undefined {
  const target = transition['target'];
  if (typeof target === 'string') {
    const route = scope.node(target) as unknown as Node | undefined;
    if (route === undefined) return undefined;
    return `{ kind: 'route', route: ${JSON.stringify(routeNameOf(route))} }`;
  }

  const component = transition['component'];
  if (typeof component === 'string') {
    // The same key `pipeline.ts`'s `componentScreens` registers this destination under — computed once,
    // by `screenKeyFor`, so the two never independently decide differently (M7-G). A component with a
    // declared parameter is keyed by *this transition's own id*, because a second push to it may supply
    // different constant arguments and must resolve to a different screen at runtime, not the first one
    // found.
    return `{ kind: 'component', component: ${JSON.stringify(screenKeyFor(component, transition, scope))} }`;
  }
  return undefined;
}
