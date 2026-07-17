// `TypeRef` → TypeScript.
//
// Shared by the component emitter (constructor params) and the store emitter (action params, Spec v2.5
// §A18). It was private to the component emitter until actions gained parameters and needed the same answer —
// and two functions answering "what is `int` in TypeScript" would eventually answer differently.

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
  const name = typeof type?.['name'] === 'string' ? type['name'] : 'unknown';
  const nullable = type?.['nullable'] === true;
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
