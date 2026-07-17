// The expression emitter — `logic.*` Expr → TypeScript.
//
// ## This is where Dart stops being Dart
//
// ADR-19 draws the line the whole platform rests on: **structure is data, behaviour is closures**. The
// runtime kit never interprets `logic.*`, because interpreting it would mean shipping Dart's evaluation
// semantics to the browser and re-implementing them in every future kit. So the semantics get resolved
// exactly once — here, at compile time, into real TypeScript.
//
// That makes this file the one place in the React target where Dart and JavaScript disagree about what an
// operator *means*, and where getting it wrong is silent. The schema's own doc comments record the traps, and
// they are not hypothetical: `logic.Assign`'s documentation says `truncatingDivideAssign` needs
// `Math.trunc(a / b)`, and that *"Dart's modulo is always non-negative for a positive divisor; JavaScript's
// `%` is not"*. `-7 % 3` is `2` in Dart and `-1` in JavaScript. A generator that emits `%` for `%` produces
// an application that computes the wrong number, on some inputs, forever.
//
// ## Why a visitor and not a switch on `kind` scattered about
//
// Every `Expr` variant is handled in one place, so "did we handle `logic.Cast`?" is answerable by reading one
// function. The default branch reports `BRG3002` rather than falling through to something plausible: an
// expression the generator cannot lower is an expression whose value it would have to invent.

import type { AnyUirNode, Expr, NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { identifierOf, type ModuleBuilder } from './module.js';

/** What an expression needs in order to be lowered. */
export interface EmitScope {
  /** The file being written. */
  readonly module: ModuleBuilder;
  /** Reports a finding. */
  report(code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string): void;
  /**
   * The local expression that reads a signal declared by `id`, if one is in scope.
   *
   * A `logic.Ref` whose target is a `sig.Signal` must become `count.get()`, not `count` — the signal is an
   * object, and emitting the object where its value belongs produces `[object Object]` on screen. The
   * component and store emitters populate this; the expression emitter only asks.
   */
  signalRead(id: NodeId): string | undefined;
  /** The local name a declaration was bound to, if it is in scope (a param, a local, a lifted action). */
  localName(id: NodeId): string | undefined;
  /**
   * The parameter of this name, if one is in scope.
   *
   * A `ParamDecl` has no `id` — it is a value, not a node — so a `logic.Ref` to a parameter carries a `name`
   * and no `target`, and resolution is **by name, within the action's scope** (Spec v2.5 §A18.3). That is
   * ordinary lexical scoping and not an inference: the parameter is declared, on the action, by the source.
   *
   * It is asked *after* `target`, so a signal named `id` and a parameter named `id` resolve the way Dart
   * would — the parameter shadows nothing it should not, because a signal read carries a target and a
   * parameter read does not.
   */
  paramInScope(name: string): string | undefined;
  /**
   * The name the *program* gives a declaration, recovered from the references to it.
   *
   * `sig.Signal` and `sig.Action` carry no `name`: they are symbol-addressed declarations (ADR-17) and the
   * symbol never reaches the document. But every `logic.Ref` that reads one carries both `target` and the
   * `name` the author wrote, so the program does state it — just not on the declaration. Without this a store
   * emits `value_d18f644e` where the source said `_favoriteIds`, which compiles and is unreviewable.
   */
  declaredName(id: NodeId): string | undefined;
  /** Looks a node up by id. */
  node(id: NodeId): AnyUirNode | undefined;
}

/** A `logic.*` node, loosely typed: the generated union does not expose nested nodes as `AnyUirNode`. */
type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/**
 * Binary operators that mean the same thing in both languages.
 *
 * `Binary.operator` is deliberately a free-form `string` in the schema, and the reason is stated there: *"a
 * binary operator is pure — the worst a wrong one does is compute the wrong number. A wrong assignment
 * operator writes the wrong value to state."* That is an argument for not *validating* it in the schema; it is
 * not licence to pass it through unread. Anything not on this list is reported, not emitted.
 */
const SAFE_BINARY = new Set([
  '+', '-', '*', '<', '>', '<=', '>=', '&&', '||', '&', '|', '^', '<<', '>>',
]);

/** Dart's `==` is value equality for primitives and identity for objects — `===` is the honest lowering. */
const EQUALITY: Readonly<Record<string, string>> = { '==': '===', '!=': '!==' };

/** Wraps in parentheses. Applied structurally rather than by precedence analysis — see `emitExpression`. */
const paren = (text: string): string => `(${text})`;

/**
 * Emits a string literal.
 *
 * `JSON.stringify` handles the escaping, then the quotes are converted to the repo's single-quote
 * convention. Doing it by hand is how a generator eventually meets a string containing a backslash.
 */
export function stringLiteral(value: string): string {
  const json = JSON.stringify(value);
  const inner = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${inner}'`;
}

/** Emits a `logic.Lit`'s value. */
function literal(node: Node, scope: EmitScope): string {
  const value = node['value'];
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // Dart's `100.0` and JavaScript's `100` are the same number and print differently — the divergence
    // §A15/§A16 fixed for node identity. Here it is only cosmetic: the emitted `100` is the same value.
    return Object.is(value, -0) ? '-0' : String(value);
  }
  scope.report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `a literal of type ${typeof value} has no lowering`,
    idOf(node),
  );
  return 'null';
}

