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
import { RUNTIME_MODULE as RUNTIME, isKitProvided } from './runtime.js';
import { OWNER_LABEL, missingCapabilityOf } from './unsupported.js';


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
  /**
   * The identifier of the signal *object* declared by `id`, if one is in scope.
   *
   * Distinct from {@link signalRead}, which is the expression that reads its **value** — and in render
   * position that is a subscribed local rather than anything derived from this name. Writing needs the
   * object (`count.set(…)`, `count.peek()`); rendering needs the value.
   *
   * This exists because the two were previously recovered from one string: `signalName` took
   * `signalRead(id)` and stripped a trailing `.get()`. That worked only while every read had that exact
   * shape, and it silently produced the wrong identifier the moment one did not.
   */
  signalLocal(id: NodeId): string | undefined;
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

  /**
   * Whether the program declares a class by this name that the generator emits.
   *
   * Always `false` today: M3-B emits no `logic.ClassDecl`, which is why a user type in a parameter position
   * lowers to `unknown`. It is a question rather than a constant so that the day class emission exists, the
   * refusal in `logic.New` lifts by itself instead of having to be found.
   */
  declaresClass(name: string): boolean;
  /** Looks a node up by id. */
  node(id: NodeId): AnyUirNode | undefined;
  /**
   * Every Material role the program's `app.Token` set resolves — by `role`, and by `name` for the tokens N10
   * derives (which set both to the same string).
   *
   * The build-time half of INV-20. A `WidgetMapping` declares the roles its component paints, and
   * `checkCapabilities` asks this set whether the program can supply them; a widget that paints a role no
   * token defines is refused (`BRG3010`) rather than emitted to throw `BRG4006` in a browser.
   *
   * Program-wide and computed once, because the token set is the same for every file.
   */
  readonly themeRoles: ReadonlySet<string>;
}

/** A `logic.*` node, loosely typed: the generated union does not expose nested nodes as `AnyUirNode`. */
type Node = Record<string, unknown>;

/**
 * Whether `holder` is the class Flutter hangs `type`'s named constants off.
 *
 * Flutter's convention is a plural or `-s` holder for a singular value type: `Curves` holds `Curve`s,
 * `Colors` holds `Color`s, `Icons` holds `IconData`. Checked rather than assumed — a bare "the prefix is
 * some Flutter class" test would rewrite any Flutter-typed reference into a member access that does not
 * exist, which is the failure the narrower `prefix === typeName` check was protecting against.
 */
function isHolderOf(holder: string, type: string): boolean {
  return holder === `${type}s` || holder === `${type}es`;
}

/**
 * What an emitter returns when it has refused an expression and reported why.
 *
 * `'undefined'` is the text, and it is deliberately the same text a genuine Dart `null` lowers to: nothing is
 * emitted from a refused program (the pipeline discards every file once an `error` is reported), so this
 * value never reaches a file. Naming it makes "did this sub-expression refuse?" a check a caller can make,
 * which is what stops one refusal becoming one diagnostic per argument.
 */
const REFUSED = 'undefined';

/**
 * Lowers a statement list. Assigned by `statement.ts` at import.
 *
 * A lambda may have a **statement** body — `validator: (value) { if (value == null) return 'required'; … }`
 * is ordinary Dart and the shape every form validator has — so the expression emitter needs the statement
 * emitter. But `statement.ts` already imports *this* module for its expressions, and a mutual import is a
 * cycle, which `.dependency-cruiser.cjs` rejects at error severity.
 *
 * So the dependency goes one way and the function is handed back, which is the same wiring the analyzer's
 * own extractor pair uses and for the same reason. It is a hook set once at module load, not per-request
 * state: nothing here is shipped to a server, and nothing about it varies between programs.
 */
let lowerStatements: ((body: unknown, scope: EmitScope) => string[]) | undefined;

