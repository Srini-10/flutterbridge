// `TypeRef` → TypeScript.
//
// Shared by the component emitter (constructor params) and the store emitter (action params, Spec v2.5
// §A18). It was private to the component emitter until actions gained parameters and needed the same answer —
// and two functions answering "what is `int` in TypeScript" would eventually answer differently.

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';

/** A `TypeRef`, loosely typed: nested values are not `AnyUirNode`. */
type Node = Record<string, unknown>;

/**
 * Dart's primitives, and nothing else.
 *
 * A user type maps to `unknown` rather than to an invented interface. Emitting `Item` would reference a type
 * this generator has not produced — M3-B does not emit `logic.ClassDecl` — and the file would not compile.
 * `unknown` compiles, and is true: the generator genuinely does not know what an `Item` is.
 *
 * `dynamic` and `Object` are `unknown` rather than `any` deliberately. `any` would let the emitted code do
 * anything with a value whose type the program declined to state, and the first thing it would do is compile
 * a mistake.
 */
const PRIMITIVES: Readonly<Record<string, string>> = {
  int: 'number',
  double: 'number',
  num: 'number',
  String: 'string',
  bool: 'boolean',
  void: 'void',
  dynamic: 'unknown',
  Object: 'unknown',
};

/**
 * The TypeScript type for a `TypeRef`.
 *
 * @param type - the `TypeRef`, or `undefined`.
 * @returns the type text. `unknown` for anything not primitive.
 */
export function typeTextOf(type: Node | undefined): string {
  const declared = typeof type?.['name'] === 'string' ? type['name'] : 'unknown';
  const nullable = type?.['nullable'] === true;

  // The `?` is stripped before the lookup, and that is not cosmetic. A `TypeRef.name` is the analyzer's
  // `getDisplayString()`, which spells a nullable type `bool?` — *and* the ref sets `nullable: true`
  // separately, so the suffix is a second statement of the same fact. Looking `bool?` up in a table keyed by
  // `bool` missed, so **every nullable primitive became `unknown`**: a `bool?` parameter emitted as
  // `unknown | null`, and `value ?? false` then had type `{}`, which does not assign to `boolean`.
  //
  // It went unseen until M4-F because nullable primitives only reach here as *parameters*, and no fixture had
  // a callback taking one until a form did — `onChanged: (bool? value)` is Flutter's own signature for a
  // tristate checkbox.
  const name = declared.endsWith('?') ? declared.slice(0, -1) : declared;
  const base = PRIMITIVES[name] ?? 'unknown';
  // Dart's nullable `int?` is `number | null`, not `number | undefined`: Dart has one absent value and it is
  // `null`, and a Dart `null` crossing into JavaScript is still `null`.
  return nullable ? `${base} | null` : base;
}

/**
 * A parameter list, as TypeScript.
 *
 * Positional order is the source's, and is the call site's contract — see the store emitter.
 *
 * @param params - the `ParamDecl`s, in order.
 * @param identifier - how to make a name safe.
 * @returns the text between the parentheses.
 */
export function paramListOf(params: readonly Node[], identifier: (raw: string) => string): string {
  return params
    .map((param) => {
      const name = identifier(String(param['name'] ?? '_'));
      // Dart's optional parameter is TypeScript's `?`. A *named* parameter is not modelled: Dart's
      // `foo({required int id})` is called `foo(id: 1)`, which has no positional equivalent, and the store
      // emitter reports it rather than quietly turning it into a positional one at a position the caller
      // would have to guess.
      const optional = param['required'] === false && param['defaultValue'] === undefined ? '?' : '';
      return `${name}${optional}: ${typeTextOf(param['type'] as Node | undefined)}`;
    })
    .join(', ');
}

/**
 * Refuses Dart named parameters — shared by the store emitter (action params) and the top-level function
 * emitter (ADR-29, M8-U), the same reason `paramListOf`/`typeTextOf` are shared.
 *
 * `toggle({required int id})` is called `toggle(id: 1)`. TypeScript has no named arguments: the honest
 * lowering is an options object, and which shape that object has is a decision — one that changes every call
 * site and that no evidence in the corpus yet supports. Emitting them as positional would compile and would
 * silently reorder arguments at any call site that passed them out of declaration order.
 *
 * @param subject - what to call the thing that has them in the diagnostic — `'action'` or `'function'`.
 * @param report - the scope's own `report`, bound; kept minimal (not the whole `EmitScope`) so this needs
 *   no import of `expression.ts`'s own type here.
 */
export function refuseNamedParams(
  params: readonly Node[],
  id: string,
  subject: string,
  report: (code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string) => void,
): boolean {
  const named = params.filter((param) => param['named'] === true).map((param) => String(param['name']));
  if (named.length === 0) return false;
  report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `this ${subject} takes the named parameter(s) ${named.map((n) => `\`${n}\``).join(', ')}. TypeScript has ` +
      `no named arguments, and lowering them to positional ones would silently reorder any call that passed ` +
      `them out of declaration order.`,
    id,
  );
  return true;
}