/**
 * Lowers one expression to TypeScript.
 *
 * @param expr - the `logic.*` expression node.
 * @param scope - what is in scope, and where to report.
 * @returns the TypeScript text. Parenthesised where its own structure requires it.
 */
export function emitExpression(expr: Expr | Node | undefined, scope: EmitScope): string {
  if (expr === undefined || expr === null) return 'undefined';
  const node = expr as Node;

  switch (kindOf(node)) {
    case 'logic.Lit':
      return literal(node, scope);

    case 'logic.Ref': {
      const target = node['target'];
      if (typeof target === 'string') {
        const read = scope.signalRead(target);
        if (read !== undefined) return read;
        const local = scope.localName(target);
        if (local !== undefined) return local;
      }
      const name = node['name'];

      // A parameter. Declared on the enclosing `sig.Action` (§A18) or `ui.Component`, carrying no id because
      // a `ParamDecl` is a value rather than a node — so this is the only way it can resolve, and it is the
      // way the model intends. Before §A18 this branch could not exist: `toggle(int id)`'s `id` reached here
      // with nothing to match against, and became BRG3006.
      if (typeof name === 'string') {
        const param = scope.paramInScope(name);
        if (param !== undefined) return param;
      }

      // Otherwise the `Ref` names something outside the program — `notifyListeners()`, a top-level Dart
      // function, a package API. Emitting the bare name produces a file that does not compile, and picking a
      // plausible replacement is inventing. `notifyListeners` is the instructive case: under ADR-4 a signal
      // write *is* the notification, so the call is redundant — but "redundant" is a judgement about
      // ChangeNotifier's semantics, which belongs to whatever models them, not to a name lookup here.
      scope.report(
        GeneratorDiagnosticCode.UnresolvedReference,
        'error',
        typeof name === 'string'
          ? `\`${name}\` is not declared in this program, so there is nothing to emit for it. It needs an ` +
            `override, or a pass that models what it means.`
          : 'a reference names neither a declaration in the program nor a name',
        idOf(node),
      );
      return 'undefined';
    }

    case 'logic.Binary': {
      const operator = String(node['operator'] ?? '');
      const left = emitExpression(node['left'] as Node, scope);
      const right = emitExpression(node['right'] as Node, scope);

      if (operator in EQUALITY) return paren(`${left} ${EQUALITY[operator]} ${right}`);
      if (SAFE_BINARY.has(operator)) return paren(`${left} ${operator} ${right}`);

      // The two that do not survive translation. Both are silent: they compute a number, and the number is
      // wrong only for some inputs.
      if (operator === '%') {
        // Dart: `-7 % 3 == 2`. JavaScript: `-7 % 3 === -1`. Dart's result carries the divisor's sign.
        return paren(`(((${left}) % (${right})) + (${right})) % (${right})`);
      }
      if (operator === '~/') {
        // Dart's truncating division. `7 ~/ 2 == 3`, and `-7 ~/ 2 == -3` — toward zero, not toward -Infinity,
        // so `Math.floor` is wrong for negatives.
        return `Math.trunc(${left} / ${right})`;
      }
      if (operator === '/') {
        // Dart's `/` on two ints is double division — `7 / 2 == 3.5` — which is what JavaScript does anyway.
        return paren(`${left} / ${right}`);
      }
      if (operator === '??') return paren(`${left} ?? ${right}`);

      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the binary operator \`${operator}\` has no lowering to TypeScript that is known to preserve its ` +
          `Dart meaning. Emitting it unchanged would compute a value the author did not write.`,
        idOf(node),
      );
      return 'undefined';
    }

    case 'logic.Unary': {
      const operator = String(node['operator'] ?? '');
      const operand = emitExpression(node['operand'] as Node, scope);
      if (operator === '!' || operator === '-' || operator === '~') return paren(`${operator}${operand}`);
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the unary operator \`${operator}\` has no known lowering`,
        idOf(node),
      );
      return 'undefined';
    }

    case 'logic.Conditional':
      return paren(
        `${emitExpression(node['test'] as Node, scope)} ? ` +
          `${emitExpression(node['then'] as Node, scope)} : ` +
          `${emitExpression(node['otherwise'] as Node, scope)}`,
      );

    case 'logic.NullCheck': {
      // Two Dart forms in one node, told apart by `fallback`: `a ?? b` has one, `a!` does not. `!` asserts
      // non-null in both languages and erases in both; `??` is identical in both.
      const operand = emitExpression(node['operand'] as Node, scope);
      if (node['fallback'] === undefined) return `${operand}!`;
      return paren(`${operand} ?? ${emitExpression(node['fallback'] as Node, scope)}`);
    }

    case 'logic.PropertyAccess': {
      const receiver = emitExpression(node['receiver'] as Node, scope);
      return `${receiver}.${identifierOf(String(node['property'] ?? ''))}`;
    }

    case 'logic.MethodCall': {
      const receiver = emitExpression(node['receiver'] as Node, scope);
      refuseNamedArgs(node, scope);
      const args = emitArguments(node['args'], scope);
      return `${receiver}.${identifierOf(String(node['method'] ?? ''))}(${args})`;
    }

    case 'logic.Call': {
      refuseNamedArgs(node, scope);
      const callee = emitExpression(node['callee'] as Node, scope);
      return `${callee}(${emitArguments(node['args'], scope)})`;
    }

    case 'logic.New': {
      refuseNamedArgs(node, scope);
      const typeName = String(node['typeName'] ?? '');
      const constructorName = node['constructorName'];
      const args = emitArguments(node['args'], scope);
      // A named constructor — `EdgeInsets.all(16)` — is a static method in TypeScript, which is the shape the
      // kit's own `EdgeInsets` has, so it lowers without a `new`.
      if (typeof constructorName === 'string' && constructorName !== '') {
        return `${identifierOf(typeName)}.${identifierOf(constructorName)}(${args})`;
      }
      return `new ${identifierOf(typeName)}(${args})`;
    }

    case 'logic.ListLit': {
      const elements = asArray(node['elements']).map((e) => emitExpression(e, scope));
      return `[${elements.join(', ')}]`;
    }

    case 'logic.MapLit': {
      // Dart's `{}` is a Map *or* a Set — `<int>{}` is a Set — and UIR has no `SetLit`, so both arrive as
      // `logic.MapLit` and the resolved type is what tells them apart. Emitting `new Map()` for a Set gives
      // it `.add`, `.has` and `.delete` that all mean something else, and the mistake compiles.
      const typeName = String((node['type'] as Node | undefined)?.['name'] ?? '');
      const keys = asArray(node['keys']).map((key) => emitExpression(key, scope));
      if (typeName.startsWith('Set<') || typeName === 'Set') {
        return `new Set([${keys.join(', ')}])`;
      }
      const values = asArray(node['values']).map((value) => emitExpression(value, scope));
      // A Dart `Map` is not a JS object literal: its keys are not coerced to strings. `new Map` preserves that.
      const entries = keys.map((key, index) => `[${key}, ${values[index] ?? 'undefined'}]`);
      return `new Map([${entries.join(', ')}])`;
    }

    case 'logic.StringInterp': {
      const parts = asArray(node['parts']).map((part) => {
        const item = part as Node;
        if (kindOf(item) === 'logic.Lit' && typeof item['value'] === 'string') {
          return (item['value'] as string).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        }
        return `\${${emitExpression(item, scope)}}`;
      });
      return `\`${parts.join('')}\``;
    }

    case 'logic.Lambda': {
      const params = asArray(node['params'])
        .map((p) => identifierOf(String((p as Node)['name'] ?? '_')))
        .join(', ');
      const body = node['body'];
      if (Array.isArray(body)) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'warning',
          'a lambda with a statement body reached the expression emitter; only its first expression is ' +
            'lowered here',
          idOf(node),
        );
      }
      return `(${params}) => ${emitExpression(node['body'] as Node, scope)}`;
    }

    case 'logic.Await':
      return `await ${emitExpression(node['operand'] as Node, scope)}`;

    case 'logic.Cast':
      // Dart's `as` is a *checked* downcast that throws; TypeScript's is erased. Emitting `as` would silently
      // turn a runtime guarantee into a compile-time assertion, so the value passes through unchanged and the
      // type is left to inference — which is honest about what the output actually checks.
      return emitExpression(node['operand'] as Node, scope);

    case 'logic.Assign':
      return emitAssignment(node, scope);

    case 'logic.OpaqueExpr': {
      const source = typeof node['source'] === 'string' ? node['source'] : '<unknown>';
      scope.report(
        GeneratorDiagnosticCode.OpaqueConstruct,
        'error',
        `\`${source}\` has no UIR representation, so it reached the generator as opaque source (INV-4). ` +
          `It cannot be lowered without guessing what it means; it needs an override.`,
        idOf(node),
      );
      return 'undefined';
    }

    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `\`${kindOf(node)}\` has no lowering in this generator`,
        idOf(node),
      );
      return 'undefined';
  }
}

