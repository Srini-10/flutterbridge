// `dart:core` `String` and numeric members — lowered by the receiver's resolved type, or refused by name (ADR-0054).
//
// Until M11 the generator emitted `receiver.member` for any member of a `String` or number, with no diagnostic: a string
// has no `isEmpty`, so `s.isEmpty` was `undefined` (falsy) and a validator's "required" branch never ran; `padLeft`,
// `contains`, `codeUnitAt`, `replaceFirst` were `TypeError`s at click time; `s * 2` was `NaN`. The policy is the collection
// one (ADR-0051) applied to the rest of `dart:core`: a member with a row here is lowered to the runtime's Dart-exact helper
// (verified differentially against real Dart) or to the JavaScript spelling that means the same thing; a member without one
// is refused, and the message says what *is* lowered.

type Node = Record<string, unknown>;

/** What the lowering needs from the expression emitter. */
export interface SdkDeps {
  /** Registers and returns the local name of a runtime-kit export. */
  readonly use: (name: string) => string;
  /** The `dart:core` base type name of an argument node, if any. */
  readonly typeOf: (node: Node | undefined) => string | undefined;
}

interface StringRow {
  /** Accepted argument counts. */
  readonly arity: readonly number[];
  /** Every argument must be a `String` (a `Pattern` — a `RegExp` — is a different operation). */
  readonly stringArgs?: boolean;
  /** Emits the call from the receiver text and argument texts. */
  readonly emit: (receiver: string, args: readonly string[], deps: SdkDeps) => string;
}

const same = (name: string) => (receiver: string, args: readonly string[]): string => `${receiver}.${name}(${args.join(', ')})`;
const helper = (name: string) => (receiver: string, args: readonly string[], deps: SdkDeps): string =>
  `${deps.use(name)}(${[receiver, ...args].join(', ')})`;

const STRING_METHODS: Readonly<Record<string, StringRow>> = {
  toUpperCase: { arity: [0], emit: same('toUpperCase') },
  toLowerCase: { arity: [0], emit: same('toLowerCase') },
  trim: { arity: [0], emit: same('trim') },
  trimLeft: { arity: [0], emit: same('trimStart') },
  trimRight: { arity: [0], emit: same('trimEnd') },
  toString: { arity: [0], emit: (receiver: string) => receiver },
  startsWith: { arity: [1, 2], stringArgs: false, emit: same('startsWith') },
  endsWith: { arity: [1], emit: same('endsWith') },
  indexOf: { arity: [1, 2], stringArgs: false, emit: same('indexOf') },
  lastIndexOf: { arity: [1, 2], stringArgs: false, emit: same('lastIndexOf') },
  contains: { arity: [1, 2], stringArgs: false, emit: same('includes') },
  split: { arity: [1], emit: same('split') },
  substring: { arity: [1, 2], emit: helper('strSubstring') },
  codeUnitAt: { arity: [1], emit: helper('strCodeUnitAt') },
  padLeft: { arity: [1, 2], emit: helper('strPadLeft') },
  padRight: { arity: [1, 2], emit: helper('strPadRight') },
  replaceAll: { arity: [2], emit: helper('strReplaceAll') },
  replaceFirst: { arity: [2], emit: helper('strReplaceFirst') },
};

/** Methods whose *first* argument may be a `String` only (a `Pattern`/`RegExp` is refused, not approximated). */
const PATTERN_FIRST: ReadonlySet<string> = new Set([
  'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'contains', 'split', 'replaceAll', 'replaceFirst',
]);

/**
 * Lowers a `String` method call.
 *
 * @param argNodes - the argument nodes, for their types.
 * @returns the text, or `undefined` when the method (or its arguments) has no lowering.
 */
export function lowerStringMethod(
  method: string,
  receiver: string,
  argNodes: readonly Node[],
  argTexts: readonly string[],
  deps: SdkDeps,
): string | undefined {
  const row = STRING_METHODS[method];
  if (row === undefined || !row.arity.includes(argTexts.length)) return undefined;
  if (PATTERN_FIRST.has(method) && argNodes[0] !== undefined && deps.typeOf(argNodes[0]) !== 'String') return undefined;
  if (method === 'replaceAll' || method === 'replaceFirst') {
    if (deps.typeOf(argNodes[1]) !== 'String') return undefined;
  }
  return row.emit(receiver, argTexts, deps);
}

/** The refusal text for a `String` member with no row. */
export function unsupportedStringMember(member: string): string {
  return (
    `\`String.${member}\` has no lowering. This generator lowers \`length\`, \`isEmpty\`, \`isNotEmpty\`, and the methods ` +
    `${Object.keys(STRING_METHODS).map((m) => `\`${m}\``).join(', ')} (with \`String\` patterns; a \`RegExp\` is refused) and ` +
    '`*` — the ones whose Dart meaning has a verified JavaScript lowering (ADR-0054). Emitting the Dart member name on a ' +
    'JavaScript string would be `undefined` or a `TypeError`, silently.'
  );
}

/** Lowers a `String` property read. */
export function lowerStringProperty(property: string, receiver: string): string | undefined {
  if (property === 'length') return `${receiver}.length`;
  if (property === 'isEmpty') return `(${receiver}.length === 0)`;
  if (property === 'isNotEmpty') return `(${receiver}.length > 0)`;
  return undefined;
}

/** Lowers a numeric (`int`, `double`, `num`) property read. */
export function lowerNumericProperty(type: string, property: string, receiver: string): string | undefined {
  const isInt = type === 'int';
  switch (property) {
    case 'isEven':
      return isInt ? `(${receiver} % 2 === 0)` : undefined;
    case 'isOdd':
      return isInt ? `(${receiver} % 2 !== 0)` : undefined;
    case 'isNegative':
      // Dart: `-0.0.isNegative` is true; an `int` has no negative zero.
      return isInt ? `(${receiver} < 0)` : `((_n) => _n < 0 || Object.is(_n, -0))(${receiver})`;
    case 'isNaN':
      return isInt ? undefined : `Number.isNaN(${receiver})`;
    case 'isFinite':
      return isInt ? undefined : `Number.isFinite(${receiver})`;
    case 'isInfinite':
      return isInt ? undefined : `((_n) => _n === Infinity || _n === -Infinity)(${receiver})`;
    default:
      return undefined;
  }
}

/** The refusal text for a numeric property with no row. */
export function unsupportedNumericProperty(type: string, property: string): string {
  return (
    `\`${type}.${property}\` has no lowering. This generator lowers \`isEven\`, \`isOdd\`, \`isNegative\` (on an \`int\`) and ` +
    '`isNaN`, `isFinite`, `isInfinite`, `isNegative` (on a `double`/`num`) — the getters whose Dart meaning has a verified ' +
    'JavaScript lowering (ADR-0054). Emitting the Dart getter name on a JavaScript number would be `undefined`, silently.'
  );
}
