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
import { catchTypeTest, compilePattern, emitExpression, scopeWithNames, markValueUnused, setStatementLowering, type EmitScope } from './expression.js';
import { identifierOf } from './module.js';
import { routeNameOf, screenKeyFor } from './routes.js';
import { opaqueDetailOf, opaqueReasonSuffix } from './unsupported.js';

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
export function emitStatements(
  statements: unknown,
  scope: EmitScope,
  reservedNames: ReadonlySet<string> = EMPTY_RESERVED_NAMES,
): string[] {
  const seen = new Set<string>();
  // The variables a pattern declaration in this list binds are in scope for its statements (ADR-0069).
  const patternNames = asArray(statements).flatMap((statement) =>
    kindOf(statement) === 'logic.PatternDecl' ? patternVariableNames(statement['pattern'] as Node) : [],
  );
  if (patternNames.length > 0) scope = scopeWithNames(scope, patternNames);
  return asArray(statements).flatMap((statement) => {
    // A state-batch call is spliced open at extraction time (INV-22), with no JS-level block left to mark
    // where it began — so two `logic.VarDecl`s that would generate the same name here can no longer rely
    // on Dart's own nested scope to make that legal (`GeneratorDiagnosticCode.DuplicateLocalDeclaration`).
    // Checked in the same flat list `emitStatements` already walks — a genuinely nested block (an `if`/
    // `while`/`for` body) is never in this same list; it is lowered by its own case, wrapped in real `{ }`.
    //
    // `reservedNames` (M11-F) is the SAME failure class from the other direction: the enclosing
    // callback's own parameters — passed by `expression.ts`'s `logic.Lambda` case (an in-place callback,
    // e.g. `TextFormField.validator`) and by `component.ts`'s/`store.ts`'s own action-body emission (a
    // callback N5 promoted to a `sig.Action`, e.g. `Checkbox.onChanged`) — already occupy this identical
    // emitted scope, so a `logic.VarDecl` landing here — the callback's own top-level local, or one
    // spliced open from a nested `setState`/bare-block — that shares a parameter's name is exactly as
    // unrepresentable as two siblings sharing one: `(value) => { const value = ...; ... }` is
    // `TS2300`/`SyntaxError`, live-probed against both call sites (`Checkbox.onChanged`,
    // `TextFormField.validator` — real, cataloged, reachable parameterized callbacks, not hypothetical
    // ones).
    if (kindOf(statement) === 'logic.VarDecl') {
      const name = identifierOf(String(statement['name'] ?? '_'));
      if (seen.has(name)) {
        scope.report(
          GeneratorDiagnosticCode.DuplicateLocalDeclaration,
          'error',
          `\`${name}\` is already declared earlier in this scope — a state-batch call's own body was ` +
            'spliced open here (INV-22) and no longer has a block boundary to shadow within, so this ' +
            'generator cannot represent both declarations without inventing a rename the program never ' +
            'wrote',
          idOf(statement),
        );
        return [];
      }
      if (reservedNames.has(name)) {
        scope.report(
          GeneratorDiagnosticCode.DuplicateLocalDeclaration,
          'error',
          `\`${name}\` is already the enclosing callback's own parameter — a state-batch call's own body ` +
            'may have been spliced open here (INV-22), leaving no block boundary to shadow the parameter ' +
            'within, so this generator cannot represent both without inventing a rename the program never ' +
            'wrote',
          idOf(statement),
        );
        return [];
      }
      seen.add(name);
    }
    return emitStatement(statement, scope);
  });
}

const EMPTY_RESERVED_NAMES: ReadonlySet<string> = new Set();