/** Emits a call's positional arguments. */
function emitArguments(value: unknown, scope: EmitScope): string {
  return asArray(value)
    .map((argument) => emitExpression(argument, scope))
    .join(', ');
}

/**
 * Refuses a call that passes Dart named arguments.
 *
 * `foo(bar: 1)` has no positional equivalent: JavaScript would need an options object, and which parameter
 * that object corresponds to is a fact about the callee's signature, which the generator does not have. A
 * guess here silently passes an argument to the wrong parameter.
 */
function refuseNamedArgs(node: Node, scope: EmitScope): void {
  const named = node['namedArgs'];
  if (named === undefined || (typeof named === 'object' && named !== null && Object.keys(named).length === 0)) {
    return;
  }
  scope.report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `this call passes Dart named arguments (${Object.keys(named as object).join(', ')}). Lowering them ` +
      `needs the callee's signature, which the program does not carry, and guessing would pass a value to ` +
      `the wrong parameter.`,
    idOf(node),
  );
}

function asArray(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

/**
 * Lowers `logic.Assign` — the node the schema singles out as the dangerous one.
 *
 * > Distinct from `sig.Action.writes`, and not replaceable by it: `writes` is a data-flow summary (*which*
 * > signals change), while this is program semantics (*what they become*). Both are required.
 *
 * `AssignmentOperator` is a **closed enum**, unlike `Binary.operator`, and this handles every member. A
 * missing one is reported rather than passed through, because — in the schema's own words — *"a wrong
 * assignment operator writes the wrong value to state."*
 */
function emitAssignment(node: Node, scope: EmitScope): string {
  const operator = String(node['operator'] ?? '');
  const target = node['target'] as Node;
  const targetText = emitTarget(target, scope);
  const valueNode = node['value'] as Node | undefined;

  if (operator === 'increment' || operator === 'decrement') {
    // `isPostfix` is only observable when the expression's *value* is used (`x++` vs `++x`). As a statement
    // they are identical, and that is how actions use them.
    const step = operator === 'increment' ? '+ 1' : '- 1';
    return assignTo(target, targetText, `${readTarget(target, targetText, scope)} ${step}`, scope);
  }

  const value = emitExpression(valueNode, scope);
  const read = (): string => readTarget(target, targetText, scope);

  switch (operator) {
    case 'assign':
      return assignTo(target, targetText, value, scope);
    case 'addAssign':
      return assignTo(target, targetText, `${read()} + ${value}`, scope);
    case 'subtractAssign':
      return assignTo(target, targetText, `${read()} - ${value}`, scope);
    case 'multiplyAssign':
      return assignTo(target, targetText, `${read()} * ${value}`, scope);
    case 'divideAssign':
      return assignTo(target, targetText, `${read()} / ${value}`, scope);
    case 'truncatingDivideAssign':
      // `~/=`. Toward zero — `Math.floor` is wrong for negatives, which is why the schema calls this out.
      return assignTo(target, targetText, `Math.trunc(${read()} / ${value})`, scope);
    case 'moduloAssign':
      // `%=`. Dart's modulo is non-negative for a positive divisor; JavaScript's is not.
      return assignTo(target, targetText, `(((${read()}) % (${value})) + (${value})) % (${value})`, scope);
    case 'ifNullAssign':
      return assignTo(target, targetText, `${read()} ?? ${value}`, scope);
    case 'bitAndAssign':
      return assignTo(target, targetText, `${read()} & ${value}`, scope);
    case 'bitOrAssign':
      return assignTo(target, targetText, `${read()} | ${value}`, scope);
    case 'bitXorAssign':
      return assignTo(target, targetText, `${read()} ^ ${value}`, scope);
    case 'shiftLeftAssign':
      return assignTo(target, targetText, `${read()} << ${value}`, scope);
    case 'shiftRightAssign':
      return assignTo(target, targetText, `${read()} >> ${value}`, scope);
    case 'unsignedShiftRightAssign':
      return assignTo(target, targetText, `${read()} >>> ${value}`, scope);
    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the assignment operator \`${operator}\` has no lowering. A wrong assignment operator writes the ` +
          `wrong value to state, so this is refused rather than approximated.`,
        idOf(node),
      );
      return 'undefined';
  }
}