/** Wires the statement emitter in. Called once, by `statement.ts`. */
export function setStatementLowering(lower: (body: unknown, scope: EmitScope) => string[]): void {
  lowerStatements = lower;
}

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

      // A **static const of a kit value type** — `Alignment.bottomRight`, `AlignmentDirectional.topStart`.
      // Dart writes these as `Type.member` on a class the kit mirrors, and the kit mirrors them as static
      // members for exactly this reason, so the lowering is the same text with an import attached.
      //
      // Guarded on both halves: the resolved type must be one the kit provides (its library is
      // `package:flutter/…`, the same test `logic.New` uses), *and* the dotted name's prefix must be that
      // type's own name. Without the second check a `Ref` of any Flutter-typed expression would be rewritten
      // into a member access that does not exist; with it, the only thing that matches is the shape this
      // branch is for. A kit type that does not export the member is caught by `tsc` in the build proof
      // (`TS2339`), which is what that test is for.
      if (typeof name === 'string' && isKitProvided(node['type'] as Node | undefined)) {
        const typeName = String((node['type'] as Node | undefined)?.['name'] ?? '');
        const [prefix, ...rest] = name.split('.');
        if (typeName !== '' && prefix === typeName && rest.length === 1) {
          return `${scope.module.use(RUNTIME, typeName)}.${identifierOf(rest[0]!)}`;
        }

        // The same shape, where Flutter's **holder** class is not its value type. `Curves.easeInOut` has
        // type `Curve`, not `Curves`; `Colors.white` has type `Color`. The check above requires the dotted
        // prefix to *be* the type's name, so it matches neither — and M4-H's build proof is the first
        // fixture to reach one, because M4-E hoists every `Colors.*` into a token before it gets here.
        //
        // Widened to: the resolved type is kit-provided, the name is `Holder.member`, and the holder is
        // pluralisation-adjacent to the type. Requiring a relationship at all is what keeps this from
        // rewriting every Flutter-typed reference into a member access that does not exist; a holder the
        // kit does not export is caught by `tsc` in the build proof, which is what that test is for.
        if (rest.length === 1 && prefix !== undefined && typeName !== '' && isHolderOf(prefix, typeName)) {
          return `${scope.module.use(RUNTIME, prefix)}.${identifierOf(rest[0]!)}`;
        }
      }

      // Otherwise the `Ref` names something outside the program — `notifyListeners()`, a top-level Dart
      // function, a package API. Emitting the bare name produces a file that does not compile, and picking a
      // plausible replacement is inventing. `notifyListeners` is the instructive case: under ADR-4 a signal
      // write *is* the notification, so the call is redundant — but "redundant" is a judgement about
      // ChangeNotifier's semantics, which belongs to whatever models them, not to a name lookup here.
      // A name the generator *knows* it cannot lower gets the capability diagnostic, not the generic one.
      // `Navigator.pushNamed` is the case that forced this: reporting "not declared in this program" blamed
      // the program for a gap the compiler owns — the analyzer had already emitted the `app.RouteTransition`
      // for that very call, and the kit's router was waiting for it.
      const missing = typeof name === 'string' ? missingCapabilityOf(name, undefined) : undefined;
      if (missing !== undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          `\`${name}\` needs ${missing.capability}, which is not built yet. That work belongs to ` +
            `${OWNER_LABEL[missing.owner]}.` +
            (missing.workaround === undefined ? '' : ` For now: ${missing.workaround}.`),
          idOf(node),
        );
        return REFUSED;
      }

      scope.report(
        GeneratorDiagnosticCode.UnresolvedReference,
        'error',
        typeof name === 'string'
          ? `\`${name}\` is not declared in this program, so there is nothing to emit for it. It needs an ` +
            `override, or a pass that models what it means.`
          : 'a reference names neither a declaration in the program nor a name',
        idOf(node),
      );
      return REFUSED;
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
      const method = String(node['method'] ?? '');

      // Dart's subscript. `a[b]` **is** `a.operator[](b)` — the language says so, the analyzer resolves it
      // to that operator, and M4-H models it as the method call it is rather than as an opaque expression.
      // JavaScript spells the same operator the same way, so the lowering is the subscript back again.
      //
      // Without this the generic branch below emitted `a.__(b)`: `identifierOf('[]')` sanitises the brackets
      // into underscores, producing a method call on a name nothing declares. That is what the build proof
      // caught the first time a real `items[index]` reached the generator.
      if (method === '[]') {
        const args = asArray(node['args']);
        if (args.length === 1) {
          return `${receiver}[${emitExpression(args[0] as Node, scope)}]`;
        }
      }

      const args = emitArguments(node['args'], scope);
      return `${receiver}.${identifierOf(method)}(${args})`;
    }

    case 'logic.Call': {
      const target = node['callee'];
      const callee = emitExpression(target as Node, scope);
      // A refused callee stops the call. Emitting the arguments anyway produced one diagnostic per argument
      // for a call that was already refused — `Navigator.pushNamed(context, '/details')` reported three, two
      // of them naming `context`, a framework primitive nobody can act on. One refusal, at the callee, is the
      // whole fact; the rest was noise that buried it.
      //
      // Guarded on the callee *existing*, because {@link REFUSED} is also what an absent expression emits. A
      // call with no callee is a malformed document rather than a refusal, and it must keep falling through
      // to a `tsc` failure instead of vanishing with no diagnostic at all.
      if (target !== undefined && target !== null && callee === REFUSED) return REFUSED;

      // The named-argument refusal belongs **after** the callee, for the reason stated directly above: it is
      // part of "the rest", and it was the one piece still escaping the rule. M6-E measured what that cost:
      // `showDialog(context: …, builder: …)` reported `BRG3013` naming the missing capability *and* a
      // `BRG3002` saying the call "passes Dart named arguments", as though naming them differently might
      // help. The second reads as a defect in valid Flutter code and points at work no author can do.
      //
      // A call the generator *can* lower still gets `BRG3002`, which is the case that diagnostic is for.
      refuseNamedArgs(node, scope);
      return `${callee}(${emitArguments(node['args'], scope)})`;
    }

    case 'logic.New': {
      const typeName = String(node['typeName'] ?? '');

      // A `GlobalKey` is a handle on a live widget's `State`. UIR carries values, signals, routes and
      // components; it has nothing that denotes "the mounted element over there", so a key cannot be lowered
      // to anything that would work. Refused at its construction — the root of the whole pattern — rather
      // than at the `currentState!.validate()` call, so the diagnostic names the cause instead of a symptom.
      if (typeName === 'GlobalKey' || typeName.startsWith('GlobalKey<')) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedGlobalKey,
          'error',
          'a `GlobalKey` is a handle on a live widget\'s State, and UIR has no construct that denotes one — ' +
            'it is not a value, a signal, a route or a component. That gap belongs to the schema. A `Form` ' +
            'in this kit validates every registered field when it is submitted, which needs no key; ' +
            '`_formKey.currentState!.validate()` has no equivalent and is not emitted, because a button ' +
            'that compiles and does nothing is worse than one that is refused.',
          idOf(node),
        );
        return 'undefined';
      }
      const constructorName = node['constructorName'];
      const kitProvided = isKitProvided(node['type'] as Node | undefined);

      // Dart's named arguments have no positional equivalent in TypeScript, and lowering them needs the
      // callee's signature — which the program does not carry for an arbitrary user class, so `refuseNamedArgs`
      // refuses rather than guessing which parameter a value belongs to.
      //
      // For a **kit-provided** type the signature *is* known, because the kit authors it to a fixed
      // convention: Dart's named parameters become one options object, positional stay positional. That is
      // how `EdgeInsets.symmetric({ vertical: 8 })` and `new BoxConstraints({ maxWidth: 400 })` are already
      // written, and applying the convention here is what makes them reachable — before M4-B, every named-arg
      // construction of a framework value type was a hard `BRG3002`, including `EdgeInsets.symmetric`, whose
      // kit signature had been waiting for it since M3-A.
      if (!kitProvided) refuseNamedArgs(node, scope);

      const positional = emitArguments(node['args'], scope);
      const named = node['namedArgs'];
      const options =
        kitProvided && typeof named === 'object' && named !== null && Object.keys(named).length > 0
          ? // Sorted, so the emitted bytes do not depend on the order the analyzer happened to walk the
            // argument list — the same rule the element emitter applies to props.
            `{ ${Object.keys(named as Record<string, Node>)
              .sort()
              .map((key) => `${identifierOf(key)}: ${emitExpression((named as Record<string, Node>)[key]!, scope)}`)
              .join(', ')} }`
          : undefined;
      const args = [positional, options].filter((part) => part !== undefined && part !== '').join(', ');

      // ## A construction of the application's own class has nothing to construct
      //
      // M3-B does not emit `logic.ClassDecl` — `types.ts` records that, which is why a user type in a
      // parameter position lowers to `unknown` rather than to an invented interface. The *value* side had no
      // such check: `const Wonder('Petra', …)` emitted `new Wonder('Petra', …)` referring to a class the
      // generator had not written, and nothing said so. It compiled through every stage and failed at `tsc`
      // with `TS2552: Cannot find name 'Wonder'`, which is the emitted project's problem to explain rather
      // than the compiler's — precisely the "compiles around the hole" outcome the severity rule forbids.
      //
      // Refused here, with the class named. Not for a *framework* type: those are the kit's, and the kit
      // exports them.
      if (!kitProvided && !scope.declaresClass(typeName)) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          `\`${typeName}\` is one of this application's own classes, and this generator does not emit ` +
            `class declarations — so \`new ${typeName}(…)\` would name a type the project does not ` +
            `contain. Missing capability: lowering a \`logic.ClassDecl\` to a TypeScript class. Owner: ` +
            `this generator.`,
          idOf(node),
        );
        return REFUSED;
      }

      // A kit-provided type must be imported, or the reference dangles at `tsc` (D2). The import is registered
      // here, automatically, from the type's own library; `module.use` returns the local name and folds a
      // repeat into one import. A user type is written as-is, with no kit import invented.
      const name = kitProvided ? scope.module.use(RUNTIME, typeName) : identifierOf(typeName);
      // A named constructor — `EdgeInsets.all(16)` — is a static method in TypeScript, which is the shape the
      // kit's own `EdgeInsets` has, so it lowers without a `new`.
      if (typeof constructorName === 'string' && constructorName !== '') {
        return `${name}.${identifierOf(constructorName)}(${args})`;
      }
      return `new ${name}(${args})`;
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
      const declared = asArray(node['params']).map((p) => String((p as Node)['name'] ?? '_'));
      const params = declared.map((name) => identifierOf(name)).join(', ');

      // A lambda's parameters are in scope *inside* it, and were not before M4-F: `validator: (value) { … }`
      // lowered a body in which `value` resolved to nothing and became `BRG3006`. It had never come up
      // because no earlier fixture put a lambda with a *body* in the widget tree — a store's action carries
      // its parameters on the `sig.Action`, which `childScope` already handled.
      //
      // Resolution is by name and innermost-first, which is ordinary lexical scoping: a parameter shadows an
      // outer name of the same spelling, exactly as it does in Dart.
      const names = new Set(declared);
      const inner: EmitScope = {
        ...scope,
        report: scope.report.bind(scope),
        node: scope.node.bind(scope),
        signalRead: scope.signalRead.bind(scope),
        signalLocal: scope.signalLocal.bind(scope),
        localName: scope.localName.bind(scope),
        declaredName: scope.declaredName.bind(scope),
        paramInScope: (name) => (names.has(name) ? identifierOf(name) : scope.paramInScope(name)),
      };

      const body = node['body'];

      // A **statement** body — `(value) { if (value == null) return 'required'; return null; }`, which is
      // what every form validator is. It lowers to a block-bodied arrow, which is the same shape in both
      // languages. Before M4-F this warned and then handed the statement *array* to the expression emitter,
      // which reported it as `<unknown>`: a warning followed by an error, and no working output.
      if (Array.isArray(body)) {
        if (lowerStatements === undefined) {
          scope.report(
            GeneratorDiagnosticCode.UnsupportedExpression,
            'error',
            'a lambda with a statement body reached the expression emitter before the statement emitter ' +
              'was wired in. That is a build defect in this package, not a defect in the program.',
            idOf(node),
          );
          return 'undefined';
        }
        const lines = lowerStatements(body, inner);
        return `(${params}) => {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
      }

      return `(${params}) => ${emitExpression(node['body'] as Node, inner)}`;
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

/** The identifier of a signal object in scope — asked for directly, never parsed out of a read. */
function signalName(id: string, scope: EmitScope): string {
  return scope.signalLocal(id) ?? '';
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
