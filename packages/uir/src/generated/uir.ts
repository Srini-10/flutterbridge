// GENERATED CODE — DO NOT EDIT
//
// Produced by tools/schema-codegen from packages/uir/schema/*.json.
// UIR schema version: 1.3.0
//
// Edit the schema and re-run `pnpm codegen`. Hand-edits to this file are lost on the next run,
// and CI fails if this file does not match the schema (drift check).

/* eslint-disable */

import { createHash } from 'node:crypto';

/** The UIR schema version this module was generated from. */
export const UIR_VERSION = '1.3.0' as const;

/** A hash of the schema sources this module was generated from. */
export const UIR_SCHEMA_HASH = 'd18f741b2e7c669b' as const;

/** Node kind -> the fields of that node which hold `NodeId` references. */
export const UIR_REFERENCE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'sig.Action': ['id', 'writes'],
  'logic.Assign': ['id'],
  'logic.Await': ['id'],
  'logic.Binary': ['id'],
  'logic.Block': ['id'],
  'logic.Break': ['id'],
  'logic.Call': ['id'],
  'logic.Cast': ['id'],
  'logic.ClassDecl': ['id'],
  'ui.Component': ['id', 'localSignals'],
  'logic.Conditional': ['id'],
  'bind.Const': ['id'],
  'logic.Continue': ['id'],
  'sig.Derived': ['deps', 'id'],
  'sig.Effect': ['deps', 'id'],
  'app.Endpoint': ['id'],
  'logic.EnumDecl': ['id'],
  'bind.Expr': ['id'],
  'logic.ExprStmt': ['id'],
  'logic.FieldDecl': ['id'],
  'logic.For': ['id'],
  'logic.FunctionDecl': ['id'],
  'logic.If': ['id'],
  'logic.Lambda': ['id'],
  'logic.ListLit': ['id'],
  'logic.Lit': ['id'],
  'logic.MapLit': ['id'],
  'logic.MethodCall': ['id'],
  'logic.New': ['id'],
  'logic.NullCheck': ['id'],
  'logic.OpaqueDecl': ['id'],
  'logic.OpaqueExpr': ['id'],
  'logic.OpaqueStmt': ['id'],
  'bind.Param': ['id'],
  'logic.PropertyAccess': ['id'],
  'logic.Ref': ['id', 'target'],
  'logic.Return': ['id'],
  'app.Route': ['component', 'guards', 'id', 'layout'],
  'app.RouteTransition': ['component', 'id', 'source', 'target'],
  'sig.Signal': ['id', 'store'],
  'bind.Signal': ['id', 'signal'],
  'l0.SourceFile': ['id'],
  'app.Store': ['actions', 'derived', 'id', 'signals'],
  'logic.StringInterp': ['id'],
  'logic.Switch': ['id'],
  'logic.Throw': ['id'],
  'app.Token': ['id'],
  'logic.TryCatch': ['id'],
  'logic.TypeAliasDecl': ['id'],
  'ui.Async': ['id'],
  'ui.Cond': ['id'],
  'ui.Element': ['id'],
  'ui.List': ['id'],
  'ui.Opaque': ['id'],
  'ui.OverrideRef': ['id'],
  'ui.SlotRef': ['id'],
  'ui.Text': ['id'],
  'logic.Unary': ['id'],
  'logic.VarDecl': ['id'],
  'logic.While': ['id'],
};

/** Raised when JSON does not conform to the schema. Deserialization validates; it never guesses. */
export class UirParseError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'UirParseError';
  }
}

/**
 * Reads an own property.
 *
 * Never `json[key]`: a plain object inherits `constructor`, `toString` and friends from
 * Object.prototype, so a plain lookup can return a function for a field the document never set.
 */
function own(json: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(json, key) ? json[key] : undefined;
}

function req(json: Record<string, unknown>, key: string, path: string): unknown {
  const value = own(json, key);
  if (value === undefined || value === null) {
    throw new UirParseError(`${path}.${key}`, 'required field is missing');
  }
  return value;
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UirParseError(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new UirParseError(path, 'expected a string');
  return value;
}

function asInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new UirParseError(path, 'expected an integer');
  }
  return value;
}

function asBool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new UirParseError(path, 'expected a boolean');
  return value;
}

function asList<T>(value: unknown, path: string, item: (v: unknown, p: string) => T): readonly T[] {
  if (!Array.isArray(value)) throw new UirParseError(path, 'expected an array');
  return value.map((v, i) => item(v, `${path}[${i}]`));
}

function asMap<T>(
  value: unknown,
  path: string,
  item: (v: unknown, p: string) => T,
): Readonly<Record<string, T>> {
  const raw = asObject(value, path);
  const out: Record<string, T> = {};
  for (const key of Object.keys(raw).sort()) out[key] = item(raw[key], `${path}.${key}`);
  return out;
}

function asEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  const s = asString(value, path);
  if (!(values as readonly string[]).includes(s)) {
    throw new UirParseError(path, `expected one of ${values.join(' | ')}, got "${s}"`);
  }
  return s as T;
}

/** Canonical JSON: keys sorted recursively, so serialization is byte-stable (Spec §2.5, ADR-7). */
export function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = canonicalJson(source[key]);
    }
    return out;
  }
  return value;
}

/** The largest integer an IEEE-754 double represents exactly: 2^53 - 1. */
export const MAX_SAFE_INTEGER = 9007199254740991;

/**
 * A number, in canonical form (Spec v2.3 §A15).
 *
 * Not `JSON.stringify`. A host's encoder formats numbers the way *that host* likes: Dart writes the
 * double 100.0 as `100.0` and JavaScript writes it as `100`; JavaScript writes `-0` as `0` and loses
 * the sign. Both are valid JSON and they are different bytes — so two conforming implementations would
 * hash the same node to two different ids, and an override would miss, a cache would serve the wrong
 * artifact, and an incremental build would stop matching a clean one (§A16).
 */
export function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('NaN and infinities have no canonical form (§A15)');
  }

  // No magnitude check here, and that is deliberate. §A15 prohibits *integer-typed* values beyond
  // 2^53-1 — a 64-bit Dart int that cannot survive a double. JavaScript has no such type: every number
  // IS a double, so every number round-trips through its own shortest form exactly, and 1e21 is a
  // perfectly good double. Rejecting it here would reject a value Dart is allowed to emit.
  //
  // The guard belongs where the type exists: Dart refuses to *emit* an out-of-range int (BRG1209), so
  // one can never reach this side to be misread.

  // Unsigned zero. IEEE-754 distinguishes -0 from 0; the UIR does not.
  if (value === 0) return '0';

  // JavaScript's shortest-round-trip form agrees with Dart's digit for digit, including the exponent
  // thresholds. It never emits a trailing `.0`, so there is nothing to strip.
  return String(value);
}

/**
 * Canonical JSON **text** — the bytes a node's identity is a hash of (§A15, §A16).
 *
 * The only encoder the compiler may use for UIR.
 */
export function canonicalEncode(value: unknown): string {
  return encode(canonicalJson(value));
}

function encode(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (typeof value === 'object') {
    // Already sorted by canonicalJson. Sorting again would be a second opinion about key order.
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${encode(v)}`).join(',')}}`;
  }
  throw new TypeError(`not JSON-representable: ${typeof value}`);
}

/** How many hex characters of the digest an id keeps (Spec §2.3). */
export const NODE_ID_LENGTH = 16;

/**
 * Strips `id`, `anchor` and `span` from a value and from **everything inside it**.
 *
 * Recursively, and that is the subtle part. A parent embeds its children whole, so hashing an unstripped
 * parent would change its id whenever a *child* moved — and a child moves whenever a line is inserted
 * above it.
 */
export function stripIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdentity);
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      if (key === 'id' || key === 'anchor' || key === 'span') continue;
      out[key] = stripIdentity(source[key]);
    }
    return out;
  }
  return value;
}

/**
 * The id of a **tree node**: a hash of its canonical content (Spec §2.3, v2.3 §A16).
 *
 * Two identical subtrees have one id. That is what content addressing means.
 */
export function nodeIdOfContent(content: unknown): string {
  return digest('n', canonicalEncode(stripIdentity(content)));
}

/**
 * The id of a **declaration**: a hash of its stable symbol.
 *
 * Not of its content. Editing the body of a method must not change the id of the signal it writes.
 */
export function nodeIdOfSymbol(symbol: string): string {
  return digest('d', symbol);
}

/**
 * **The** id function. Both language domains generate this from one template, so they cannot drift —
 * which is the point of §A16, and which a hand-written copy in each domain would quietly undo.
 */