/** The signal a `logic.Ref` target names, if it is one. */
function signalTargetOf(target: Node, scope: EmitScope): string | undefined {
  if (kindOf(target) !== 'logic.Ref') return undefined;
  const id = target['target'];
  return typeof id === 'string' && scope.signalRead(id) !== undefined ? id : undefined;
}

/** The place being written, as text — used when the target is an ordinary lvalue. */
function emitTarget(target: Node, scope: EmitScope): string {
  if (kindOf(target) === 'logic.Ref') {
    const id = target['target'];
    if (typeof id === 'string') {
      const local = scope.localName(id);
      if (local !== undefined) return local;
    }
    const name = target['name'];
    if (typeof name === 'string') return identifierOf(name);
  }
  return emitExpression(target, scope);
}

/** Reads the current value of the place being written. */
function readTarget(target: Node, targetText: string, scope: EmitScope): string {
  const signal = signalTargetOf(target, scope);
  // `peek`, not `get`. A read-modify-write inside an action must not subscribe the enclosing computation to
  // the signal it writes — the kit's own `update` does exactly this, for exactly this reason.
  if (signal !== undefined) return `${signalName(signal, scope)}.peek()`;
  return targetText;
}

/** The local name of a signal in scope. Derived from its read expression, which is `<name>.get()`. */
function signalName(id: string, scope: EmitScope): string {
  const read = scope.signalRead(id) ?? '';
  return read.endsWith('.get()') ? read.slice(0, -'.get()'.length) : read;
}

/**
 * Writes to the place.
 *
 * A signal is written with `.set(...)`, never `=`. This is the whole reason the generator knows which
 * `logic.Ref`s are signals: `count = count + 1` in Dart is `count.set(count.peek() + 1)` here, and emitting
 * the assignment verbatim would rebind a local and leave the state untouched — generated React state that
 * never updates, which is the defect `sig.Action`'s own schema doc warns about.
 */
function assignTo(target: Node, targetText: string, value: string, scope: EmitScope): string {
  const signal = signalTargetOf(target, scope);
  if (signal !== undefined) return `${signalName(signal, scope)}.set(${value})`;
  return `${targetText} = ${value}`;
}
