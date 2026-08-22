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
 * `dart:core`/`dart:async` value types the runtime kit provides, usable as a **type position** — the
 * sibling of `runtime.ts`'s own `SDK_VALUE_TYPES` (M4-H), which answers the identical question for a
 * *construction* (`logic.New`). Kept separate rather than imported, so this file does not need to import
 * `runtime.ts` for one constant; both are keyed `library#name` by the identical convention.
 *
 * M8-V: `Duration` is the one member — the kit already exports the class (M7-L, `Future.delayed`), and
 * `logic.New{typeName:'Duration'}` already resolves through it; only *reading* a `Duration`-typed
 * parameter/property was still `unknown`, since nothing before this called `typeTextOf` with a way to
 * register the import a resolved reference needs.
 */
const SDK_VALUE_TYPE_NAMES: ReadonlySet<string> = new Set(['dart:core#Duration']);

/**
 * The TypeScript type for a `TypeRef`.
 *
 * @param type - the `TypeRef`, or `undefined`.
 * @param use - registers an import for a kit-provided SDK value type (M8-V) and returns the local name to
 *   write; omitted by a caller with no module to import into, in which case a kit-provided type falls
 *   back to `unknown` exactly as before — never a bare, unimported reference.
 * @returns the type text. `unknown` for anything not primitive and not kit-provided.
 */
export function typeTextOf(type: Node | undefined, use?: (name: string) => string): string {
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

  // A `dart:core`/`dart:async` value type the kit exports (M8-V) — checked by the type's own resolved
  // **library**, the identical test `runtime.ts`'s `isKitProvided` already uses for a construction, never
  // by the bare name alone: a project-defined class also named `Duration` resolves to the project's own
  // package URI, never `dart:core`, confirmed directly against real Continuum evidence (no such class
  // exists there, but the check does not rely on that — it is sound regardless).
  const library = type?.['library'];
  if (use !== undefined && typeof library === 'string' && SDK_VALUE_TYPE_NAMES.has(`${library}#${name}`)) {
    const base = use(name);
    return nullable ? `${base} | null` : base;
  }

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
 * @param use - forwarded to `typeTextOf` (M8-V) — a kit-provided parameter type (`Duration`) needs an
 *   import, and this is the one place a param list's own caller can supply one.
 * @returns the text between the parentheses.
 */
export function paramListOf(
  params: readonly Node[],
  identifier: (raw: string) => string,
  use?: (name: string) => string,
): string {
  return params
    .map((param) => {
      const name = identifier(String(param['name'] ?? '_'));
      // Dart's optional parameter is TypeScript's `?`. A *named* parameter is not modelled: Dart's
      // `foo({required int id})` is called `foo(id: 1)`, which has no positional equivalent, and the store
      // emitter reports it rather than quietly turning it into a positional one at a position the caller
      // would have to guess.
      const optional = param['required'] === false && param['defaultValue'] === undefined ? '?' : '';
      return `${name}${optional}: ${typeTextOf(param['type'] as Node | undefined, use)}`;
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