function digest(tier: string, payload: string): string {
  return createHash('sha256')
    .update(`${tier}:${payload}`, 'utf8')
    .digest('hex')
    .slice(0, NODE_ID_LENGTH);
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEquals(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    return (
      ka.length === kb.length &&
      ka.every((k, i) => k === kb[i]) &&
      ka.every((k) => deepEquals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

/// How an assignment combines its target with its value (Spec v2.2 §A10).
///
/// An enum, not a free-form string: a generator that receives an operator it does not know must fail to compile rather than silently emit the wrong arithmetic. `Binary.operator` is a string because a binary operator is pure — the worst a wrong one does is compute the wrong number. A wrong assignment operator writes the wrong value to state.
export const AssignmentOperator = {
  /// `=` — replace the target's value.
  assign: 'assign',
  /// `+=`
  addAssign: 'addAssign',
  /// `-=`
  subtractAssign: 'subtractAssign',
  /// `*=`
  multiplyAssign: 'multiplyAssign',
  /// `/=`
  divideAssign: 'divideAssign',
  /// `~/=` — Dart's integer division. JavaScript has no operator for it, so a generator must emit `Math.trunc(a / b)`; conflating it with `/=` silently changes the result type.
  truncatingDivideAssign: 'truncatingDivideAssign',
  /// `%=` — Dart's modulo is always non-negative for a positive divisor; JavaScript's `%` is not. A generator must not assume they agree.
  moduloAssign: 'moduloAssign',
  /// `??=` — assign only if the target is null.
  ifNullAssign: 'ifNullAssign',
  /// `&=`
  bitAndAssign: 'bitAndAssign',
  /// `|=`
  bitOrAssign: 'bitOrAssign',
  /// `^=`
  bitXorAssign: 'bitXorAssign',
  /// `<<=`
  shiftLeftAssign: 'shiftLeftAssign',
  /// `>>=`
  shiftRightAssign: 'shiftRightAssign',
  /// `>>>=`
  unsignedShiftRightAssign: 'unsignedShiftRightAssign',
  /// `++` — `value` is absent.
  increment: 'increment',
  /// `--` — `value` is absent.
  decrement: 'decrement',
} as const;

/// How an assignment combines its target with its value (Spec v2.2 §A10).
///
/// An enum, not a free-form string: a generator that receives an operator it does not know must fail to compile rather than silently emit the wrong arithmetic. `Binary.operator` is a string because a binary operator is pure — the worst a wrong one does is compute the wrong number. A wrong assignment operator writes the wrong value to state.
export type AssignmentOperator = (typeof AssignmentOperator)[keyof typeof AssignmentOperator];

const assignmentOperatorValues = Object.values(AssignmentOperator) as readonly AssignmentOperator[];

/** Parses a {@link AssignmentOperator}. Rejects any value outside the enum. */
export function parseAssignmentOperator(value: unknown, path = 'AssignmentOperator'): AssignmentOperator {
  return asEnum(value, path, assignmentOperatorValues);
}

/// Diagnostic codes reserved by the schema because a node or a pass carries them (Spec v2.1 §A6).
///
/// Only codes the UIR itself refers to are listed. The full registry lives in the compiler.
export const DiagnosticCode = {
  /// A non-serializable object was passed as a route argument (ADR-11a). A URL route carries an identifier, not an object graph. Error.
  BRG2301: 'BRG2301',
  /// Cross-route state was promoted to a store by N11 (ADR-11). Informational — promotion is never silent.
  BRG2302: 'BRG2302',
  /// A cross-route callback could not be promoted; an override is required (ADR-11). Error.
  BRG2303: 'BRG2303',
} as const;

/// Diagnostic codes reserved by the schema because a node or a pass carries them (Spec v2.1 §A6).
///
/// Only codes the UIR itself refers to are listed. The full registry lives in the compiler.
export type DiagnosticCode = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];

const diagnosticCodeValues = Object.values(DiagnosticCode) as readonly DiagnosticCode[];

/** Parses a {@link DiagnosticCode}. Rejects any value outside the enum. */
export function parseDiagnosticCode(value: unknown, path = 'DiagnosticCode'): DiagnosticCode {
  return asEnum(value, path, diagnosticCodeValues);
}

/// When an effect runs.
export const EffectTiming = {
  /// On mount — Flutter's `initState`.
  mount: 'mount',
  /// On dependency change — Flutter's `didUpdateWidget`.
  update: 'update',
  /// On unmount — Flutter's `dispose`.
  unmount: 'unmount',
} as const;

/// When an effect runs.
export type EffectTiming = (typeof EffectTiming)[keyof typeof EffectTiming];

const effectTimingValues = Object.values(EffectTiming) as readonly EffectTiming[];

/** Parses a {@link EffectTiming}. Rejects any value outside the enum. */
export function parseEffectTiming(value: unknown, path = 'EffectTiming'): EffectTiming {
  return asEnum(value, path, effectTimingValues);
}

/// An HTTP method.
export const HttpMethod = {
  /// GET.
  get: 'get',
  /// POST.
  post: 'post',
  /// PUT.
  put: 'put',
  /// PATCH.
  patch: 'patch',
  /// DELETE.
  delete: 'delete',
} as const;

/// An HTTP method.
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

const httpMethodValues = Object.values(HttpMethod) as readonly HttpMethod[];

/** Parses a {@link HttpMethod}. Rejects any value outside the enum. */
export function parseHttpMethod(value: unknown, path = 'HttpMethod'): HttpMethod {
  return asEnum(value, path, httpMethodValues);
}

/// Which implementation of Flutter's layout protocol a subtree needs (Spec §5, risk R2).
export const LayoutTier = {
  /// Expressible in flexbox/grid. The default, and the cheapest: no measurement at runtime.
  css: 'css',
  /// Requires runtime measurement (ResizeObserver), because CSS cannot express the constraint.
  measured: 'measured',
} as const;

/// Which implementation of Flutter's layout protocol a subtree needs (Spec §5, risk R2).
export type LayoutTier = (typeof LayoutTier)[keyof typeof LayoutTier];

const layoutTierValues = Object.values(LayoutTier) as readonly LayoutTier[];

/** Parses a {@link LayoutTier}. Rejects any value outside the enum. */
export function parseLayoutTier(value: unknown, path = 'LayoutTier'): LayoutTier {
  return asEnum(value, path, layoutTierValues);
}

/// A Material 3 colour role.
///
/// ADR-13: `hello_bridge` declares only `brightness`, `primaryColor` and `scaffoldBackgroundColor`; every other colour Flutter paints is *derived* algorithmically. That information is not in the Dart source text — it is in Material's algorithm — so N10 computes the full role set with `material_color_utilities`, the same package Flutter itself uses. The colours we copied verbatim matched exactly; the ones we guessed were wrong by up to 15/255 per channel, invisibly (M0-T5 F1).
export const MaterialRole = {
  /// The Material 3 `primary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primary: 'primary',
  /// The Material 3 `onPrimary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimary: 'onPrimary',
  /// The Material 3 `primaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryContainer: 'primaryContainer',
  /// The Material 3 `onPrimaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryContainer: 'onPrimaryContainer',
  /// The Material 3 `primaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryFixed: 'primaryFixed',
  /// The Material 3 `primaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryFixedDim: 'primaryFixedDim',
  /// The Material 3 `onPrimaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryFixed: 'onPrimaryFixed',
  /// The Material 3 `onPrimaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryFixedVariant: 'onPrimaryFixedVariant',
  /// The Material 3 `secondary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondary: 'secondary',
  /// The Material 3 `onSecondary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondary: 'onSecondary',
  /// The Material 3 `secondaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryContainer: 'secondaryContainer',
  /// The Material 3 `onSecondaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryContainer: 'onSecondaryContainer',
  /// The Material 3 `secondaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryFixed: 'secondaryFixed',
  /// The Material 3 `secondaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryFixedDim: 'secondaryFixedDim',
  /// The Material 3 `onSecondaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryFixed: 'onSecondaryFixed',
  /// The Material 3 `onSecondaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryFixedVariant: 'onSecondaryFixedVariant',
  /// The Material 3 `tertiary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiary: 'tertiary',
  /// The Material 3 `onTertiary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiary: 'onTertiary',
  /// The Material 3 `tertiaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryContainer: 'tertiaryContainer',
  /// The Material 3 `onTertiaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryContainer: 'onTertiaryContainer',
  /// The Material 3 `tertiaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryFixed: 'tertiaryFixed',
  /// The Material 3 `tertiaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryFixedDim: 'tertiaryFixedDim',
  /// The Material 3 `onTertiaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryFixed: 'onTertiaryFixed',
  /// The Material 3 `onTertiaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryFixedVariant: 'onTertiaryFixedVariant',
  /// The Material 3 `error` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  error: 'error',
  /// The Material 3 `onError` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onError: 'onError',
  /// The Material 3 `errorContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  errorContainer: 'errorContainer',
  /// The Material 3 `onErrorContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onErrorContainer: 'onErrorContainer',
  /// The Material 3 `surface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surface: 'surface',
  /// The Material 3 `onSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSurface: 'onSurface',
  /// The Material 3 `surfaceDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceDim: 'surfaceDim',
  /// The Material 3 `surfaceBright` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceBright: 'surfaceBright',
  /// The Material 3 `surfaceContainerLowest` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerLowest: 'surfaceContainerLowest',
  /// The Material 3 `surfaceContainerLow` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerLow: 'surfaceContainerLow',
  /// The Material 3 `surfaceContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainer: 'surfaceContainer',
  /// The Material 3 `surfaceContainerHigh` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerHigh: 'surfaceContainerHigh',
  /// The Material 3 `surfaceContainerHighest` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerHighest: 'surfaceContainerHighest',
  /// The Material 3 `onSurfaceVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSurfaceVariant: 'onSurfaceVariant',
  /// The Material 3 `surfaceTint` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceTint: 'surfaceTint',
  /// The Material 3 `outline` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  outline: 'outline',
  /// The Material 3 `outlineVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  outlineVariant: 'outlineVariant',
  /// The Material 3 `shadow` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  shadow: 'shadow',
  /// The Material 3 `scrim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  scrim: 'scrim',
  /// The Material 3 `inverseSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  inverseSurface: 'inverseSurface',
  /// The Material 3 `onInverseSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onInverseSurface: 'onInverseSurface',
  /// The Material 3 `inversePrimary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  inversePrimary: 'inversePrimary',
} as const;

/// A Material 3 colour role.
///
/// ADR-13: `hello_bridge` declares only `brightness`, `primaryColor` and `scaffoldBackgroundColor`; every other colour Flutter paints is *derived* algorithmically. That information is not in the Dart source text — it is in Material's algorithm — so N10 computes the full role set with `material_color_utilities`, the same package Flutter itself uses. The colours we copied verbatim matched exactly; the ones we guessed were wrong by up to 15/255 per channel, invisibly (M0-T5 F1).
export type MaterialRole = (typeof MaterialRole)[keyof typeof MaterialRole];

const materialRoleValues = Object.values(MaterialRole) as readonly MaterialRole[];

/** Parses a {@link MaterialRole}. Rejects any value outside the enum. */
export function parseMaterialRole(value: unknown, path = 'MaterialRole'): MaterialRole {
  return asEnum(value, path, materialRoleValues);
}

/// How a route argument survives — or fails to survive — a URL boundary (ADR-11, ADR-11a).
///
/// In Flutter a route argument is a live Dart value. In every URL-routed target it is a string in an address bar. This enum is where that difference is made explicit rather than discovered at runtime.
export const RouteArgumentTransport = {
  /// A primitive. Crosses a URL boundary unchanged.
  primitive: 'primitive',
  /// A signal read, promoted to a store by N11 and dropped from the transition (BRG2302).
  promotedSignal: 'promotedSignal',
  /// A callback, promoted to a store action by N11 and dropped from the transition (BRG2302).
  promotedCallback: 'promotedCallback',
  /// A live object. A URL carries an identifier, not an object graph: reported as BRG2301 and left to the developer (evidence insufficient to infer identity and loader).
  objectTransport: 'objectTransport',
  /// A callback that captures state N11 cannot promote. Reported as BRG2303; an override is required.
  unpromotable: 'unpromotable',
} as const;

/// How a route argument survives — or fails to survive — a URL boundary (ADR-11, ADR-11a).
///
/// In Flutter a route argument is a live Dart value. In every URL-routed target it is a string in an address bar. This enum is where that difference is made explicit rather than discovered at runtime.
export type RouteArgumentTransport = (typeof RouteArgumentTransport)[keyof typeof RouteArgumentTransport];

const routeArgumentTransportValues = Object.values(RouteArgumentTransport) as readonly RouteArgumentTransport[];

/** Parses a {@link RouteArgumentTransport}. Rejects any value outside the enum. */
export function parseRouteArgumentTransport(value: unknown, path = 'RouteArgumentTransport'): RouteArgumentTransport {
  return asEnum(value, path, routeArgumentTransportValues);
}

/// Where a signal lives.
///
/// N11 (`promote-cross-route-state`, ADR-11) rewrites `component` to `store` when a signal or its mutator crosses a route boundary: a closure cannot be serialized to a URL, so the state must outlive the component that declared it.
export const SignalScope = {
  /// Owned by one component — a Flutter State field.
  component: 'component',
  /// Owned by a store, and therefore able to cross a route boundary.
  store: 'store',
} as const;

/// Where a signal lives.
///
/// N11 (`promote-cross-route-state`, ADR-11) rewrites `component` to `store` when a signal or its mutator crosses a route boundary: a closure cannot be serialized to a URL, so the state must outlive the component that declared it.
export type SignalScope = (typeof SignalScope)[keyof typeof SignalScope];

const signalScopeValues = Object.values(SignalScope) as readonly SignalScope[];

/** Parses a {@link SignalScope}. Rejects any value outside the enum. */
export function parseSignalScope(value: unknown, path = 'SignalScope'): SignalScope {
  return asEnum(value, path, signalScopeValues);
}

/// What a node wants to do with the space it is offered, along one axis (Spec v2.1 §A3).
///
/// Flutter's `Center` passes *loose* constraints: the child may take up to the parent's size and decides for itself. CSS has no equivalent — a flex child shrink-wraps, full stop — so one CSS rule cannot serve both `Center(child: Column(stretch))` and `Center(child: Text)`. The `layout-boundedness` analysis records the child's own intent here, and the generator hands it to the runtime kit rather than guessing.
export const SizeIntent = {
  /// Take all the space offered, e.g. a Column with crossAxisAlignment: stretch.
  fill: 'fill',
  /// Take only as much space as the content needs.
  shrink: 'shrink',
  /// Take an explicitly given size.
  fixed: 'fixed',
} as const;

/// What a node wants to do with the space it is offered, along one axis (Spec v2.1 §A3).
///
/// Flutter's `Center` passes *loose* constraints: the child may take up to the parent's size and decides for itself. CSS has no equivalent — a flex child shrink-wraps, full stop — so one CSS rule cannot serve both `Center(child: Column(stretch))` and `Center(child: Text)`. The `layout-boundedness` analysis records the child's own intent here, and the generator hands it to the runtime kit rather than guessing.
export type SizeIntent = (typeof SizeIntent)[keyof typeof SizeIntent];

const sizeIntentValues = Object.values(SizeIntent) as readonly SizeIntent[];

/** Parses a {@link SizeIntent}. Rejects any value outside the enum. */
export function parseSizeIntent(value: unknown, path = 'SizeIntent'): SizeIntent {
  return asEnum(value, path, sizeIntentValues);
}

/// Where a store came from.
export const StoreOrigin = {
  /// The application declared it — e.g. a ChangeNotifier class.
  declared: 'declared',
  /// N11 synthesized it, to hold state that crosses a route boundary (ADR-11). Reported as BRG2302: promotion is never silent.
  promoted: 'promoted',
} as const;

/// Where a store came from.
export type StoreOrigin = (typeof StoreOrigin)[keyof typeof StoreOrigin];

const storeOriginValues = Object.values(StoreOrigin) as readonly StoreOrigin[];

/** Parses a {@link StoreOrigin}. Rejects any value outside the enum. */
export function parseStoreOrigin(value: unknown, path = 'StoreOrigin'): StoreOrigin {
  return asEnum(value, path, storeOriginValues);
}

/// Which design-token family a token belongs to.
export const TokenGroup = {
  /// A colour role.
  color: 'color',
  /// A type style.
  typography: 'typography',
  /// A spacing step.
  space: 'space',
  /// A corner radius.
  radius: 'radius',
  /// An elevation shadow.
  shadow: 'shadow',
  /// A duration or curve.
  motion: 'motion',
} as const;

/// Which design-token family a token belongs to.
export type TokenGroup = (typeof TokenGroup)[keyof typeof TokenGroup];

const tokenGroupValues = Object.values(TokenGroup) as readonly TokenGroup[];

/** Parses a {@link TokenGroup}. Rejects any value outside the enum. */
export function parseTokenGroup(value: unknown, path = 'TokenGroup'): TokenGroup {
  return asEnum(value, path, tokenGroupValues);
}

/// A human-stable path to a node, e.g. `lib/screens/checkout.dart#CheckoutScreen/build/Column[0]/Row[2]`.
///
/// Stable across formatting-only edits. This is the key the override system uses, so a reformatted file must not orphan a human's hand-written component.
export type Anchor = string;

/** Parses a {@link Anchor}. */
export function parseAnchor(value: unknown, path = 'Anchor'): Anchor {
  return asString(value, path);
}

/// A node's content-addressed identity: blake3 of the node's canonical form, minus its own id, anchor and span.
///
/// Ids are permanent. They key overrides, caches, incrementality and AI provenance (ADR-7), so the canonical form that produces them may never change meaning.
export type NodeId = string;

/** Parses a {@link NodeId}. */
export function parseNodeId(value: unknown, path = 'NodeId'): NodeId {
  return asString(value, path);
}

/// One catch clause of a try statement.
export interface CatchClause {
  /// The clause body.
  readonly body: Block;
  /// The bound exception variable.
  readonly exceptionName?: string;
  /// The type caught, if narrowed.
  readonly exceptionType?: TypeRef;
  /// The bound stack-trace variable.
  readonly stackTraceName?: string;
}

/// The layout information a ui-realm generator needs, computed by the `layout-boundedness` analysis.
///
/// Additive: it is an optional field on `UiElement` and changes no existing node semantics.
export interface LayoutIntent {
  /// What the node does with offered height.
  readonly heightIntent: SizeIntent;
  /// Which layout implementation the subtree requires.
  readonly tier: LayoutTier;
  /// What the node does with offered width.
  readonly widthIntent: SizeIntent;
}

/// A parameter of a function, method, or widget constructor.
export interface ParamDecl {
  /// Default value, if any.
  readonly defaultValue?: Expr;
  /// Parameter name.
  readonly name: string;
  /// Whether the parameter is named rather than positional.
  readonly named?: boolean;
  /// Whether the parameter is required.
  readonly required?: boolean;
  /// Resolved type.
  readonly type: TypeRef;
}

/// One argument passed to a route transition, and what became of it.
export interface RouteArgument {
  /// The value passed, as bound at the call site.
  readonly binding?: Binding;
  /// The diagnostic raised, when the argument cannot cross unchanged.
  readonly diagnostic?: DiagnosticCode;
  /// The parameter name on the destination.
  readonly name: string;
  /// The store this argument's state was promoted into, for the promoted transports.
  readonly promotedTo?: NodeId;
  /// How it survives the URL boundary.
  readonly transport: RouteArgumentTransport;
}

/// Accessibility semantics, extracted from Flutter's Semantics tree.
///
/// The input to the semantics verifier (Spec §8), which compares this against the rendered ARIA tree — a check of *meaning*, not pixels.
export interface SemanticsInfo {
  /// Whether the subtree is excluded from semantics.
  readonly excluded?: boolean;
  /// The accessible hint.
  readonly hint?: string;
  /// The accessible label.
  readonly label?: string;
  /// The semantic role.
  readonly role?: string;
}

/// Route metadata for the document head.
export interface SeoMeta {
  /// The meta description.
  readonly description?: string;
  /// The page title.
  readonly title?: string;
}

/// A location in a Dart source file.
export interface SourceSpan {
  /// 1-based column.
  readonly column: number;
  /// Project-relative path. Never absolute: an absolute path would make output depend on where the project sits on disk.
  readonly file: string;
  /// Length in characters. Absent means a point.
  readonly length?: number;
  /// 1-based line.
  readonly line: number;
}

/// One case of a switch statement.
export interface SwitchCase {
  /// Body, in order.
  readonly body: readonly Stmt[];
  /// The value matched. Absent for the default case.
  readonly test?: Expr;
}

/// A resolved Dart type, as the analyzer saw it.
export interface TypeRef {
  /// The library that declares it, e.g. `package:flutter/material.dart`.
  readonly library?: string;
  /// The display name, e.g. `List<Item>`.
  readonly name: string;
  /// Whether the type is nullable.
  readonly nullable?: boolean;
}

/// A reference to a widget class — a framework widget, a package widget, or one the application declares.
export interface WidgetRef {
  /// The named constructor, e.g. `builder` for `ListView.builder`.
  readonly constructorName?: string;
  /// The declaring library. Distinguishes a framework widget from a package's, and from the application's own.
  readonly library?: string;
  /// The class name, e.g. `Scaffold`.
  readonly name: string;
  /// Whether the application declares this widget.
  ///
  /// C1 evidence: a user's own screens are what the compiler *generates*, not constructs it must map. Reporting them as unknown constructs was a false positive that would have opened every compatibility report with a lie.
  readonly userDefined?: boolean;
}

/// A mutation of state — the normalized form of a `setState` body or a store method.
///
/// `writes` must include state mutated through **method calls** on owned collections (`add`, `remove`, `[]=`), not only assignments. C1 evidence: `FavoritesStore.toggle` mutates via `_favoriteIds.add/remove`, so an assignment-only analysis returns an empty write set — and generated React state that never updates.
export interface Action {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The action body, in order.
  readonly body?: readonly Stmt[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Whether the action is async.
  readonly isAsync?: boolean;
  /// Discriminant.
  readonly kind: 'sig.Action';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The signals this action writes.
  readonly writes?: readonly NodeId[];
}

/// A write to a target: `a = b`, `a += b`, `a++`.
///
/// Added in v2.2 (§A10). Before it, the `Expr` union had no assignment at all, so every `setState` body — the one thing a Flutter→React compiler exists to translate — could only be carried as `OpaqueExpr`, i.e. a Dart source string no generator can compile. A census of the C1 corpus found 401 assignments across compass_app and wonderous, of which 210 were inside a `State` or `ChangeNotifier`; in our own fixture, *every* assignment was a state mutation.
///
/// Distinct from `sig.Action.writes`, and not replaceable by it: `writes` is a data-flow summary (*which* signals change), while this is program semantics (*what they become*). Both are required.
export interface Assign {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// For `increment`/`decrement`: whether the operator followed its target (`i++`) rather than preceded it (`++i`). The two differ only when the expression's value is consumed — `list[i++]` — but they do differ, and dropping the distinction would silently generate the wrong index.
  readonly isPostfix?: boolean;
  /// Discriminant.
  readonly kind: 'logic.Assign';
  /// How the value combines with the target.
  readonly operator: AssignmentOperator;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The place written to — a `Ref`, a `PropertyAccess`, or an index. It is an lvalue, which is why this cannot be a `Binary`: `Binary.left` is a value, and a generator reading one as the other emits a comparison where a write was meant.
  readonly target: Expr;
  /// Resolved type of the expression — the value written. Required, because every other member of the `Expr` union requires it and a consumer may rely on that.
  readonly type: TypeRef;
  /// The value assigned. Absent for `increment` and `decrement`, which have no operand.
  readonly value?: Expr;
}

/// An `await` expression.
export interface Await {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Await';
  /// The awaited expression.
  readonly operand: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A binary operation, e.g. `a + b`.
export interface Binary {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Binary';
  /// Left operand.
  readonly left: Expr;
  /// The operator, e.g. `+`.
  readonly operator: string;
  /// Right operand.
  readonly right: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A brace-delimited block.
export interface Block {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Block';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Statements, in order. Order is semantic.
  readonly statements?: readonly Stmt[];
}

/// A break statement.
export interface Break {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Break';
  /// The target label, if any.
  readonly label?: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A call to a function.
export interface Call {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Positional arguments, in order.
  readonly args?: readonly Expr[];
  /// The function called.
  readonly callee: Expr;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Call';
  /// Named arguments, keyed by parameter name.
  readonly namedArgs?: Readonly<Record<string, Expr>>;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved return type.
  readonly type: TypeRef;
}

/// An `as` cast.
export interface Cast {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Cast';
  /// The value cast.
  readonly operand: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The target type.
  readonly type: TypeRef;
}

/// A class declaration.
export interface ClassDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// Fields, in declaration order.
  readonly fields?: readonly FieldDecl[];
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.ClassDecl';
  /// Methods, in declaration order.
  readonly methods?: readonly FunctionDecl[];
  /// Class name.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The superclass, if any.
  readonly superclass?: TypeRef;
}

/// A widget the application declares — a screen or a reusable widget.
///
/// This is what the compiler *generates*; it is never a construct to be mapped.
export interface Component {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.Component';
  /// Component-scoped signals — the State fields (Spec §2.3).
  readonly localSignals?: readonly NodeId[];
  /// The component name, e.g. `LoginScreen`.
  readonly name: string;
  /// Constructor parameters, in order.
  readonly params?: readonly ParamDecl[];
  /// The render tree.
  readonly render: UiNode;
  /// Semantics for the component root, if any.
  readonly semantics?: SemanticsInfo;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A ternary conditional, e.g. `a ? b : c`.
export interface Conditional {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Conditional';
  /// Value when false.
  readonly otherwise: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The condition.
  readonly test: Expr;
  /// Value when true.
  readonly then: Expr;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A constant value. Nothing reactive reads it.
export interface ConstBinding {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'bind.Const';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The constant.
  readonly value: unknown;
}

/// A continue statement.
export interface Continue {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Continue';
  /// The target label, if any.
  readonly label?: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A value computed from other signals — a Flutter getter over state.
export interface Derived {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The computation.
  readonly body: Expr;
  /// The signals it reads.
  readonly deps?: readonly NodeId[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'sig.Derived';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A side effect tied to a component's lifecycle.
export interface Effect {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The effect body, in order.
  readonly body?: readonly Stmt[];
  /// The signals it depends on.
  readonly deps?: readonly NodeId[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'sig.Effect';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// When it runs.
  readonly timing: EffectTiming;
}

/// A network call the application makes.
export interface Endpoint {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'app.Endpoint';
  /// The HTTP method.
  readonly method: HttpMethod;
  /// The request path.
  readonly path: string;
  /// The request body type, if any.
  readonly request?: TypeRef;
  /// The response type.
  readonly response: TypeRef;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An enum declaration.
export interface EnumDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.EnumDecl';
  /// Enum name.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Values, in declaration order.
  readonly values?: readonly string[];
}

/// An arbitrary expression, e.g. a ternary or an event handler lambda.
export interface ExprBinding {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The expression.
  readonly expr: Expr;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'bind.Expr';
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An expression evaluated for its effect.
export interface ExprStmt {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The expression.
  readonly expr: Expr;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.ExprStmt';
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A field declaration.
export interface FieldDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// The initializer, if any.
  readonly initializer?: Expr;
  /// Whether the field is final.
  readonly isFinal?: boolean;
  /// Whether the field is static.
  readonly isStatic?: boolean;
  /// Discriminant.
  readonly kind: 'logic.FieldDecl';
  /// Field name.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A for or for-in loop.
export interface For {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The loop body.
  readonly body: Stmt;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Initializer, for a C-style loop.
  readonly init?: Stmt;
  /// The iterable, for a for-in loop.
  readonly iterable?: Expr;
  /// Discriminant.
  readonly kind: 'logic.For';
  /// The loop variable, for a for-in loop.
  readonly loopVariable?: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Loop condition.
  readonly test?: Expr;
  /// Update expressions, in order.
  readonly update?: readonly Expr[];
}

/// A function or method declaration.
export interface FunctionDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Body, in order.
  readonly body?: readonly Stmt[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Whether the function is async.
  readonly isAsync?: boolean;
  /// Whether the function is static.
  readonly isStatic?: boolean;
  /// Discriminant.
  readonly kind: 'logic.FunctionDecl';
  /// Function name.
  readonly name: string;
  /// Parameters, in order.
  readonly params?: readonly ParamDecl[];
  /// Resolved return type.
  readonly returnType: TypeRef;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An if statement.
export interface If {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.If';
  /// The else branch, if any.
  readonly otherwise?: Stmt;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The condition.
  readonly test: Expr;
  /// The then branch.
  readonly then: Stmt;
}

/// An anonymous function.
export interface Lambda {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Body, in order.
  readonly body: readonly Stmt[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Whether the lambda is async.
  readonly isAsync?: boolean;
  /// Discriminant.
  readonly kind: 'logic.Lambda';
  /// Parameters, in order.
  readonly params?: readonly ParamDecl[];
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved function type.
  readonly type: TypeRef;
}

/// A list literal.
export interface ListLit {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Elements, in order. Order is semantic.
  readonly elements?: readonly Expr[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.ListLit';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A literal: a number, string, boolean, or null.
export interface Lit {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Lit';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
  /// The literal value.
  readonly value?: unknown;
}

/// A map literal.
export interface MapLit {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Keys, in order, paired positionally with `values`.
  readonly keys?: readonly Expr[];
  /// Discriminant.
  readonly kind: 'logic.MapLit';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
  /// Values, in order, paired positionally with `keys`.
  readonly values?: readonly Expr[];
}

/// A call to a method on a receiver.
export interface MethodCall {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Positional arguments, in order.
  readonly args?: readonly Expr[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.MethodCall';
  /// The method name.
  readonly method: string;
  /// Named arguments.
  readonly namedArgs?: Readonly<Record<string, Expr>>;
  /// The receiver.
  readonly receiver: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved return type.
  readonly type: TypeRef;
}

/// A constructor invocation.
export interface New {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Positional arguments, in order.
  readonly args?: readonly Expr[];
  /// The named constructor, if any.
  readonly constructorName?: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Whether the construction is const — the input to const folding (pass N6).
  readonly isConst?: boolean;
  /// Discriminant.
  readonly kind: 'logic.New';
  /// Named arguments.
  readonly namedArgs?: Readonly<Record<string, Expr>>;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
  /// The class constructed.
  readonly typeName: string;
}

/// A null-aware operation, e.g. `a ?? b` or `a?.b`.
export interface NullCheck {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The fallback, for `??`.
  readonly fallback?: Expr;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.NullCheck';
  /// The operand.
  readonly operand: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A declaration the extractor cannot model — a mixin, an extension. Preserved rather than dropped (INV-4).
///
/// Added in v2.2 (§A11). The `Decl` union previously had no opaque variant, unlike `Expr` and `Stmt`, so an unmodellable declaration had nowhere to go and would have had to be silently discarded. compass_app declares 11 mixins; wonderous declares 5 extensions.
export interface OpaqueDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The original Dart source.
  readonly dartSource: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.OpaqueDecl';
  /// Why it could not be modeled.
  readonly reason: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An expression the extractor cannot model.
///
/// Never dropped, never guessed (INV-4): the raw source, its resolved type, and the reason are preserved so the override system and the AI gap analyzer both have something real to work with.
export interface OpaqueExpr {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The original Dart source.
  readonly dartSource: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.OpaqueExpr';
  /// Why it could not be modeled.
  readonly reason: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type, which the analyzer still knows.
  readonly type: TypeRef;
}

/// A statement the extractor cannot model. Preserved rather than dropped (INV-4).
export interface OpaqueStmt {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The original Dart source.
  readonly dartSource: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.OpaqueStmt';
  /// Why it could not be modeled.
  readonly reason: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A read of one of the component's own parameters.
export interface ParamBinding {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'bind.Param';
  /// The parameter name.
  readonly param: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// Reading a property of a value.
export interface PropertyAccess {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.PropertyAccess';
  /// The property name.
  readonly property: string;
  /// The receiver.
  readonly receiver: Expr;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A reference to a declared name — a local, a parameter, a field, or a signal.
export interface Ref {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Ref';
  /// The name referenced.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The declaration referred to, when it is in the program.
  readonly target?: NodeId;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A return statement.
export interface Return {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Return';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The returned value, if any.
  readonly value?: Expr;
}

/// One route of the application.
export interface Route {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The component rendered.
  readonly component: NodeId;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// Guards, in order.
  readonly guards?: readonly NodeId[];
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'app.Route';
  /// The layout component wrapping it, if any.
  readonly layout?: NodeId;
  /// Document metadata.
  readonly meta?: SeoMeta;
  /// Route parameters, in order.
  readonly params?: readonly ParamDecl[];
  /// The URL path, e.g. `/product/:id`.
  readonly path: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A navigation from one place in the application to another — a `Navigator.push`, or a `go_router` navigation.
///
/// This is the input to N11 (ADR-11). C1 found that `go_router` is the dominant navigation shape in real apps and our first analyzer saw none of it; with an empty nav-graph, N11 silently does nothing — a pass that looks like it works because it never fires.
///
/// **Exactly one of `target` and `component` is present** (Spec v2.4 §A17). A navigation either names a route that exists, or constructs its destination inline — and the second is not a route: it has no path, and none is invented for it. The dialect cannot express that exclusivity (a `NodeId` is a string; nothing about its shape says what it points at), so it is checked in code at emit and again at load — `BRG1307`.
///
/// A `Navigator.pop()` is **not** a transition: it returns along an edge that already exists rather than creating one.
export interface RouteTransition {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Arguments passed, in order.
  readonly arguments?: readonly RouteArgument[];
  /// The `ui.Component` rendered, when the navigation constructs its destination inline — `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen()))`.
  ///
  /// There is no path here and none is invented: which URL such a push *becomes* on a path-based target is a legalization decision, made in the layer that knows the target (Spec v2.4 §A17.6).
  ///
  /// Absent when the navigation names a route; see `target`.
  readonly component?: NodeId;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'app.RouteTransition';
  /// The component the navigation happens from.
  readonly source?: NodeId;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The destination route — an `app.Route` — when the navigation names one, as `context.go('/wonder/3')` does.
  ///
  /// Absent when the navigation constructs its destination inline; see `component`.
  readonly target?: NodeId;
}

/// A unit of reactive state.
///
/// Every target's reactivity is a lowering of this: React hooks, Vue `computed`, Svelte runes and Angular signals all come from here (ADR-4). No generator ever sees `setState`.
export interface Signal {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// The initial value, if any.
  readonly initial?: Expr;
  /// Discriminant.
  readonly kind: 'sig.Signal';
  /// Where the signal lives.
  readonly scope: SignalScope;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The store that owns it, when scope is `store`.
  readonly store?: NodeId;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A read of a signal. This is an edge in the reactivity graph.
export interface SignalBinding {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'bind.Signal';
  /// Path into the signal's value, e.g. `['items', 'length']`.
  readonly path?: readonly string[];
  /// The signal read.
  readonly signal: NodeId;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// One Dart source file in the analyzed project.
///
/// The two fingerprints are what make incremental compilation sound (Spec §7.2, ADR-5): editing a method *body* changes `implFingerprint` only, so dependents stay valid; changing a widget's constructor changes `apiFingerprint` and correctly invalidates them.
export interface SourceFile {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Hash of the file's exported surface. Changing it invalidates dependents.
  readonly apiFingerprint: string;
  /// Hash of the file's bytes.
  readonly contentHash: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Hash of the file's bodies. Changing it invalidates only this file's own downstream work.
  readonly implFingerprint: string;
  /// Discriminant.
  readonly kind: 'l0.SourceFile';
  /// Project-relative path.
  readonly path: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A collection of signals, derivations and actions that outlives any one component.
export interface Store {
  /// The actions it owns.
  readonly actions?: readonly NodeId[];
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The derivations it owns.
  readonly derived?: readonly NodeId[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'app.Store';
  /// The store name.
  readonly name: string;
  /// Whether the application declared it, or N11 synthesized it.
  readonly origin: StoreOrigin;
  /// The signals it owns.
  readonly signals?: readonly NodeId[];
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An interpolated string. Each interpolation is a reactive read.
export interface StringInterp {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.StringInterp';
  /// Parts, in order.
  readonly parts?: readonly Expr[];
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A switch statement.
export interface Switch {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Cases, in order.
  readonly cases?: readonly SwitchCase[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Switch';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The value switched on.
  readonly subject: Expr;
}

/// A throw statement.
export interface Throw {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Throw';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The thrown value.
  readonly value: Expr;
}

/// One design token.
///
/// Colour tokens are **derived**, never guessed: see MaterialRole and ADR-13. INV-20: every colour a mapped Material widget paints resolves to a token, and generated code contains no literal colour values.
export interface Token {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The value in the dark scheme, when the theme defines one.
  readonly dark?: unknown;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The token family.
  readonly group: TokenGroup;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'app.Token';
  /// The value in the light scheme.
  readonly light: unknown;
  /// The token name within its group.
  readonly name: string;
  /// The Material colour role, for colour tokens.
  readonly role?: MaterialRole;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A try statement.
export interface TryCatch {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The protected block.
  readonly body: Block;
  /// Catch clauses, in order.
  readonly catches?: readonly CatchClause[];
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The finally block, if any.
  readonly finallyBlock?: Block;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.TryCatch';
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A typedef.
export interface TypeAliasDecl {
  /// The aliased type.
  readonly aliased: TypeRef;
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.TypeAliasDecl';
  /// Alias name.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// An asynchronous subtree — the normalized form of `FutureBuilder` (pass N4).
///
/// The waiting/error/data branch shape is mechanically recognizable in real Flutter code, which is what lets N4 pattern-match rather than interpret.
export interface UiAsync {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Rendered on success.
  readonly data: UiNode;
  /// The name bound to the resolved value inside `data`.
  readonly dataParam?: string;
  /// Rendered on failure.
  readonly error?: UiNode;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.Async';
  /// Rendered while pending.
  readonly loading?: UiNode;
  /// The future or stream driving the subtree.
  readonly source: Binding;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A conditional subtree — the normalized form of a collection-`if` or a ternary (pass N2).
export interface UiCond {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.Cond';
  /// Rendered when false, if anything.
  readonly otherwise?: UiNode;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The condition.
  readonly test: Binding;
  /// Rendered when true.
  readonly then: UiNode;
}

/// A widget instantiation.
export interface UiElement {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Children, **in order**. Order is semantic: it is the order they appear on screen, and equality and serialization both preserve it.
  readonly children?: readonly UiNode[];
  /// The widget.
  readonly component: WidgetRef;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// The widget key, when one was given.
  readonly key?: Binding;
  /// Discriminant.
  readonly kind: 'ui.Element';
  /// Layout intent, from the `layout-boundedness` analysis.
  readonly layout?: LayoutIntent;
  /// Props, keyed by parameter name. Serialized in sorted key order.
  readonly props?: Readonly<Record<string, Binding>>;
  /// Accessibility semantics, when the widget carries them.
  readonly semantics?: SemanticsInfo;
  /// Named single-child slots, e.g. `appBar`, `body`.
  readonly slots?: Readonly<Record<string, UiNode>>;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A list rendered from a collection — the normalized form of `ListView.builder` (pass N3).
export interface UiList {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// The name bound to each index, if the builder takes one.
  readonly indexParam?: string;
  /// The name bound to each item inside the template.
  readonly itemParam: string;
  /// The per-item key, inferred when Flutter gave none (pass N9).
  readonly key?: Binding;
  /// Discriminant.
  readonly kind: 'ui.List';
  /// The collection rendered.
  readonly source: Binding;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The subtree rendered per item.
  readonly template: UiNode;
}

/// A widget the extractor cannot model. Preserved with its source and reason (INV-4); routed to the override system.
export interface UiOpaque {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The original Dart source.
  readonly dartSource: string;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.Opaque';
  /// Why it could not be modeled.
  readonly reason: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The widget, when it could at least be identified.
  readonly widget?: WidgetRef;
}

/// A subtree a human owns.
///
/// The generator emits an import of the override instead of generated code, and `bridge sync` checks that the override's props still match the Flutter side — so a changed constructor is a named diff, not silent drift.
export interface UiOverrideRef {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.OverrideRef';
  /// The override key.
  readonly overrideKey: Anchor;
  /// Props the override receives.
  readonly props?: Readonly<Record<string, Binding>>;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A reference to a named slot supplied by a parent.
export interface UiSlotRef {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.SlotRef';
  /// The slot name.
  readonly slot: string;
  /// Where the node came from.
  readonly span: SourceSpan;
}

/// A text node.
export interface UiText {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'ui.Text';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Style properties, keyed by name.
  readonly style?: Readonly<Record<string, Binding>>;
  /// The text. A string interpolation makes this a reactive read.
  readonly value: Binding;
}

/// A unary operation, e.g. `!a`.
export interface Unary {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Discriminant.
  readonly kind: 'logic.Unary';
  /// The operand.
  readonly operand: Expr;
  /// The operator, e.g. `!`.
  readonly operator: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A local variable declaration.
export interface VarDecl {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// The initializer, if any.
  readonly initializer?: Expr;
  /// Whether the variable is final.
  readonly isFinal?: boolean;
  /// Discriminant.
  readonly kind: 'logic.VarDecl';
  /// The variable name.
  readonly name: string;
  /// Where the node came from.
  readonly span: SourceSpan;
  /// Resolved type.
  readonly type: TypeRef;
}

/// A while or do-while loop.
export interface While {
  /// The override key, when the node is addressable by a human.
  readonly anchor?: Anchor;
  /// The body.
  readonly body: Stmt;
  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  readonly ext?: Readonly<Record<string, unknown>>;
  /// The node's stable, content-addressed identity.
  readonly id: NodeId;
  /// Whether the test runs after the body.
  readonly isDoWhile?: boolean;
  /// Discriminant.
  readonly kind: 'logic.While';
  /// Where the node came from.
  readonly span: SourceSpan;
  /// The condition.
  readonly test: Expr;
}

/// How a prop gets its value.
export type Binding =
  | ConstBinding
  | ExprBinding
  | ParamBinding
  | SignalBinding
;

/// Any declaration.
export type Decl =
  | ClassDecl
  | EnumDecl
  | FieldDecl
  | FunctionDecl
  | OpaqueDecl
  | TypeAliasDecl
;

/// Any expression.
export type Expr =
  | Assign
  | Await
  | Binary
  | Call
  | Cast
  | Conditional
  | Lambda
  | ListLit
  | Lit
  | MapLit
  | MethodCall
  | New
  | NullCheck
  | OpaqueExpr
  | PropertyAccess
  | Ref
  | StringInterp
  | Unary
;

/// Any statement.
export type Stmt =
  | Block
  | Break
  | Continue
  | ExprStmt
  | For
  | If
  | OpaqueStmt
  | Return
  | Switch
  | Throw
  | TryCatch
  | VarDecl
  | While
;

/// Any node in a render tree.
export type UiNode =
  | UiAsync
  | UiCond
  | UiElement
  | UiList
  | UiOpaque
  | UiOverrideRef
  | UiSlotRef
  | UiText
;

/** Parses a {@link CatchClause}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseCatchClause(value: unknown, path = 'CatchClause'): CatchClause {
  const o = asObject(value, path);
  return {
    body: parseBlock(req(o, 'body', path), `${path}.body`),
    ...(own(o, 'exceptionName') === undefined || own(o, 'exceptionName') === null ? {} : { exceptionName: asString(own(o, 'exceptionName'), `${path}.exceptionName`) }),
    ...(own(o, 'exceptionType') === undefined || own(o, 'exceptionType') === null ? {} : { exceptionType: parseTypeRef(own(o, 'exceptionType'), `${path}.exceptionType`) }),
    ...(own(o, 'stackTraceName') === undefined || own(o, 'stackTraceName') === null ? {} : { stackTraceName: asString(own(o, 'stackTraceName'), `${path}.stackTraceName`) }),
  };
}

/** Serializes a {@link CatchClause} to canonical JSON. */
export function serializeCatchClause(node: CatchClause): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsCatchClause(a: CatchClause, b: CatchClause): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithCatchClause(node: CatchClause, patch: Partial<CatchClause>): CatchClause {
  return { ...node, ...patch };
}

/** Parses a {@link LayoutIntent}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseLayoutIntent(value: unknown, path = 'LayoutIntent'): LayoutIntent {
  const o = asObject(value, path);
  return {
    heightIntent: parseSizeIntent(req(o, 'heightIntent', path), `${path}.heightIntent`),
    tier: parseLayoutTier(req(o, 'tier', path), `${path}.tier`),
    widthIntent: parseSizeIntent(req(o, 'widthIntent', path), `${path}.widthIntent`),
  };
}

/** Serializes a {@link LayoutIntent} to canonical JSON. */
export function serializeLayoutIntent(node: LayoutIntent): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsLayoutIntent(a: LayoutIntent, b: LayoutIntent): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithLayoutIntent(node: LayoutIntent, patch: Partial<LayoutIntent>): LayoutIntent {
  return { ...node, ...patch };
}

/** Parses a {@link ParamDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseParamDecl(value: unknown, path = 'ParamDecl'): ParamDecl {
  const o = asObject(value, path);
  return {
    ...(own(o, 'defaultValue') === undefined || own(o, 'defaultValue') === null ? {} : { defaultValue: parseExpr(own(o, 'defaultValue'), `${path}.defaultValue`) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'named') === undefined || own(o, 'named') === null ? {} : { named: asBool(own(o, 'named'), `${path}.named`) }),
    ...(own(o, 'required') === undefined || own(o, 'required') === null ? {} : { required: asBool(own(o, 'required'), `${path}.required`) }),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link ParamDecl} to canonical JSON. */
export function serializeParamDecl(node: ParamDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsParamDecl(a: ParamDecl, b: ParamDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithParamDecl(node: ParamDecl, patch: Partial<ParamDecl>): ParamDecl {
  return { ...node, ...patch };
}

/** Parses a {@link RouteArgument}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseRouteArgument(value: unknown, path = 'RouteArgument'): RouteArgument {
  const o = asObject(value, path);
  return {
    ...(own(o, 'binding') === undefined || own(o, 'binding') === null ? {} : { binding: parseBinding(own(o, 'binding'), `${path}.binding`) }),
    ...(own(o, 'diagnostic') === undefined || own(o, 'diagnostic') === null ? {} : { diagnostic: parseDiagnosticCode(own(o, 'diagnostic'), `${path}.diagnostic`) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'promotedTo') === undefined || own(o, 'promotedTo') === null ? {} : { promotedTo: parseNodeId(own(o, 'promotedTo'), `${path}.promotedTo`) }),
    transport: parseRouteArgumentTransport(req(o, 'transport', path), `${path}.transport`),
  };
}

/** Serializes a {@link RouteArgument} to canonical JSON. */
export function serializeRouteArgument(node: RouteArgument): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsRouteArgument(a: RouteArgument, b: RouteArgument): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithRouteArgument(node: RouteArgument, patch: Partial<RouteArgument>): RouteArgument {
  return { ...node, ...patch };
}

/** Parses a {@link SemanticsInfo}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSemanticsInfo(value: unknown, path = 'SemanticsInfo'): SemanticsInfo {
  const o = asObject(value, path);
  return {
    ...(own(o, 'excluded') === undefined || own(o, 'excluded') === null ? {} : { excluded: asBool(own(o, 'excluded'), `${path}.excluded`) }),
    ...(own(o, 'hint') === undefined || own(o, 'hint') === null ? {} : { hint: asString(own(o, 'hint'), `${path}.hint`) }),
    ...(own(o, 'label') === undefined || own(o, 'label') === null ? {} : { label: asString(own(o, 'label'), `${path}.label`) }),
    ...(own(o, 'role') === undefined || own(o, 'role') === null ? {} : { role: asString(own(o, 'role'), `${path}.role`) }),
  };
}

/** Serializes a {@link SemanticsInfo} to canonical JSON. */
export function serializeSemanticsInfo(node: SemanticsInfo): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSemanticsInfo(a: SemanticsInfo, b: SemanticsInfo): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSemanticsInfo(node: SemanticsInfo, patch: Partial<SemanticsInfo>): SemanticsInfo {
  return { ...node, ...patch };
}

/** Parses a {@link SeoMeta}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSeoMeta(value: unknown, path = 'SeoMeta'): SeoMeta {
  const o = asObject(value, path);
  return {
    ...(own(o, 'description') === undefined || own(o, 'description') === null ? {} : { description: asString(own(o, 'description'), `${path}.description`) }),
    ...(own(o, 'title') === undefined || own(o, 'title') === null ? {} : { title: asString(own(o, 'title'), `${path}.title`) }),
  };
}

/** Serializes a {@link SeoMeta} to canonical JSON. */
export function serializeSeoMeta(node: SeoMeta): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSeoMeta(a: SeoMeta, b: SeoMeta): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSeoMeta(node: SeoMeta, patch: Partial<SeoMeta>): SeoMeta {
  return { ...node, ...patch };
}

/** Parses a {@link SourceSpan}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSourceSpan(value: unknown, path = 'SourceSpan'): SourceSpan {
  const o = asObject(value, path);
  return {
    column: asInt(req(o, 'column', path), `${path}.column`),
    file: asString(req(o, 'file', path), `${path}.file`),
    ...(own(o, 'length') === undefined || own(o, 'length') === null ? {} : { length: asInt(own(o, 'length'), `${path}.length`) }),
    line: asInt(req(o, 'line', path), `${path}.line`),
  };
}

/** Serializes a {@link SourceSpan} to canonical JSON. */
export function serializeSourceSpan(node: SourceSpan): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSourceSpan(a: SourceSpan, b: SourceSpan): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSourceSpan(node: SourceSpan, patch: Partial<SourceSpan>): SourceSpan {
  return { ...node, ...patch };
}

/** Parses a {@link SwitchCase}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSwitchCase(value: unknown, path = 'SwitchCase'): SwitchCase {
  const o = asObject(value, path);
  return {
    body: asList(req(o, 'body', path), `${path}.body`, (v, p) => parseStmt(v, p)),
    ...(own(o, 'test') === undefined || own(o, 'test') === null ? {} : { test: parseExpr(own(o, 'test'), `${path}.test`) }),
  };
}

/** Serializes a {@link SwitchCase} to canonical JSON. */
export function serializeSwitchCase(node: SwitchCase): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSwitchCase(a: SwitchCase, b: SwitchCase): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSwitchCase(node: SwitchCase, patch: Partial<SwitchCase>): SwitchCase {
  return { ...node, ...patch };
}

/** Parses a {@link TypeRef}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseTypeRef(value: unknown, path = 'TypeRef'): TypeRef {
  const o = asObject(value, path);
  return {
    ...(own(o, 'library') === undefined || own(o, 'library') === null ? {} : { library: asString(own(o, 'library'), `${path}.library`) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'nullable') === undefined || own(o, 'nullable') === null ? {} : { nullable: asBool(own(o, 'nullable'), `${path}.nullable`) }),
  };
}

/** Serializes a {@link TypeRef} to canonical JSON. */
export function serializeTypeRef(node: TypeRef): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsTypeRef(a: TypeRef, b: TypeRef): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithTypeRef(node: TypeRef, patch: Partial<TypeRef>): TypeRef {
  return { ...node, ...patch };
}

/** Parses a {@link WidgetRef}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseWidgetRef(value: unknown, path = 'WidgetRef'): WidgetRef {
  const o = asObject(value, path);
  return {
    ...(own(o, 'constructorName') === undefined || own(o, 'constructorName') === null ? {} : { constructorName: asString(own(o, 'constructorName'), `${path}.constructorName`) }),
    ...(own(o, 'library') === undefined || own(o, 'library') === null ? {} : { library: asString(own(o, 'library'), `${path}.library`) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'userDefined') === undefined || own(o, 'userDefined') === null ? {} : { userDefined: asBool(own(o, 'userDefined'), `${path}.userDefined`) }),
  };
}

/** Serializes a {@link WidgetRef} to canonical JSON. */
export function serializeWidgetRef(node: WidgetRef): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsWidgetRef(a: WidgetRef, b: WidgetRef): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithWidgetRef(node: WidgetRef, patch: Partial<WidgetRef>): WidgetRef {
  return { ...node, ...patch };
}

/** Parses a {@link Action}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseAction(value: unknown, path = 'Action'): Action {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'sig.Action') throw new UirParseError(`${path}.kind`, `expected "sig.Action", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'body') === undefined || own(o, 'body') === null ? {} : { body: asList(own(o, 'body'), `${path}.body`, (v, p) => parseStmt(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isAsync') === undefined || own(o, 'isAsync') === null ? {} : { isAsync: asBool(own(o, 'isAsync'), `${path}.isAsync`) }),
    kind: 'sig.Action',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'writes') === undefined || own(o, 'writes') === null ? {} : { writes: asList(own(o, 'writes'), `${path}.writes`, (v, p) => parseNodeId(v, p)) }),
  };
}

/** Serializes a {@link Action} to canonical JSON. */
export function serializeAction(node: Action): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsAction(a: Action, b: Action): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithAction(node: Action, patch: Partial<Action>): Action {
  return { ...node, ...patch };
}

/** Parses a {@link Assign}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseAssign(value: unknown, path = 'Assign'): Assign {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Assign') throw new UirParseError(`${path}.kind`, `expected "logic.Assign", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isPostfix') === undefined || own(o, 'isPostfix') === null ? {} : { isPostfix: asBool(own(o, 'isPostfix'), `${path}.isPostfix`) }),
    kind: 'logic.Assign',
    operator: parseAssignmentOperator(req(o, 'operator', path), `${path}.operator`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    target: parseExpr(req(o, 'target', path), `${path}.target`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
    ...(own(o, 'value') === undefined || own(o, 'value') === null ? {} : { value: parseExpr(own(o, 'value'), `${path}.value`) }),
  };
}

/** Serializes a {@link Assign} to canonical JSON. */
export function serializeAssign(node: Assign): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsAssign(a: Assign, b: Assign): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithAssign(node: Assign, patch: Partial<Assign>): Assign {
  return { ...node, ...patch };
}

/** Parses a {@link Await}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseAwait(value: unknown, path = 'Await'): Await {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Await') throw new UirParseError(`${path}.kind`, `expected "logic.Await", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Await',
    operand: parseExpr(req(o, 'operand', path), `${path}.operand`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Await} to canonical JSON. */
export function serializeAwait(node: Await): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsAwait(a: Await, b: Await): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithAwait(node: Await, patch: Partial<Await>): Await {
  return { ...node, ...patch };
}

/** Parses a {@link Binary}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseBinary(value: unknown, path = 'Binary'): Binary {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Binary') throw new UirParseError(`${path}.kind`, `expected "logic.Binary", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Binary',
    left: parseExpr(req(o, 'left', path), `${path}.left`),
    operator: asString(req(o, 'operator', path), `${path}.operator`),
    right: parseExpr(req(o, 'right', path), `${path}.right`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Binary} to canonical JSON. */
export function serializeBinary(node: Binary): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsBinary(a: Binary, b: Binary): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithBinary(node: Binary, patch: Partial<Binary>): Binary {
  return { ...node, ...patch };
}

/** Parses a {@link Block}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseBlock(value: unknown, path = 'Block'): Block {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Block') throw new UirParseError(`${path}.kind`, `expected "logic.Block", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Block',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'statements') === undefined || own(o, 'statements') === null ? {} : { statements: asList(own(o, 'statements'), `${path}.statements`, (v, p) => parseStmt(v, p)) }),
  };
}

/** Serializes a {@link Block} to canonical JSON. */
export function serializeBlock(node: Block): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsBlock(a: Block, b: Block): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithBlock(node: Block, patch: Partial<Block>): Block {
  return { ...node, ...patch };
}

/** Parses a {@link Break}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseBreak(value: unknown, path = 'Break'): Break {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Break') throw new UirParseError(`${path}.kind`, `expected "logic.Break", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Break',
    ...(own(o, 'label') === undefined || own(o, 'label') === null ? {} : { label: asString(own(o, 'label'), `${path}.label`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Break} to canonical JSON. */
export function serializeBreak(node: Break): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsBreak(a: Break, b: Break): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithBreak(node: Break, patch: Partial<Break>): Break {
  return { ...node, ...patch };
}

/** Parses a {@link Call}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseCall(value: unknown, path = 'Call'): Call {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Call') throw new UirParseError(`${path}.kind`, `expected "logic.Call", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'args') === undefined || own(o, 'args') === null ? {} : { args: asList(own(o, 'args'), `${path}.args`, (v, p) => parseExpr(v, p)) }),
    callee: parseExpr(req(o, 'callee', path), `${path}.callee`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Call',
    ...(own(o, 'namedArgs') === undefined || own(o, 'namedArgs') === null ? {} : { namedArgs: asMap(own(o, 'namedArgs'), `${path}.namedArgs`, (v, p) => parseExpr(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Call} to canonical JSON. */
export function serializeCall(node: Call): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsCall(a: Call, b: Call): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithCall(node: Call, patch: Partial<Call>): Call {
  return { ...node, ...patch };
}

/** Parses a {@link Cast}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseCast(value: unknown, path = 'Cast'): Cast {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Cast') throw new UirParseError(`${path}.kind`, `expected "logic.Cast", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Cast',
    operand: parseExpr(req(o, 'operand', path), `${path}.operand`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Cast} to canonical JSON. */
export function serializeCast(node: Cast): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsCast(a: Cast, b: Cast): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithCast(node: Cast, patch: Partial<Cast>): Cast {
  return { ...node, ...patch };
}

/** Parses a {@link ClassDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseClassDecl(value: unknown, path = 'ClassDecl'): ClassDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.ClassDecl') throw new UirParseError(`${path}.kind`, `expected "logic.ClassDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    ...(own(o, 'fields') === undefined || own(o, 'fields') === null ? {} : { fields: asList(own(o, 'fields'), `${path}.fields`, (v, p) => parseFieldDecl(v, p)) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.ClassDecl',
    ...(own(o, 'methods') === undefined || own(o, 'methods') === null ? {} : { methods: asList(own(o, 'methods'), `${path}.methods`, (v, p) => parseFunctionDecl(v, p)) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'superclass') === undefined || own(o, 'superclass') === null ? {} : { superclass: parseTypeRef(own(o, 'superclass'), `${path}.superclass`) }),
  };
}

/** Serializes a {@link ClassDecl} to canonical JSON. */
export function serializeClassDecl(node: ClassDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsClassDecl(a: ClassDecl, b: ClassDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithClassDecl(node: ClassDecl, patch: Partial<ClassDecl>): ClassDecl {
  return { ...node, ...patch };
}

/** Parses a {@link Component}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseComponent(value: unknown, path = 'Component'): Component {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Component') throw new UirParseError(`${path}.kind`, `expected "ui.Component", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.Component',
    ...(own(o, 'localSignals') === undefined || own(o, 'localSignals') === null ? {} : { localSignals: asList(own(o, 'localSignals'), `${path}.localSignals`, (v, p) => parseNodeId(v, p)) }),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'params') === undefined || own(o, 'params') === null ? {} : { params: asList(own(o, 'params'), `${path}.params`, (v, p) => parseParamDecl(v, p)) }),
    render: parseUiNode(req(o, 'render', path), `${path}.render`),
    ...(own(o, 'semantics') === undefined || own(o, 'semantics') === null ? {} : { semantics: parseSemanticsInfo(own(o, 'semantics'), `${path}.semantics`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Component} to canonical JSON. */
export function serializeComponent(node: Component): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsComponent(a: Component, b: Component): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithComponent(node: Component, patch: Partial<Component>): Component {
  return { ...node, ...patch };
}

/** Parses a {@link Conditional}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseConditional(value: unknown, path = 'Conditional'): Conditional {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Conditional') throw new UirParseError(`${path}.kind`, `expected "logic.Conditional", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Conditional',
    otherwise: parseExpr(req(o, 'otherwise', path), `${path}.otherwise`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    test: parseExpr(req(o, 'test', path), `${path}.test`),
    then: parseExpr(req(o, 'then', path), `${path}.then`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Conditional} to canonical JSON. */
export function serializeConditional(node: Conditional): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsConditional(a: Conditional, b: Conditional): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithConditional(node: Conditional, patch: Partial<Conditional>): Conditional {
  return { ...node, ...patch };
}

/** Parses a {@link ConstBinding}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseConstBinding(value: unknown, path = 'ConstBinding'): ConstBinding {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'bind.Const') throw new UirParseError(`${path}.kind`, `expected "bind.Const", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'bind.Const',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    value: req(o, 'value', path),
  };
}

/** Serializes a {@link ConstBinding} to canonical JSON. */
export function serializeConstBinding(node: ConstBinding): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsConstBinding(a: ConstBinding, b: ConstBinding): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithConstBinding(node: ConstBinding, patch: Partial<ConstBinding>): ConstBinding {
  return { ...node, ...patch };
}

/** Parses a {@link Continue}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseContinue(value: unknown, path = 'Continue'): Continue {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Continue') throw new UirParseError(`${path}.kind`, `expected "logic.Continue", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Continue',
    ...(own(o, 'label') === undefined || own(o, 'label') === null ? {} : { label: asString(own(o, 'label'), `${path}.label`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Continue} to canonical JSON. */
export function serializeContinue(node: Continue): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsContinue(a: Continue, b: Continue): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithContinue(node: Continue, patch: Partial<Continue>): Continue {
  return { ...node, ...patch };
}

/** Parses a {@link Derived}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseDerived(value: unknown, path = 'Derived'): Derived {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'sig.Derived') throw new UirParseError(`${path}.kind`, `expected "sig.Derived", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    body: parseExpr(req(o, 'body', path), `${path}.body`),
    ...(own(o, 'deps') === undefined || own(o, 'deps') === null ? {} : { deps: asList(own(o, 'deps'), `${path}.deps`, (v, p) => parseNodeId(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'sig.Derived',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Derived} to canonical JSON. */
export function serializeDerived(node: Derived): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsDerived(a: Derived, b: Derived): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithDerived(node: Derived, patch: Partial<Derived>): Derived {
  return { ...node, ...patch };
}

/** Parses a {@link Effect}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseEffect(value: unknown, path = 'Effect'): Effect {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'sig.Effect') throw new UirParseError(`${path}.kind`, `expected "sig.Effect", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'body') === undefined || own(o, 'body') === null ? {} : { body: asList(own(o, 'body'), `${path}.body`, (v, p) => parseStmt(v, p)) }),
    ...(own(o, 'deps') === undefined || own(o, 'deps') === null ? {} : { deps: asList(own(o, 'deps'), `${path}.deps`, (v, p) => parseNodeId(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'sig.Effect',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    timing: parseEffectTiming(req(o, 'timing', path), `${path}.timing`),
  };
}

/** Serializes a {@link Effect} to canonical JSON. */
export function serializeEffect(node: Effect): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsEffect(a: Effect, b: Effect): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithEffect(node: Effect, patch: Partial<Effect>): Effect {
  return { ...node, ...patch };
}

/** Parses a {@link Endpoint}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseEndpoint(value: unknown, path = 'Endpoint'): Endpoint {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'app.Endpoint') throw new UirParseError(`${path}.kind`, `expected "app.Endpoint", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'app.Endpoint',
    method: parseHttpMethod(req(o, 'method', path), `${path}.method`),
    path: asString(req(o, 'path', path), `${path}.path`),
    ...(own(o, 'request') === undefined || own(o, 'request') === null ? {} : { request: parseTypeRef(own(o, 'request'), `${path}.request`) }),
    response: parseTypeRef(req(o, 'response', path), `${path}.response`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Endpoint} to canonical JSON. */
export function serializeEndpoint(node: Endpoint): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsEndpoint(a: Endpoint, b: Endpoint): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithEndpoint(node: Endpoint, patch: Partial<Endpoint>): Endpoint {
  return { ...node, ...patch };
}

/** Parses a {@link EnumDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseEnumDecl(value: unknown, path = 'EnumDecl'): EnumDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.EnumDecl') throw new UirParseError(`${path}.kind`, `expected "logic.EnumDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.EnumDecl',
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'values') === undefined || own(o, 'values') === null ? {} : { values: asList(own(o, 'values'), `${path}.values`, (v, p) => asString(v, p)) }),
  };
}

/** Serializes a {@link EnumDecl} to canonical JSON. */
export function serializeEnumDecl(node: EnumDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsEnumDecl(a: EnumDecl, b: EnumDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithEnumDecl(node: EnumDecl, patch: Partial<EnumDecl>): EnumDecl {
  return { ...node, ...patch };
}

/** Parses a {@link ExprBinding}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseExprBinding(value: unknown, path = 'ExprBinding'): ExprBinding {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'bind.Expr') throw new UirParseError(`${path}.kind`, `expected "bind.Expr", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    expr: parseExpr(req(o, 'expr', path), `${path}.expr`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'bind.Expr',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link ExprBinding} to canonical JSON. */
export function serializeExprBinding(node: ExprBinding): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsExprBinding(a: ExprBinding, b: ExprBinding): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithExprBinding(node: ExprBinding, patch: Partial<ExprBinding>): ExprBinding {
  return { ...node, ...patch };
}

/** Parses a {@link ExprStmt}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseExprStmt(value: unknown, path = 'ExprStmt'): ExprStmt {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.ExprStmt') throw new UirParseError(`${path}.kind`, `expected "logic.ExprStmt", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    expr: parseExpr(req(o, 'expr', path), `${path}.expr`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.ExprStmt',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link ExprStmt} to canonical JSON. */
export function serializeExprStmt(node: ExprStmt): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsExprStmt(a: ExprStmt, b: ExprStmt): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithExprStmt(node: ExprStmt, patch: Partial<ExprStmt>): ExprStmt {
  return { ...node, ...patch };
}

/** Parses a {@link FieldDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseFieldDecl(value: unknown, path = 'FieldDecl'): FieldDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.FieldDecl') throw new UirParseError(`${path}.kind`, `expected "logic.FieldDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'initializer') === undefined || own(o, 'initializer') === null ? {} : { initializer: parseExpr(own(o, 'initializer'), `${path}.initializer`) }),
    ...(own(o, 'isFinal') === undefined || own(o, 'isFinal') === null ? {} : { isFinal: asBool(own(o, 'isFinal'), `${path}.isFinal`) }),
    ...(own(o, 'isStatic') === undefined || own(o, 'isStatic') === null ? {} : { isStatic: asBool(own(o, 'isStatic'), `${path}.isStatic`) }),
    kind: 'logic.FieldDecl',
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link FieldDecl} to canonical JSON. */
export function serializeFieldDecl(node: FieldDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsFieldDecl(a: FieldDecl, b: FieldDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithFieldDecl(node: FieldDecl, patch: Partial<FieldDecl>): FieldDecl {
  return { ...node, ...patch };
}

/** Parses a {@link For}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseFor(value: unknown, path = 'For'): For {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.For') throw new UirParseError(`${path}.kind`, `expected "logic.For", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    body: parseStmt(req(o, 'body', path), `${path}.body`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'init') === undefined || own(o, 'init') === null ? {} : { init: parseStmt(own(o, 'init'), `${path}.init`) }),
    ...(own(o, 'iterable') === undefined || own(o, 'iterable') === null ? {} : { iterable: parseExpr(own(o, 'iterable'), `${path}.iterable`) }),
    kind: 'logic.For',
    ...(own(o, 'loopVariable') === undefined || own(o, 'loopVariable') === null ? {} : { loopVariable: asString(own(o, 'loopVariable'), `${path}.loopVariable`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'test') === undefined || own(o, 'test') === null ? {} : { test: parseExpr(own(o, 'test'), `${path}.test`) }),
    ...(own(o, 'update') === undefined || own(o, 'update') === null ? {} : { update: asList(own(o, 'update'), `${path}.update`, (v, p) => parseExpr(v, p)) }),
  };
}

/** Serializes a {@link For} to canonical JSON. */
export function serializeFor(node: For): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsFor(a: For, b: For): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithFor(node: For, patch: Partial<For>): For {
  return { ...node, ...patch };
}

/** Parses a {@link FunctionDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseFunctionDecl(value: unknown, path = 'FunctionDecl'): FunctionDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.FunctionDecl') throw new UirParseError(`${path}.kind`, `expected "logic.FunctionDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'body') === undefined || own(o, 'body') === null ? {} : { body: asList(own(o, 'body'), `${path}.body`, (v, p) => parseStmt(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isAsync') === undefined || own(o, 'isAsync') === null ? {} : { isAsync: asBool(own(o, 'isAsync'), `${path}.isAsync`) }),
    ...(own(o, 'isStatic') === undefined || own(o, 'isStatic') === null ? {} : { isStatic: asBool(own(o, 'isStatic'), `${path}.isStatic`) }),
    kind: 'logic.FunctionDecl',
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'params') === undefined || own(o, 'params') === null ? {} : { params: asList(own(o, 'params'), `${path}.params`, (v, p) => parseParamDecl(v, p)) }),
    returnType: parseTypeRef(req(o, 'returnType', path), `${path}.returnType`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link FunctionDecl} to canonical JSON. */
export function serializeFunctionDecl(node: FunctionDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsFunctionDecl(a: FunctionDecl, b: FunctionDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithFunctionDecl(node: FunctionDecl, patch: Partial<FunctionDecl>): FunctionDecl {
  return { ...node, ...patch };
}

/** Parses a {@link If}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseIf(value: unknown, path = 'If'): If {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.If') throw new UirParseError(`${path}.kind`, `expected "logic.If", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.If',
    ...(own(o, 'otherwise') === undefined || own(o, 'otherwise') === null ? {} : { otherwise: parseStmt(own(o, 'otherwise'), `${path}.otherwise`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    test: parseExpr(req(o, 'test', path), `${path}.test`),
    then: parseStmt(req(o, 'then', path), `${path}.then`),
  };
}

/** Serializes a {@link If} to canonical JSON. */
export function serializeIf(node: If): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsIf(a: If, b: If): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithIf(node: If, patch: Partial<If>): If {
  return { ...node, ...patch };
}

/** Parses a {@link Lambda}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseLambda(value: unknown, path = 'Lambda'): Lambda {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Lambda') throw new UirParseError(`${path}.kind`, `expected "logic.Lambda", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    body: asList(req(o, 'body', path), `${path}.body`, (v, p) => parseStmt(v, p)),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isAsync') === undefined || own(o, 'isAsync') === null ? {} : { isAsync: asBool(own(o, 'isAsync'), `${path}.isAsync`) }),
    kind: 'logic.Lambda',
    ...(own(o, 'params') === undefined || own(o, 'params') === null ? {} : { params: asList(own(o, 'params'), `${path}.params`, (v, p) => parseParamDecl(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Lambda} to canonical JSON. */
export function serializeLambda(node: Lambda): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsLambda(a: Lambda, b: Lambda): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithLambda(node: Lambda, patch: Partial<Lambda>): Lambda {
  return { ...node, ...patch };
}

/** Parses a {@link ListLit}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseListLit(value: unknown, path = 'ListLit'): ListLit {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.ListLit') throw new UirParseError(`${path}.kind`, `expected "logic.ListLit", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'elements') === undefined || own(o, 'elements') === null ? {} : { elements: asList(own(o, 'elements'), `${path}.elements`, (v, p) => parseExpr(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.ListLit',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link ListLit} to canonical JSON. */
export function serializeListLit(node: ListLit): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsListLit(a: ListLit, b: ListLit): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithListLit(node: ListLit, patch: Partial<ListLit>): ListLit {
  return { ...node, ...patch };
}

/** Parses a {@link Lit}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseLit(value: unknown, path = 'Lit'): Lit {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Lit') throw new UirParseError(`${path}.kind`, `expected "logic.Lit", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Lit',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
    ...(own(o, 'value') === undefined || own(o, 'value') === null ? {} : { value: own(o, 'value') }),
  };
}

/** Serializes a {@link Lit} to canonical JSON. */
export function serializeLit(node: Lit): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsLit(a: Lit, b: Lit): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithLit(node: Lit, patch: Partial<Lit>): Lit {
  return { ...node, ...patch };
}

/** Parses a {@link MapLit}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseMapLit(value: unknown, path = 'MapLit'): MapLit {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.MapLit') throw new UirParseError(`${path}.kind`, `expected "logic.MapLit", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'keys') === undefined || own(o, 'keys') === null ? {} : { keys: asList(own(o, 'keys'), `${path}.keys`, (v, p) => parseExpr(v, p)) }),
    kind: 'logic.MapLit',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
    ...(own(o, 'values') === undefined || own(o, 'values') === null ? {} : { values: asList(own(o, 'values'), `${path}.values`, (v, p) => parseExpr(v, p)) }),
  };
}

/** Serializes a {@link MapLit} to canonical JSON. */
export function serializeMapLit(node: MapLit): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsMapLit(a: MapLit, b: MapLit): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithMapLit(node: MapLit, patch: Partial<MapLit>): MapLit {
  return { ...node, ...patch };
}

/** Parses a {@link MethodCall}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseMethodCall(value: unknown, path = 'MethodCall'): MethodCall {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.MethodCall') throw new UirParseError(`${path}.kind`, `expected "logic.MethodCall", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'args') === undefined || own(o, 'args') === null ? {} : { args: asList(own(o, 'args'), `${path}.args`, (v, p) => parseExpr(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.MethodCall',
    method: asString(req(o, 'method', path), `${path}.method`),
    ...(own(o, 'namedArgs') === undefined || own(o, 'namedArgs') === null ? {} : { namedArgs: asMap(own(o, 'namedArgs'), `${path}.namedArgs`, (v, p) => parseExpr(v, p)) }),
    receiver: parseExpr(req(o, 'receiver', path), `${path}.receiver`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link MethodCall} to canonical JSON. */
export function serializeMethodCall(node: MethodCall): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsMethodCall(a: MethodCall, b: MethodCall): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithMethodCall(node: MethodCall, patch: Partial<MethodCall>): MethodCall {
  return { ...node, ...patch };
}

/** Parses a {@link New}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseNew(value: unknown, path = 'New'): New {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.New') throw new UirParseError(`${path}.kind`, `expected "logic.New", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'args') === undefined || own(o, 'args') === null ? {} : { args: asList(own(o, 'args'), `${path}.args`, (v, p) => parseExpr(v, p)) }),
    ...(own(o, 'constructorName') === undefined || own(o, 'constructorName') === null ? {} : { constructorName: asString(own(o, 'constructorName'), `${path}.constructorName`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isConst') === undefined || own(o, 'isConst') === null ? {} : { isConst: asBool(own(o, 'isConst'), `${path}.isConst`) }),
    kind: 'logic.New',
    ...(own(o, 'namedArgs') === undefined || own(o, 'namedArgs') === null ? {} : { namedArgs: asMap(own(o, 'namedArgs'), `${path}.namedArgs`, (v, p) => parseExpr(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
    typeName: asString(req(o, 'typeName', path), `${path}.typeName`),
  };
}

/** Serializes a {@link New} to canonical JSON. */
export function serializeNew(node: New): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsNew(a: New, b: New): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithNew(node: New, patch: Partial<New>): New {
  return { ...node, ...patch };
}

/** Parses a {@link NullCheck}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseNullCheck(value: unknown, path = 'NullCheck'): NullCheck {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.NullCheck') throw new UirParseError(`${path}.kind`, `expected "logic.NullCheck", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    ...(own(o, 'fallback') === undefined || own(o, 'fallback') === null ? {} : { fallback: parseExpr(own(o, 'fallback'), `${path}.fallback`) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.NullCheck',
    operand: parseExpr(req(o, 'operand', path), `${path}.operand`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link NullCheck} to canonical JSON. */
export function serializeNullCheck(node: NullCheck): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsNullCheck(a: NullCheck, b: NullCheck): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithNullCheck(node: NullCheck, patch: Partial<NullCheck>): NullCheck {
  return { ...node, ...patch };
}

/** Parses a {@link OpaqueDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseOpaqueDecl(value: unknown, path = 'OpaqueDecl'): OpaqueDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.OpaqueDecl') throw new UirParseError(`${path}.kind`, `expected "logic.OpaqueDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    dartSource: asString(req(o, 'dartSource', path), `${path}.dartSource`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.OpaqueDecl',
    reason: asString(req(o, 'reason', path), `${path}.reason`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link OpaqueDecl} to canonical JSON. */
export function serializeOpaqueDecl(node: OpaqueDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsOpaqueDecl(a: OpaqueDecl, b: OpaqueDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithOpaqueDecl(node: OpaqueDecl, patch: Partial<OpaqueDecl>): OpaqueDecl {
  return { ...node, ...patch };
}

/** Parses a {@link OpaqueExpr}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseOpaqueExpr(value: unknown, path = 'OpaqueExpr'): OpaqueExpr {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.OpaqueExpr') throw new UirParseError(`${path}.kind`, `expected "logic.OpaqueExpr", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    dartSource: asString(req(o, 'dartSource', path), `${path}.dartSource`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.OpaqueExpr',
    reason: asString(req(o, 'reason', path), `${path}.reason`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link OpaqueExpr} to canonical JSON. */
export function serializeOpaqueExpr(node: OpaqueExpr): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsOpaqueExpr(a: OpaqueExpr, b: OpaqueExpr): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithOpaqueExpr(node: OpaqueExpr, patch: Partial<OpaqueExpr>): OpaqueExpr {
  return { ...node, ...patch };
}

/** Parses a {@link OpaqueStmt}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseOpaqueStmt(value: unknown, path = 'OpaqueStmt'): OpaqueStmt {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.OpaqueStmt') throw new UirParseError(`${path}.kind`, `expected "logic.OpaqueStmt", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    dartSource: asString(req(o, 'dartSource', path), `${path}.dartSource`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.OpaqueStmt',
    reason: asString(req(o, 'reason', path), `${path}.reason`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link OpaqueStmt} to canonical JSON. */
export function serializeOpaqueStmt(node: OpaqueStmt): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsOpaqueStmt(a: OpaqueStmt, b: OpaqueStmt): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithOpaqueStmt(node: OpaqueStmt, patch: Partial<OpaqueStmt>): OpaqueStmt {
  return { ...node, ...patch };
}

/** Parses a {@link ParamBinding}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseParamBinding(value: unknown, path = 'ParamBinding'): ParamBinding {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'bind.Param') throw new UirParseError(`${path}.kind`, `expected "bind.Param", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'bind.Param',
    param: asString(req(o, 'param', path), `${path}.param`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link ParamBinding} to canonical JSON. */
export function serializeParamBinding(node: ParamBinding): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsParamBinding(a: ParamBinding, b: ParamBinding): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithParamBinding(node: ParamBinding, patch: Partial<ParamBinding>): ParamBinding {
  return { ...node, ...patch };
}

/** Parses a {@link PropertyAccess}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parsePropertyAccess(value: unknown, path = 'PropertyAccess'): PropertyAccess {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.PropertyAccess') throw new UirParseError(`${path}.kind`, `expected "logic.PropertyAccess", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.PropertyAccess',
    property: asString(req(o, 'property', path), `${path}.property`),
    receiver: parseExpr(req(o, 'receiver', path), `${path}.receiver`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link PropertyAccess} to canonical JSON. */
export function serializePropertyAccess(node: PropertyAccess): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsPropertyAccess(a: PropertyAccess, b: PropertyAccess): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithPropertyAccess(node: PropertyAccess, patch: Partial<PropertyAccess>): PropertyAccess {
  return { ...node, ...patch };
}

/** Parses a {@link Ref}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseRef(value: unknown, path = 'Ref'): Ref {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Ref') throw new UirParseError(`${path}.kind`, `expected "logic.Ref", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Ref',
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'target') === undefined || own(o, 'target') === null ? {} : { target: parseNodeId(own(o, 'target'), `${path}.target`) }),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Ref} to canonical JSON. */
export function serializeRef(node: Ref): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsRef(a: Ref, b: Ref): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithRef(node: Ref, patch: Partial<Ref>): Ref {
  return { ...node, ...patch };
}

/** Parses a {@link Return}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseReturn(value: unknown, path = 'Return'): Return {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Return') throw new UirParseError(`${path}.kind`, `expected "logic.Return", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Return',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'value') === undefined || own(o, 'value') === null ? {} : { value: parseExpr(own(o, 'value'), `${path}.value`) }),
  };
}

/** Serializes a {@link Return} to canonical JSON. */
export function serializeReturn(node: Return): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsReturn(a: Return, b: Return): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithReturn(node: Return, patch: Partial<Return>): Return {
  return { ...node, ...patch };
}

/** Parses a {@link Route}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseRoute(value: unknown, path = 'Route'): Route {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'app.Route') throw new UirParseError(`${path}.kind`, `expected "app.Route", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    component: parseNodeId(req(o, 'component', path), `${path}.component`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    ...(own(o, 'guards') === undefined || own(o, 'guards') === null ? {} : { guards: asList(own(o, 'guards'), `${path}.guards`, (v, p) => parseNodeId(v, p)) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'app.Route',
    ...(own(o, 'layout') === undefined || own(o, 'layout') === null ? {} : { layout: parseNodeId(own(o, 'layout'), `${path}.layout`) }),
    ...(own(o, 'meta') === undefined || own(o, 'meta') === null ? {} : { meta: parseSeoMeta(own(o, 'meta'), `${path}.meta`) }),
    ...(own(o, 'params') === undefined || own(o, 'params') === null ? {} : { params: asList(own(o, 'params'), `${path}.params`, (v, p) => parseParamDecl(v, p)) }),
    path: asString(req(o, 'path', path), `${path}.path`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Route} to canonical JSON. */
export function serializeRoute(node: Route): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsRoute(a: Route, b: Route): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithRoute(node: Route, patch: Partial<Route>): Route {
  return { ...node, ...patch };
}

/** Parses a {@link RouteTransition}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseRouteTransition(value: unknown, path = 'RouteTransition'): RouteTransition {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'app.RouteTransition') throw new UirParseError(`${path}.kind`, `expected "app.RouteTransition", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'arguments') === undefined || own(o, 'arguments') === null ? {} : { arguments: asList(own(o, 'arguments'), `${path}.arguments`, (v, p) => parseRouteArgument(v, p)) }),
    ...(own(o, 'component') === undefined || own(o, 'component') === null ? {} : { component: parseNodeId(own(o, 'component'), `${path}.component`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'app.RouteTransition',
    ...(own(o, 'source') === undefined || own(o, 'source') === null ? {} : { source: parseNodeId(own(o, 'source'), `${path}.source`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'target') === undefined || own(o, 'target') === null ? {} : { target: parseNodeId(own(o, 'target'), `${path}.target`) }),
  };
}

/** Serializes a {@link RouteTransition} to canonical JSON. */
export function serializeRouteTransition(node: RouteTransition): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsRouteTransition(a: RouteTransition, b: RouteTransition): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithRouteTransition(node: RouteTransition, patch: Partial<RouteTransition>): RouteTransition {
  return { ...node, ...patch };
}

/** Parses a {@link Signal}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSignal(value: unknown, path = 'Signal'): Signal {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'sig.Signal') throw new UirParseError(`${path}.kind`, `expected "sig.Signal", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'initial') === undefined || own(o, 'initial') === null ? {} : { initial: parseExpr(own(o, 'initial'), `${path}.initial`) }),
    kind: 'sig.Signal',
    scope: parseSignalScope(req(o, 'scope', path), `${path}.scope`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'store') === undefined || own(o, 'store') === null ? {} : { store: parseNodeId(own(o, 'store'), `${path}.store`) }),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Signal} to canonical JSON. */
export function serializeSignal(node: Signal): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSignal(a: Signal, b: Signal): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSignal(node: Signal, patch: Partial<Signal>): Signal {
  return { ...node, ...patch };
}

/** Parses a {@link SignalBinding}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSignalBinding(value: unknown, path = 'SignalBinding'): SignalBinding {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'bind.Signal') throw new UirParseError(`${path}.kind`, `expected "bind.Signal", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'bind.Signal',
    ...(own(o, 'path') === undefined || own(o, 'path') === null ? {} : { path: asList(own(o, 'path'), `${path}.path`, (v, p) => asString(v, p)) }),
    signal: parseNodeId(req(o, 'signal', path), `${path}.signal`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link SignalBinding} to canonical JSON. */
export function serializeSignalBinding(node: SignalBinding): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSignalBinding(a: SignalBinding, b: SignalBinding): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSignalBinding(node: SignalBinding, patch: Partial<SignalBinding>): SignalBinding {
  return { ...node, ...patch };
}

/** Parses a {@link SourceFile}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSourceFile(value: unknown, path = 'SourceFile'): SourceFile {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'l0.SourceFile') throw new UirParseError(`${path}.kind`, `expected "l0.SourceFile", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    apiFingerprint: asString(req(o, 'apiFingerprint', path), `${path}.apiFingerprint`),
    contentHash: asString(req(o, 'contentHash', path), `${path}.contentHash`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    implFingerprint: asString(req(o, 'implFingerprint', path), `${path}.implFingerprint`),
    kind: 'l0.SourceFile',
    path: asString(req(o, 'path', path), `${path}.path`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link SourceFile} to canonical JSON. */
export function serializeSourceFile(node: SourceFile): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSourceFile(a: SourceFile, b: SourceFile): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSourceFile(node: SourceFile, patch: Partial<SourceFile>): SourceFile {
  return { ...node, ...patch };
}

/** Parses a {@link Store}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseStore(value: unknown, path = 'Store'): Store {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'app.Store') throw new UirParseError(`${path}.kind`, `expected "app.Store", got "${kind}"`);

  return {
    ...(own(o, 'actions') === undefined || own(o, 'actions') === null ? {} : { actions: asList(own(o, 'actions'), `${path}.actions`, (v, p) => parseNodeId(v, p)) }),
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'derived') === undefined || own(o, 'derived') === null ? {} : { derived: asList(own(o, 'derived'), `${path}.derived`, (v, p) => parseNodeId(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'app.Store',
    name: asString(req(o, 'name', path), `${path}.name`),
    origin: parseStoreOrigin(req(o, 'origin', path), `${path}.origin`),
    ...(own(o, 'signals') === undefined || own(o, 'signals') === null ? {} : { signals: asList(own(o, 'signals'), `${path}.signals`, (v, p) => parseNodeId(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Store} to canonical JSON. */
export function serializeStore(node: Store): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsStore(a: Store, b: Store): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithStore(node: Store, patch: Partial<Store>): Store {
  return { ...node, ...patch };
}

/** Parses a {@link StringInterp}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseStringInterp(value: unknown, path = 'StringInterp'): StringInterp {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.StringInterp') throw new UirParseError(`${path}.kind`, `expected "logic.StringInterp", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.StringInterp',
    ...(own(o, 'parts') === undefined || own(o, 'parts') === null ? {} : { parts: asList(own(o, 'parts'), `${path}.parts`, (v, p) => parseExpr(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link StringInterp} to canonical JSON. */
export function serializeStringInterp(node: StringInterp): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsStringInterp(a: StringInterp, b: StringInterp): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithStringInterp(node: StringInterp, patch: Partial<StringInterp>): StringInterp {
  return { ...node, ...patch };
}

/** Parses a {@link Switch}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseSwitch(value: unknown, path = 'Switch'): Switch {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Switch') throw new UirParseError(`${path}.kind`, `expected "logic.Switch", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'cases') === undefined || own(o, 'cases') === null ? {} : { cases: asList(own(o, 'cases'), `${path}.cases`, (v, p) => parseSwitchCase(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Switch',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    subject: parseExpr(req(o, 'subject', path), `${path}.subject`),
  };
}

/** Serializes a {@link Switch} to canonical JSON. */
export function serializeSwitch(node: Switch): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsSwitch(a: Switch, b: Switch): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithSwitch(node: Switch, patch: Partial<Switch>): Switch {
  return { ...node, ...patch };
}

/** Parses a {@link Throw}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseThrow(value: unknown, path = 'Throw'): Throw {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Throw') throw new UirParseError(`${path}.kind`, `expected "logic.Throw", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Throw',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    value: parseExpr(req(o, 'value', path), `${path}.value`),
  };
}

/** Serializes a {@link Throw} to canonical JSON. */
export function serializeThrow(node: Throw): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsThrow(a: Throw, b: Throw): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithThrow(node: Throw, patch: Partial<Throw>): Throw {
  return { ...node, ...patch };
}

/** Parses a {@link Token}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseToken(value: unknown, path = 'Token'): Token {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'app.Token') throw new UirParseError(`${path}.kind`, `expected "app.Token", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'dark') === undefined || own(o, 'dark') === null ? {} : { dark: own(o, 'dark') }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    group: parseTokenGroup(req(o, 'group', path), `${path}.group`),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'app.Token',
    light: req(o, 'light', path),
    name: asString(req(o, 'name', path), `${path}.name`),
    ...(own(o, 'role') === undefined || own(o, 'role') === null ? {} : { role: parseMaterialRole(own(o, 'role'), `${path}.role`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link Token} to canonical JSON. */
export function serializeToken(node: Token): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsToken(a: Token, b: Token): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithToken(node: Token, patch: Partial<Token>): Token {
  return { ...node, ...patch };
}

/** Parses a {@link TryCatch}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseTryCatch(value: unknown, path = 'TryCatch'): TryCatch {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.TryCatch') throw new UirParseError(`${path}.kind`, `expected "logic.TryCatch", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    body: parseBlock(req(o, 'body', path), `${path}.body`),
    ...(own(o, 'catches') === undefined || own(o, 'catches') === null ? {} : { catches: asList(own(o, 'catches'), `${path}.catches`, (v, p) => parseCatchClause(v, p)) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    ...(own(o, 'finallyBlock') === undefined || own(o, 'finallyBlock') === null ? {} : { finallyBlock: parseBlock(own(o, 'finallyBlock'), `${path}.finallyBlock`) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.TryCatch',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link TryCatch} to canonical JSON. */
export function serializeTryCatch(node: TryCatch): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsTryCatch(a: TryCatch, b: TryCatch): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithTryCatch(node: TryCatch, patch: Partial<TryCatch>): TryCatch {
  return { ...node, ...patch };
}

/** Parses a {@link TypeAliasDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseTypeAliasDecl(value: unknown, path = 'TypeAliasDecl'): TypeAliasDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.TypeAliasDecl') throw new UirParseError(`${path}.kind`, `expected "logic.TypeAliasDecl", got "${kind}"`);

  return {
    aliased: parseTypeRef(req(o, 'aliased', path), `${path}.aliased`),
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.TypeAliasDecl',
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link TypeAliasDecl} to canonical JSON. */
export function serializeTypeAliasDecl(node: TypeAliasDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsTypeAliasDecl(a: TypeAliasDecl, b: TypeAliasDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithTypeAliasDecl(node: TypeAliasDecl, patch: Partial<TypeAliasDecl>): TypeAliasDecl {
  return { ...node, ...patch };
}

/** Parses a {@link UiAsync}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiAsync(value: unknown, path = 'UiAsync'): UiAsync {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Async') throw new UirParseError(`${path}.kind`, `expected "ui.Async", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    data: parseUiNode(req(o, 'data', path), `${path}.data`),
    ...(own(o, 'dataParam') === undefined || own(o, 'dataParam') === null ? {} : { dataParam: asString(own(o, 'dataParam'), `${path}.dataParam`) }),
    ...(own(o, 'error') === undefined || own(o, 'error') === null ? {} : { error: parseUiNode(own(o, 'error'), `${path}.error`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.Async',
    ...(own(o, 'loading') === undefined || own(o, 'loading') === null ? {} : { loading: parseUiNode(own(o, 'loading'), `${path}.loading`) }),
    source: parseBinding(req(o, 'source', path), `${path}.source`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link UiAsync} to canonical JSON. */
export function serializeUiAsync(node: UiAsync): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiAsync(a: UiAsync, b: UiAsync): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiAsync(node: UiAsync, patch: Partial<UiAsync>): UiAsync {
  return { ...node, ...patch };
}

/** Parses a {@link UiCond}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiCond(value: unknown, path = 'UiCond'): UiCond {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Cond') throw new UirParseError(`${path}.kind`, `expected "ui.Cond", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.Cond',
    ...(own(o, 'otherwise') === undefined || own(o, 'otherwise') === null ? {} : { otherwise: parseUiNode(own(o, 'otherwise'), `${path}.otherwise`) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    test: parseBinding(req(o, 'test', path), `${path}.test`),
    then: parseUiNode(req(o, 'then', path), `${path}.then`),
  };
}

/** Serializes a {@link UiCond} to canonical JSON. */
export function serializeUiCond(node: UiCond): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiCond(a: UiCond, b: UiCond): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiCond(node: UiCond, patch: Partial<UiCond>): UiCond {
  return { ...node, ...patch };
}

/** Parses a {@link UiElement}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiElement(value: unknown, path = 'UiElement'): UiElement {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Element') throw new UirParseError(`${path}.kind`, `expected "ui.Element", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'children') === undefined || own(o, 'children') === null ? {} : { children: asList(own(o, 'children'), `${path}.children`, (v, p) => parseUiNode(v, p)) }),
    component: parseWidgetRef(req(o, 'component', path), `${path}.component`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'key') === undefined || own(o, 'key') === null ? {} : { key: parseBinding(own(o, 'key'), `${path}.key`) }),
    kind: 'ui.Element',
    ...(own(o, 'layout') === undefined || own(o, 'layout') === null ? {} : { layout: parseLayoutIntent(own(o, 'layout'), `${path}.layout`) }),
    ...(own(o, 'props') === undefined || own(o, 'props') === null ? {} : { props: asMap(own(o, 'props'), `${path}.props`, (v, p) => parseBinding(v, p)) }),
    ...(own(o, 'semantics') === undefined || own(o, 'semantics') === null ? {} : { semantics: parseSemanticsInfo(own(o, 'semantics'), `${path}.semantics`) }),
    ...(own(o, 'slots') === undefined || own(o, 'slots') === null ? {} : { slots: asMap(own(o, 'slots'), `${path}.slots`, (v, p) => parseUiNode(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link UiElement} to canonical JSON. */
export function serializeUiElement(node: UiElement): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiElement(a: UiElement, b: UiElement): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiElement(node: UiElement, patch: Partial<UiElement>): UiElement {
  return { ...node, ...patch };
}

/** Parses a {@link UiList}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiList(value: unknown, path = 'UiList'): UiList {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.List') throw new UirParseError(`${path}.kind`, `expected "ui.List", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'indexParam') === undefined || own(o, 'indexParam') === null ? {} : { indexParam: asString(own(o, 'indexParam'), `${path}.indexParam`) }),
    itemParam: asString(req(o, 'itemParam', path), `${path}.itemParam`),
    ...(own(o, 'key') === undefined || own(o, 'key') === null ? {} : { key: parseBinding(own(o, 'key'), `${path}.key`) }),
    kind: 'ui.List',
    source: parseBinding(req(o, 'source', path), `${path}.source`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    template: parseUiNode(req(o, 'template', path), `${path}.template`),
  };
}

/** Serializes a {@link UiList} to canonical JSON. */
export function serializeUiList(node: UiList): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiList(a: UiList, b: UiList): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiList(node: UiList, patch: Partial<UiList>): UiList {
  return { ...node, ...patch };
}

/** Parses a {@link UiOpaque}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiOpaque(value: unknown, path = 'UiOpaque'): UiOpaque {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Opaque') throw new UirParseError(`${path}.kind`, `expected "ui.Opaque", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    dartSource: asString(req(o, 'dartSource', path), `${path}.dartSource`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.Opaque',
    reason: asString(req(o, 'reason', path), `${path}.reason`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'widget') === undefined || own(o, 'widget') === null ? {} : { widget: parseWidgetRef(own(o, 'widget'), `${path}.widget`) }),
  };
}

/** Serializes a {@link UiOpaque} to canonical JSON. */
export function serializeUiOpaque(node: UiOpaque): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiOpaque(a: UiOpaque, b: UiOpaque): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiOpaque(node: UiOpaque, patch: Partial<UiOpaque>): UiOpaque {
  return { ...node, ...patch };
}

/** Parses a {@link UiOverrideRef}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiOverrideRef(value: unknown, path = 'UiOverrideRef'): UiOverrideRef {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.OverrideRef') throw new UirParseError(`${path}.kind`, `expected "ui.OverrideRef", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.OverrideRef',
    overrideKey: parseAnchor(req(o, 'overrideKey', path), `${path}.overrideKey`),
    ...(own(o, 'props') === undefined || own(o, 'props') === null ? {} : { props: asMap(own(o, 'props'), `${path}.props`, (v, p) => parseBinding(v, p)) }),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link UiOverrideRef} to canonical JSON. */
export function serializeUiOverrideRef(node: UiOverrideRef): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiOverrideRef(a: UiOverrideRef, b: UiOverrideRef): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiOverrideRef(node: UiOverrideRef, patch: Partial<UiOverrideRef>): UiOverrideRef {
  return { ...node, ...patch };
}

/** Parses a {@link UiSlotRef}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiSlotRef(value: unknown, path = 'UiSlotRef'): UiSlotRef {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.SlotRef') throw new UirParseError(`${path}.kind`, `expected "ui.SlotRef", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.SlotRef',
    slot: asString(req(o, 'slot', path), `${path}.slot`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
  };
}

/** Serializes a {@link UiSlotRef} to canonical JSON. */
export function serializeUiSlotRef(node: UiSlotRef): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiSlotRef(a: UiSlotRef, b: UiSlotRef): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiSlotRef(node: UiSlotRef, patch: Partial<UiSlotRef>): UiSlotRef {
  return { ...node, ...patch };
}

/** Parses a {@link UiText}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUiText(value: unknown, path = 'UiText'): UiText {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'ui.Text') throw new UirParseError(`${path}.kind`, `expected "ui.Text", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'ui.Text',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    ...(own(o, 'style') === undefined || own(o, 'style') === null ? {} : { style: asMap(own(o, 'style'), `${path}.style`, (v, p) => parseBinding(v, p)) }),
    value: parseBinding(req(o, 'value', path), `${path}.value`),
  };
}

/** Serializes a {@link UiText} to canonical JSON. */
export function serializeUiText(node: UiText): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUiText(a: UiText, b: UiText): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUiText(node: UiText, patch: Partial<UiText>): UiText {
  return { ...node, ...patch };
}

/** Parses a {@link Unary}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseUnary(value: unknown, path = 'Unary'): Unary {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.Unary') throw new UirParseError(`${path}.kind`, `expected "logic.Unary", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    kind: 'logic.Unary',
    operand: parseExpr(req(o, 'operand', path), `${path}.operand`),
    operator: asString(req(o, 'operator', path), `${path}.operator`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link Unary} to canonical JSON. */
export function serializeUnary(node: Unary): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsUnary(a: Unary, b: Unary): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithUnary(node: Unary, patch: Partial<Unary>): Unary {
  return { ...node, ...patch };
}

/** Parses a {@link VarDecl}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseVarDecl(value: unknown, path = 'VarDecl'): VarDecl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.VarDecl') throw new UirParseError(`${path}.kind`, `expected "logic.VarDecl", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'initializer') === undefined || own(o, 'initializer') === null ? {} : { initializer: parseExpr(own(o, 'initializer'), `${path}.initializer`) }),
    ...(own(o, 'isFinal') === undefined || own(o, 'isFinal') === null ? {} : { isFinal: asBool(own(o, 'isFinal'), `${path}.isFinal`) }),
    kind: 'logic.VarDecl',
    name: asString(req(o, 'name', path), `${path}.name`),
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    type: parseTypeRef(req(o, 'type', path), `${path}.type`),
  };
}

/** Serializes a {@link VarDecl} to canonical JSON. */
export function serializeVarDecl(node: VarDecl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsVarDecl(a: VarDecl, b: VarDecl): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithVarDecl(node: VarDecl, patch: Partial<VarDecl>): VarDecl {
  return { ...node, ...patch };
}

/** Parses a {@link While}, validating as it goes. Throws {@link UirParseError} on bad input. */
export function parseWhile(value: unknown, path = 'While'): While {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  if (kind !== 'logic.While') throw new UirParseError(`${path}.kind`, `expected "logic.While", got "${kind}"`);

  return {
    ...(own(o, 'anchor') === undefined || own(o, 'anchor') === null ? {} : { anchor: parseAnchor(own(o, 'anchor'), `${path}.anchor`) }),
    body: parseStmt(req(o, 'body', path), `${path}.body`),
    ...(own(o, 'ext') === undefined || own(o, 'ext') === null ? {} : { ext: asMap(own(o, 'ext'), `${path}.ext`, (v) => v) }),
    id: parseNodeId(req(o, 'id', path), `${path}.id`),
    ...(own(o, 'isDoWhile') === undefined || own(o, 'isDoWhile') === null ? {} : { isDoWhile: asBool(own(o, 'isDoWhile'), `${path}.isDoWhile`) }),
    kind: 'logic.While',
    span: parseSourceSpan(req(o, 'span', path), `${path}.span`),
    test: parseExpr(req(o, 'test', path), `${path}.test`),
  };
}

/** Serializes a {@link While} to canonical JSON. */
export function serializeWhile(node: While): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */
export function equalsWhile(a: While, b: While): boolean {
  return deepEquals(canonicalJson(a), canonicalJson(b));
}

/** Returns a copy of [node] with [patch] applied. The original is never mutated. */
export function copyWithWhile(node: While, patch: Partial<While>): While {
  return { ...node, ...patch };
}

/** Parses any {@link Binding}, dispatching on `kind`. */
export function parseBinding(value: unknown, path = 'Binding'): Binding {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'bind.Const':
      return parseConstBinding(o, path);
    case 'bind.Expr':
      return parseExprBinding(o, path);
    case 'bind.Param':
      return parseParamBinding(o, path);
    case 'bind.Signal':
      return parseSignalBinding(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown Binding kind "${kind}"`);
  }
}

/** Serializes any {@link Binding} to canonical JSON. */
export function serializeBinding(node: Binding): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Visitor over {@link Binding}. Exhaustive: adding a variant breaks every implementation, on purpose. */
export interface BindingVisitor<R> {
  visitConstBinding(node: ConstBinding): R;
  visitExprBinding(node: ExprBinding): R;
  visitParamBinding(node: ParamBinding): R;
  visitSignalBinding(node: SignalBinding): R;
}

/** Dispatches [node] to [visitor]. */
export function acceptBinding<R>(node: Binding, visitor: BindingVisitor<R>): R {
  switch (node.kind) {
    case 'bind.Const':
      return visitor.visitConstBinding(node as ConstBinding);
    case 'bind.Expr':
      return visitor.visitExprBinding(node as ExprBinding);
    case 'bind.Param':
      return visitor.visitParamBinding(node as ParamBinding);
    case 'bind.Signal':
      return visitor.visitSignalBinding(node as SignalBinding);
    default:
      throw new UirParseError('Binding', 
        `unknown kind "${(node as { kind: string }).kind}"`,
      );
  }
}

/** Parses any {@link Decl}, dispatching on `kind`. */
export function parseDecl(value: unknown, path = 'Decl'): Decl {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'logic.ClassDecl':
      return parseClassDecl(o, path);
    case 'logic.EnumDecl':
      return parseEnumDecl(o, path);
    case 'logic.FieldDecl':
      return parseFieldDecl(o, path);
    case 'logic.FunctionDecl':
      return parseFunctionDecl(o, path);
    case 'logic.OpaqueDecl':
      return parseOpaqueDecl(o, path);
    case 'logic.TypeAliasDecl':
      return parseTypeAliasDecl(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown Decl kind "${kind}"`);
  }
}

/** Serializes any {@link Decl} to canonical JSON. */
export function serializeDecl(node: Decl): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Visitor over {@link Decl}. Exhaustive: adding a variant breaks every implementation, on purpose. */
export interface DeclVisitor<R> {
  visitClassDecl(node: ClassDecl): R;
  visitEnumDecl(node: EnumDecl): R;
  visitFieldDecl(node: FieldDecl): R;
  visitFunctionDecl(node: FunctionDecl): R;
  visitOpaqueDecl(node: OpaqueDecl): R;
  visitTypeAliasDecl(node: TypeAliasDecl): R;
}

/** Dispatches [node] to [visitor]. */
export function acceptDecl<R>(node: Decl, visitor: DeclVisitor<R>): R {
  switch (node.kind) {
    case 'logic.ClassDecl':
      return visitor.visitClassDecl(node as ClassDecl);
    case 'logic.EnumDecl':
      return visitor.visitEnumDecl(node as EnumDecl);
    case 'logic.FieldDecl':
      return visitor.visitFieldDecl(node as FieldDecl);
    case 'logic.FunctionDecl':
      return visitor.visitFunctionDecl(node as FunctionDecl);
    case 'logic.OpaqueDecl':
      return visitor.visitOpaqueDecl(node as OpaqueDecl);
    case 'logic.TypeAliasDecl':
      return visitor.visitTypeAliasDecl(node as TypeAliasDecl);
    default:
      throw new UirParseError('Decl', 
        `unknown kind "${(node as { kind: string }).kind}"`,
      );
  }
}

/** Parses any {@link Expr}, dispatching on `kind`. */
export function parseExpr(value: unknown, path = 'Expr'): Expr {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'logic.Assign':
      return parseAssign(o, path);
    case 'logic.Await':
      return parseAwait(o, path);
    case 'logic.Binary':
      return parseBinary(o, path);
    case 'logic.Call':
      return parseCall(o, path);
    case 'logic.Cast':
      return parseCast(o, path);
    case 'logic.Conditional':
      return parseConditional(o, path);
    case 'logic.Lambda':
      return parseLambda(o, path);
    case 'logic.ListLit':
      return parseListLit(o, path);
    case 'logic.Lit':
      return parseLit(o, path);
    case 'logic.MapLit':
      return parseMapLit(o, path);
    case 'logic.MethodCall':
      return parseMethodCall(o, path);
    case 'logic.New':
      return parseNew(o, path);
    case 'logic.NullCheck':
      return parseNullCheck(o, path);
    case 'logic.OpaqueExpr':
      return parseOpaqueExpr(o, path);
    case 'logic.PropertyAccess':
      return parsePropertyAccess(o, path);
    case 'logic.Ref':
      return parseRef(o, path);
    case 'logic.StringInterp':
      return parseStringInterp(o, path);
    case 'logic.Unary':
      return parseUnary(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown Expr kind "${kind}"`);
  }
}

/** Serializes any {@link Expr} to canonical JSON. */
export function serializeExpr(node: Expr): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Visitor over {@link Expr}. Exhaustive: adding a variant breaks every implementation, on purpose. */
export interface ExprVisitor<R> {
  visitAssign(node: Assign): R;
  visitAwait(node: Await): R;
  visitBinary(node: Binary): R;
  visitCall(node: Call): R;
  visitCast(node: Cast): R;
  visitConditional(node: Conditional): R;
  visitLambda(node: Lambda): R;
  visitListLit(node: ListLit): R;
  visitLit(node: Lit): R;
  visitMapLit(node: MapLit): R;
  visitMethodCall(node: MethodCall): R;
  visitNew(node: New): R;
  visitNullCheck(node: NullCheck): R;
  visitOpaqueExpr(node: OpaqueExpr): R;
  visitPropertyAccess(node: PropertyAccess): R;
  visitRef(node: Ref): R;
  visitStringInterp(node: StringInterp): R;
  visitUnary(node: Unary): R;
}

/** Dispatches [node] to [visitor]. */
export function acceptExpr<R>(node: Expr, visitor: ExprVisitor<R>): R {
  switch (node.kind) {
    case 'logic.Assign':
      return visitor.visitAssign(node as Assign);
    case 'logic.Await':
      return visitor.visitAwait(node as Await);
    case 'logic.Binary':
      return visitor.visitBinary(node as Binary);
    case 'logic.Call':
      return visitor.visitCall(node as Call);
    case 'logic.Cast':
      return visitor.visitCast(node as Cast);
    case 'logic.Conditional':
      return visitor.visitConditional(node as Conditional);
    case 'logic.Lambda':
      return visitor.visitLambda(node as Lambda);
    case 'logic.ListLit':
      return visitor.visitListLit(node as ListLit);
    case 'logic.Lit':
      return visitor.visitLit(node as Lit);
    case 'logic.MapLit':
      return visitor.visitMapLit(node as MapLit);
    case 'logic.MethodCall':
      return visitor.visitMethodCall(node as MethodCall);
    case 'logic.New':
      return visitor.visitNew(node as New);
    case 'logic.NullCheck':
      return visitor.visitNullCheck(node as NullCheck);
    case 'logic.OpaqueExpr':
      return visitor.visitOpaqueExpr(node as OpaqueExpr);
    case 'logic.PropertyAccess':
      return visitor.visitPropertyAccess(node as PropertyAccess);
    case 'logic.Ref':
      return visitor.visitRef(node as Ref);
    case 'logic.StringInterp':
      return visitor.visitStringInterp(node as StringInterp);
    case 'logic.Unary':
      return visitor.visitUnary(node as Unary);
    default:
      throw new UirParseError('Expr', 
        `unknown kind "${(node as { kind: string }).kind}"`,
      );
  }
}

/** Parses any {@link Stmt}, dispatching on `kind`. */
export function parseStmt(value: unknown, path = 'Stmt'): Stmt {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'logic.Block':
      return parseBlock(o, path);
    case 'logic.Break':
      return parseBreak(o, path);
    case 'logic.Continue':
      return parseContinue(o, path);
    case 'logic.ExprStmt':
      return parseExprStmt(o, path);
    case 'logic.For':
      return parseFor(o, path);
    case 'logic.If':
      return parseIf(o, path);
    case 'logic.OpaqueStmt':
      return parseOpaqueStmt(o, path);
    case 'logic.Return':
      return parseReturn(o, path);
    case 'logic.Switch':
      return parseSwitch(o, path);
    case 'logic.Throw':
      return parseThrow(o, path);
    case 'logic.TryCatch':
      return parseTryCatch(o, path);
    case 'logic.VarDecl':
      return parseVarDecl(o, path);
    case 'logic.While':
      return parseWhile(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown Stmt kind "${kind}"`);
  }
}

/** Serializes any {@link Stmt} to canonical JSON. */
export function serializeStmt(node: Stmt): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Visitor over {@link Stmt}. Exhaustive: adding a variant breaks every implementation, on purpose. */
export interface StmtVisitor<R> {
  visitBlock(node: Block): R;
  visitBreak(node: Break): R;
  visitContinue(node: Continue): R;
  visitExprStmt(node: ExprStmt): R;
  visitFor(node: For): R;
  visitIf(node: If): R;
  visitOpaqueStmt(node: OpaqueStmt): R;
  visitReturn(node: Return): R;
  visitSwitch(node: Switch): R;
  visitThrow(node: Throw): R;
  visitTryCatch(node: TryCatch): R;
  visitVarDecl(node: VarDecl): R;
  visitWhile(node: While): R;
}

/** Dispatches [node] to [visitor]. */
export function acceptStmt<R>(node: Stmt, visitor: StmtVisitor<R>): R {
  switch (node.kind) {
    case 'logic.Block':
      return visitor.visitBlock(node as Block);
    case 'logic.Break':
      return visitor.visitBreak(node as Break);
    case 'logic.Continue':
      return visitor.visitContinue(node as Continue);
    case 'logic.ExprStmt':
      return visitor.visitExprStmt(node as ExprStmt);
    case 'logic.For':
      return visitor.visitFor(node as For);
    case 'logic.If':
      return visitor.visitIf(node as If);
    case 'logic.OpaqueStmt':
      return visitor.visitOpaqueStmt(node as OpaqueStmt);
    case 'logic.Return':
      return visitor.visitReturn(node as Return);
    case 'logic.Switch':
      return visitor.visitSwitch(node as Switch);
    case 'logic.Throw':
      return visitor.visitThrow(node as Throw);
    case 'logic.TryCatch':
      return visitor.visitTryCatch(node as TryCatch);
    case 'logic.VarDecl':
      return visitor.visitVarDecl(node as VarDecl);
    case 'logic.While':
      return visitor.visitWhile(node as While);
    default:
      throw new UirParseError('Stmt', 
        `unknown kind "${(node as { kind: string }).kind}"`,
      );
  }
}

/** Parses any {@link UiNode}, dispatching on `kind`. */
export function parseUiNode(value: unknown, path = 'UiNode'): UiNode {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'ui.Async':
      return parseUiAsync(o, path);
    case 'ui.Cond':
      return parseUiCond(o, path);
    case 'ui.Element':
      return parseUiElement(o, path);
    case 'ui.List':
      return parseUiList(o, path);
    case 'ui.Opaque':
      return parseUiOpaque(o, path);
    case 'ui.OverrideRef':
      return parseUiOverrideRef(o, path);
    case 'ui.SlotRef':
      return parseUiSlotRef(o, path);
    case 'ui.Text':
      return parseUiText(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown UiNode kind "${kind}"`);
  }
}

/** Serializes any {@link UiNode} to canonical JSON. */
export function serializeUiNode(node: UiNode): Record<string, unknown> {
  return canonicalJson(node) as Record<string, unknown>;
}

/** Visitor over {@link UiNode}. Exhaustive: adding a variant breaks every implementation, on purpose. */
export interface UiNodeVisitor<R> {
  visitUiAsync(node: UiAsync): R;
  visitUiCond(node: UiCond): R;
  visitUiElement(node: UiElement): R;
  visitUiList(node: UiList): R;
  visitUiOpaque(node: UiOpaque): R;
  visitUiOverrideRef(node: UiOverrideRef): R;
  visitUiSlotRef(node: UiSlotRef): R;
  visitUiText(node: UiText): R;
}

/** Dispatches [node] to [visitor]. */
export function acceptUiNode<R>(node: UiNode, visitor: UiNodeVisitor<R>): R {
  switch (node.kind) {
    case 'ui.Async':
      return visitor.visitUiAsync(node as UiAsync);
    case 'ui.Cond':
      return visitor.visitUiCond(node as UiCond);
    case 'ui.Element':
      return visitor.visitUiElement(node as UiElement);
    case 'ui.List':
      return visitor.visitUiList(node as UiList);
    case 'ui.Opaque':
      return visitor.visitUiOpaque(node as UiOpaque);
    case 'ui.OverrideRef':
      return visitor.visitUiOverrideRef(node as UiOverrideRef);
    case 'ui.SlotRef':
      return visitor.visitUiSlotRef(node as UiSlotRef);
    case 'ui.Text':
      return visitor.visitUiText(node as UiText);
    default:
      throw new UirParseError('UiNode', 
        `unknown kind "${(node as { kind: string }).kind}"`,
      );
  }
}

/** Any UIR node. */
export type AnyUirNode = Action | Assign | Await | Binary | Block | Break | Call | Cast | ClassDecl | Component | Conditional | ConstBinding | Continue | Derived | Effect | Endpoint | EnumDecl | ExprBinding | ExprStmt | FieldDecl | For | FunctionDecl | If | Lambda | ListLit | Lit | MapLit | MethodCall | New | NullCheck | OpaqueDecl | OpaqueExpr | OpaqueStmt | ParamBinding | PropertyAccess | Ref | Return | Route | RouteTransition | Signal | SignalBinding | SourceFile | Store | StringInterp | Switch | Throw | Token | TryCatch | TypeAliasDecl | UiAsync | UiCond | UiElement | UiList | UiOpaque | UiOverrideRef | UiSlotRef | UiText | Unary | VarDecl | While;

/** Parses any UIR node, dispatching on `kind` across every node kind in the schema. */
export function parseUirNode(value: unknown, path = 'UirNode'): AnyUirNode {
  const o = asObject(value, path);
  const kind = asString(req(o, 'kind', path), `${path}.kind`);
  switch (kind) {
    case 'sig.Action':
      return parseAction(o, path);
    case 'logic.Assign':
      return parseAssign(o, path);
    case 'logic.Await':
      return parseAwait(o, path);
    case 'logic.Binary':
      return parseBinary(o, path);
    case 'logic.Block':
      return parseBlock(o, path);
    case 'logic.Break':
      return parseBreak(o, path);
    case 'logic.Call':
      return parseCall(o, path);
    case 'logic.Cast':
      return parseCast(o, path);
    case 'logic.ClassDecl':
      return parseClassDecl(o, path);
    case 'ui.Component':
      return parseComponent(o, path);
    case 'logic.Conditional':
      return parseConditional(o, path);
    case 'bind.Const':
      return parseConstBinding(o, path);
    case 'logic.Continue':
      return parseContinue(o, path);
    case 'sig.Derived':
      return parseDerived(o, path);
    case 'sig.Effect':
      return parseEffect(o, path);
    case 'app.Endpoint':
      return parseEndpoint(o, path);
    case 'logic.EnumDecl':
      return parseEnumDecl(o, path);
    case 'bind.Expr':
      return parseExprBinding(o, path);
    case 'logic.ExprStmt':
      return parseExprStmt(o, path);
    case 'logic.FieldDecl':
      return parseFieldDecl(o, path);
    case 'logic.For':
      return parseFor(o, path);
    case 'logic.FunctionDecl':
      return parseFunctionDecl(o, path);
    case 'logic.If':
      return parseIf(o, path);
    case 'logic.Lambda':
      return parseLambda(o, path);
    case 'logic.ListLit':
      return parseListLit(o, path);
    case 'logic.Lit':
      return parseLit(o, path);
    case 'logic.MapLit':
      return parseMapLit(o, path);
    case 'logic.MethodCall':
      return parseMethodCall(o, path);
    case 'logic.New':
      return parseNew(o, path);
    case 'logic.NullCheck':
      return parseNullCheck(o, path);
    case 'logic.OpaqueDecl':
      return parseOpaqueDecl(o, path);
    case 'logic.OpaqueExpr':
      return parseOpaqueExpr(o, path);
    case 'logic.OpaqueStmt':
      return parseOpaqueStmt(o, path);
    case 'bind.Param':
      return parseParamBinding(o, path);
    case 'logic.PropertyAccess':
      return parsePropertyAccess(o, path);
    case 'logic.Ref':
      return parseRef(o, path);
    case 'logic.Return':
      return parseReturn(o, path);
    case 'app.Route':
      return parseRoute(o, path);
    case 'app.RouteTransition':
      return parseRouteTransition(o, path);
    case 'sig.Signal':
      return parseSignal(o, path);
    case 'bind.Signal':
      return parseSignalBinding(o, path);
    case 'l0.SourceFile':
      return parseSourceFile(o, path);
    case 'app.Store':
      return parseStore(o, path);
    case 'logic.StringInterp':
      return parseStringInterp(o, path);
    case 'logic.Switch':
      return parseSwitch(o, path);
    case 'logic.Throw':
      return parseThrow(o, path);
    case 'app.Token':
      return parseToken(o, path);
    case 'logic.TryCatch':
      return parseTryCatch(o, path);
    case 'logic.TypeAliasDecl':
      return parseTypeAliasDecl(o, path);
    case 'ui.Async':
      return parseUiAsync(o, path);
    case 'ui.Cond':
      return parseUiCond(o, path);
    case 'ui.Element':
      return parseUiElement(o, path);
    case 'ui.List':
      return parseUiList(o, path);
    case 'ui.Opaque':
      return parseUiOpaque(o, path);
    case 'ui.OverrideRef':
      return parseUiOverrideRef(o, path);
    case 'ui.SlotRef':
      return parseUiSlotRef(o, path);
    case 'ui.Text':
      return parseUiText(o, path);
    case 'logic.Unary':
      return parseUnary(o, path);
    case 'logic.VarDecl':
      return parseVarDecl(o, path);
    case 'logic.While':
      return parseWhile(o, path);
    default:
      throw new UirParseError(`${path}.kind`, `unknown UIR node kind "${kind}"`);
  }
}

/**
 * A stable structural hash of any UIR value.
 *
 * Computed over canonical JSON, so it depends only on content — never on key insertion order or
 * on the order the compiler happened to build the value in (D1–D5).
 */
export function hashUir(value: unknown): number {
  const text = JSON.stringify(canonicalJson(value));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