/** Lowers one statement. Returns its lines; a block returns several. */
export function emitStatement(statement: Stmt | Node | undefined, scope: EmitScope): string[] {
  if (statement === undefined || statement === null) return [];
  const node = statement as Node;

  switch (kindOf(node)) {
    case 'logic.ExprStmt':
      markValueUnused(node['expr']);
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

    // `final (a, b) = value;` (ADR-0069): the value, then each variable the pattern binds.
    case 'logic.PatternDecl': {
      const name = `$p_${String(idOf(node) ?? 'x').replace(/[^a-zA-Z0-9]/g, '')}`;
      const compiled = compilePattern(node['pattern'] as Node, name, scope);
      if (compiled === undefined) return [];
      return [`const ${name} = ${emitExpression(node['value'] as Node, scope)};`, ...compiled.binds.map((b) => `const ${identifierOf(b.name)} = ${b.expr};`)];
    }

    case 'logic.If': {
      // `if (value case pattern when guard) then else otherwise` (ADR-0069): labelled, so the `else` runs when the pattern or the guard fails.
      const matchTest = node['test'] as Node;
      if (kindOf(matchTest) === 'logic.PatternMatch') {
        const label = `$if_${String(idOf(node) ?? 'x').replace(/[^a-zA-Z0-9]/g, '')}`;
        const compiled = compilePattern(matchTest['pattern'] as Node, '$s', scope);
        if (compiled === undefined) return [];
        const inner = scopeWithNames(scope, compiled.binds.map((b) => b.name));
        const guard = matchTest['guard'] === undefined ? undefined : emitExpression(matchTest['guard'] as Node, inner);
        const out = [`${label}: {`, `  const $s = ${emitExpression(matchTest['subject'] as Node, scope)};`, `  if (${compiled.test}) {`];
        for (const bind of compiled.binds) out.push(`    const ${identifierOf(bind.name)} = ${bind.expr};`);
        out.push(guard === undefined ? '    {' : `    if (${guard}) {`);
        out.push(...indent(indent(indent(emitStatement(node['then'] as Node, inner)))), `      break ${label};`, '    }', '  }');
        if (node['otherwise'] !== undefined) out.push(...indent(emitStatement(node['otherwise'] as Node, scope)));
        out.push('}');
        return out;
      }
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
        // The hidden variable of `for (final (a, b) in xs)` is read by name from the destructuring at the top of the body.
        lines.push(...indent(emitStatement(node['body'] as Node, scopeWithNames(scope, [String(node['loopVariable'] ?? '_')]))));
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
      const update = asArray(node['update'])
        .map((u) => {
          markValueUnused(u);
          return emitExpression(u, scope);
        })
        .join(', ');
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
      const bindingOf = (clause: Node): string => {
        // `exceptionDecl` (ADR-28, amended M8-S) is the declaration-tier identity a `logic.Ref` inside the catch body resolves
        // against via `localName` (populated by `localBindingsIn`, which walks this whole body generically). The emitted identifier
        // MUST be computed from the same `.name` that declaration carries, or a read that resolves to it would bind to a different
        // identifier than the one this line actually declares.
        const decl = clause['exceptionDecl'] as Node | undefined;
        return identifierOf(decl !== undefined ? String(decl['name'] ?? 'error') : String(clause['exceptionName'] ?? 'error'));
      };
      const withCatch = (binding: string, clause: Node): string[] => {
        // `rethrow` in the body throws this binding again.
        const outerCatch = scope.catchBinding;
        scope.catchBinding = binding;
        try {
          return emitStatement(clause['body'] as Node, scope);
        } finally {
          scope.catchBinding = outerCatch;
        }
      };
      if (clauses.length === 0) {
        // `try { … } finally { … }`: no catch at all — the exception keeps propagating, as in Dart. (A bare `catch {}` swallowed it.)
        if (node['finallyBlock'] === undefined) lines.push('} catch {');
      } else {
        // Dart dispatches catch clauses on the exception's *type*; JavaScript has one catch block, so the clauses become a chain of
        // runtime type tests inside it (`dartIs` for a project class, `instanceof` for an SDK exception, `sdkTypeTest` for the
        // rest), and an exception no clause names is thrown again. A clause with no `on` (or `on Object`) catches everything.
        const tests = clauses.map((clause) => catchTypeTest(clause['exceptionType'] as Node | undefined, '$err', scope));
        if (tests.some((test) => test === undefined)) {
          scope.report(
            GeneratorDiagnosticCode.UnsupportedStatement,
            'error',
            'this catch clause names a type that cannot be told at runtime here (only a project class, an SDK exception such as ' +
              '`FormatException`/`StateError`/`Exception`/`Error`, `int`, `double`, `num`, `String`, `bool`, `List`, `Map`, `Set` or `Object` can).',
            idOf(node),
          );
        }
        const typed = tests.some((test) => test !== 'catchAll' && test !== undefined);
        if (!typed) {
          const first = clauses[0] as Node;
          const binding = bindingOf(first);
          lines.push(`} catch (${binding}) {`);
          lines.push(...indent(withCatch(binding, first)));
        } else {
          lines.push('} catch ($err) {');
          let closed = false;
          clauses.forEach((clause, index) => {
            const test = tests[index];
            const binding = bindingOf(clause);
            const head = index === 0 ? 'if' : '} else if';
            if (test === 'catchAll' || test === undefined) {
              lines.push(index === 0 ? '{' : '} else {');
              lines.push(`  const ${binding} = $err;`);
              lines.push(...indent(withCatch(binding, clause)));
              closed = true;
              return;
            }
            lines.push(`${head} (${test.test}) {`);
            lines.push(`  const ${binding} = $err as ${test.typeText};`);
            lines.push(...indent(withCatch(binding, clause)));
          });
          if (!closed) lines.push('} else {', '  throw $err;', '}');
          else lines.push('}');
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
      // A case with a pattern or a `when` guard (ADR-0065): the cases become labelled blocks tried in order — each tests its pattern,
      // declares the variables it binds, tests its guard, runs its body and leaves the switch.
      if (asArray(node['cases']).some((entry) => (entry as Node)['pattern'] !== undefined)) {
        const label = `$sw_${String(idOf(node) ?? 'x').replace(/[^a-zA-Z0-9]/g, '')}`;
        const out = [`${label}: {`, `  const $s = ${emitExpression(node['subject'] as Node, scope)};`];
        asArray(node['cases']).forEach((entry, index) => {
          const item = entry as Node;
          const caseLabel = `${label}_${index}`;
          let body = asArray(item['body']);
          // Dart's cases never fall through; a trailing `break` only ends the case.
          while (body.length > 0 && kindOf(body[body.length - 1] as Node) === 'logic.Break') body = body.slice(0, -1);
          let inner = scope;
          const head: string[] = [];
          if (item['pattern'] !== undefined) {
            const compiled = compilePattern(item['pattern'] as Node, '$s', scope);
            if (compiled === undefined) return;
            head.push(`if (!(${compiled.test})) break ${caseLabel};`);
            for (const bind of compiled.binds) head.push(`const ${identifierOf(bind.name)} = ${bind.expr};`);
            inner = scopeWithNames(scope, compiled.binds.map((b) => b.name));
            if (item['guard'] !== undefined) head.push(`if (!(${emitExpression(item['guard'] as Node, inner)})) break ${caseLabel};`);
          } else if (item['test'] !== undefined) {
            head.push(`if (!($s === ${emitExpression(item['test'] as Node, scope)})) break ${caseLabel};`);
          }
          const lines2 = emitStatements(body, inner);
          out.push(`  ${caseLabel}: {`, ...indent(indent(head)), ...indent(indent(lines2)));
          if (!leaves(lines2)) out.push(`    break ${label};`);
          out.push('  }');
        });
        out.push('}');
        return out;
      }
      const lines = [`switch (${emitExpression(node['subject'] as Node, scope)}) {`];
      for (const entry of asArray(node['cases'])) {
        const item = entry as Node;
        const test = item['test'];
        // A case with no test is Dart's `default` (`SwitchCase.test`: "absent for the default case"). It was emitted as
        // `case undefined:` — a case that matches nothing — so a `default` branch, and (before the analyzer read Dart 3's
        // pattern cases) every case, silently never ran.
        if (test === undefined && (item['test'] === undefined)) {
          const dflt = emitStatements(item['body'], scope);
          lines.push('  default: {');
          lines.push(...indent(indent(dflt)));
          if (!leaves(dflt)) lines.push('    break;');
          lines.push('  }');
          continue;
        }
        const rawBody = asArray(item['body']);
        if (rawBody.length === 0) {
          // An empty case falls through to the next (`case 1: case 2: body` — Dart's grouping). A `break` here would
          // make the first label do nothing.
          lines.push(`  case ${emitExpression(test as Node, scope)}:`);
          continue;
        }
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
      const { source, reason } = opaqueDetailOf(node);
      scope.report(
        GeneratorDiagnosticCode.OpaqueConstruct,
        'error',
        `\`${source}\` has no UIR representation and reached the generator as opaque source (INV-4). ` +
          `Lowering it would mean guessing what it does; it needs an override.${opaqueReasonSuffix(reason)}`,
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
          // A navigation to a route by path or by name (ADR-0072) names the `app.Route` itself.
          const routeId = node['route'];
          const routeNode =
            typeof routeId === 'string' ? (scope.node(routeId) as unknown as Node | undefined) : undefined;
          const destination =
            routeNode !== undefined
              ? `{ kind: 'route', route: ${JSON.stringify(routeNameOf(routeNode))} }`
              : transition === undefined
                ? undefined
                : destinationOf(transition, scope);
          if (destination === undefined) {
            scope.report(
              GeneratorDiagnosticCode.UnsupportedCapability,
              'error',
              `a \`${action}\` navigation names no destination this generator can resolve. A departure ` +
                'carries the `app.RouteTransition` it performs or the `app.Route` it goes to; this one ' +
                'carries neither — its route name or path matches no route the program declares (the ' +
                'analyzer says which), or matches more than one. With no such warning it is a compiler gap, ' +
                'not a defect in your program.',
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
setStatementLowering((body, scope, reservedNames) => emitStatements(body, scope, reservedNames));

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

/** The names a pattern binds. */
function patternVariableNames(pattern: Node): string[] {
  const names: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    const record = node as Node;
    if (record['kind'] === 'logic.Pattern' && record['variant'] === 'bind') names.push(String((record['decl'] as Node)['name']));
    for (const value of Object.values(record)) walk(value);
  };
  walk(pattern);
  return names;
}
