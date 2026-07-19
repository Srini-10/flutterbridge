// GENERATED CODE — DO NOT EDIT
//
// Produced by tools/schema-codegen from packages/uir/schema/*.json.
// UIR schema version: 1.5.0
//
// Edit the schema and re-run `pnpm codegen`. Hand-edits to this file are lost on the next run,
// and CI fails if this file does not match the schema (drift check).

// Generated code is held to the same analysis standard as hand-written code, with three
// exceptions that only a generator produces:
//   constant_identifier_names — enum values carry their wire spelling (e.g. BRG2301).
//   prefer_if_null_operators  — optional-field reads are explicit null checks, for clarity.
//   comment_references        — documentation is copied verbatim from the schema.
//   unused_element            — a reader helper is emitted whether or not the schema uses it.
// ignore_for_file: constant_identifier_names, prefer_if_null_operators
// ignore_for_file: comment_references, unused_element

/// The Universal Intermediate Representation. Generated from the UIR schema.
library;

import 'dart:collection';
import 'dart:convert';

import 'package:collection/collection.dart';
import 'package:crypto/crypto.dart';
import 'package:meta/meta.dart';

/// The UIR schema version this library was generated from.
const String uirVersion = '1.5.0';

/// A hash of the schema sources this library was generated from.
///
/// Stamped into every emitted manifest: a UIR document always says which schema produced it.
const String uirSchemaHash = '9b5c1183b869601f';

/// Node kind -> the fields of that node which hold `NodeId` references.
///
/// Generated from the schema: a `NodeId` is a `String` once types are erased, so a consumer that
/// wants to check that every reference resolves needs to be told which strings are references.
const Map<String, List<String>> uirReferenceFields = <String, List<String>>{
  'sig.Action': <String>['id', 'writes'],
  'logic.Assign': <String>['id'],
  'logic.Await': <String>['id'],
  'logic.Binary': <String>['id'],
  'logic.Block': <String>['id'],
  'logic.Break': <String>['id'],
  'logic.Call': <String>['id'],
  'logic.Cast': <String>['id'],
  'logic.ClassDecl': <String>['id'],
  'ui.Component': <String>['id', 'localSignals'],
  'logic.Conditional': <String>['id'],
  'bind.Const': <String>['id'],
  'logic.Continue': <String>['id'],
  'sig.Derived': <String>['deps', 'id'],
  'sig.Effect': <String>['deps', 'id'],
  'app.Endpoint': <String>['id'],
  'logic.EnumDecl': <String>['id'],
  'bind.Expr': <String>['id'],
  'logic.ExprStmt': <String>['id'],
  'logic.FieldDecl': <String>['id'],
  'logic.For': <String>['id'],
  'logic.FunctionDecl': <String>['id'],
  'logic.If': <String>['id'],
  'logic.Lambda': <String>['id'],
  'logic.ListLit': <String>['id'],
  'logic.Lit': <String>['id'],
  'logic.MapLit': <String>['id'],
  'logic.MethodCall': <String>['id'],
  'logic.Navigate': <String>['id', 'transition'],
  'logic.New': <String>['id'],
  'logic.NullCheck': <String>['id'],
  'logic.OpaqueDecl': <String>['id'],
  'logic.OpaqueExpr': <String>['id'],
  'logic.OpaqueStmt': <String>['id'],
  'bind.Param': <String>['id'],
  'logic.PropertyAccess': <String>['id'],
  'logic.Ref': <String>['id', 'target'],
  'logic.Return': <String>['id'],
  'app.Route': <String>['component', 'guards', 'id', 'layout'],
  'app.RouteTransition': <String>['component', 'id', 'source', 'target'],
  'sig.Signal': <String>['id', 'store'],
  'bind.Signal': <String>['id', 'signal'],
  'l0.SourceFile': <String>['id'],
  'app.Store': <String>['actions', 'derived', 'id', 'signals'],
  'logic.StringInterp': <String>['id'],
  'logic.Switch': <String>['id'],
  'logic.Throw': <String>['id'],
  'app.Token': <String>['id'],
  'logic.TryCatch': <String>['id'],
  'logic.TypeAliasDecl': <String>['id'],
  'ui.Async': <String>['id'],
  'ui.Cond': <String>['id'],
  'ui.Element': <String>['id'],
  'ui.List': <String>['id'],
  'ui.Opaque': <String>['id'],
  'ui.OverrideRef': <String>['id'],
  'ui.SlotRef': <String>['id'],
  'ui.Text': <String>['id'],
  'logic.Unary': <String>['id'],
  'logic.VarDecl': <String>['id'],
  'logic.While': <String>['id'],
};

/// Thrown when JSON does not conform to the schema.
///
/// Deserialization validates; it never guesses. A UIR document that does not match the schema is a
/// bug in whatever produced it, and it must not be allowed to become a plausible-looking node tree.
class UirParseError implements Exception {
  /// Creates a parse error at [path].
  const UirParseError(this.path, this.message);

  /// Where in the document the problem is, e.g. `UiElement.children[2].kind`.
  final String path;

  /// What is wrong.
  final String message;

  @override
  String toString() => 'UirParseError $path: $message';
}

/// The base of every UIR node.
///
/// Every node carries a stable [id], a [kind] discriminant, and a [span] (Spec §2.3).
abstract base class UirNode {
  /// Creates a node.
  const UirNode();

  /// The node's discriminant, e.g. `ui.Element`.
  String get kind;

  /// Serializes to canonical JSON.
  Map<String, Object?> toJson();
}

const DeepCollectionEquality _equality = DeepCollectionEquality();

Map<String, Object?> _asObject(Object? value, String path) {
  if (value is! Map<String, Object?>) throw UirParseError(path, 'expected an object');
  return value;
}

Object? _req(Map<String, Object?> json, String key, String path) {
  final Object? value = json[key];
  if (value == null) throw UirParseError('$path.$key', 'required field is missing');
  return value;
}

String _asString(Object? value, String path) {
  if (value is! String) throw UirParseError(path, 'expected a string');
  return value;
}

int _asInt(Object? value, String path) {
  if (value is! int) throw UirParseError(path, 'expected an integer');
  return value;
}

double _asDouble(Object? value, String path) {
  if (value is num) return value.toDouble();
  throw UirParseError(path, 'expected a number');
}

bool _asBool(Object? value, String path) {
  if (value is! bool) throw UirParseError(path, 'expected a boolean');
  return value;
}

List<T> _asList<T>(Object? value, String path, T Function(Object?, String) item) {
  if (value is! List<Object?>) throw UirParseError(path, 'expected an array');
  final List<T> out = <T>[];
  for (int i = 0; i < value.length; i++) {
    out.add(item(value[i], '$path[$i]'));
  }
  return List<T>.unmodifiable(out);
}

Map<String, T> _asMap<T>(Object? value, String path, T Function(Object?, String) item) {
  final Map<String, Object?> raw = _asObject(value, path);
  final SplayTreeMap<String, T> out = SplayTreeMap<String, T>();
  for (final String key in raw.keys.toList()..sort()) {
    out[key] = item(raw[key], '$path.$key');
  }
  return Map<String, T>.unmodifiable(out);
}

/// Canonical JSON: map keys sorted recursively, nulls omitted.
///
/// This is what makes serialization byte-stable (Spec §2.5, ADR-7, D1–D5). Dart maps iterate in
/// insertion order — i.e. in the order the compiler happened to build them — which is not a
/// specification.
Object? canonicalJson(Object? value) {
  if (value is Map<String, Object?>) {
    final SplayTreeMap<String, Object?> out = SplayTreeMap<String, Object?>();
    for (final MapEntry<String, Object?> entry in value.entries) {
      if (entry.value != null) out[entry.key] = canonicalJson(entry.value);
    }
    return out;
  }
  if (value is List<Object?>) {
    return value.map(canonicalJson).toList();
  }
  return value;
}

/// Canonical JSON **text** — the bytes a node's identity is a hash of (Spec v2.3 §A15, §A16).
///
/// Not `jsonEncode`. A host's JSON encoder formats numbers the way *that host* likes: Dart writes the
/// double 100.0 as `100.0`, JavaScript writes it as `100`, and `-0.0` loses its sign in one of them.
/// Both are valid JSON and they are different bytes — so two conforming implementations would hash the
/// same node to two different ids, and an override would miss, a cache would serve the wrong artifact,
/// and an incremental build would stop matching a clean one.
///
/// So the encoding is the specification's, not the host's. This is the only encoder the compiler may
/// use for UIR.
String canonicalEncode(Object? value) {
  final StringBuffer out = StringBuffer();
  _encode(canonicalJson(value), out);
  return out.toString();
}

void _encode(Object? value, StringBuffer out) {
  if (value == null) {
    out.write('null');
  } else if (value is num) {
    out.write(canonicalNumber(value));
  } else if (value is String || value is bool) {
    out.write(jsonEncode(value));
  } else if (value is List<Object?>) {
    out.write('[');
    for (int i = 0; i < value.length; i++) {
      if (i > 0) out.write(',');
      _encode(value[i], out);
    }
    out.write(']');
  } else if (value is Map<String, Object?>) {
    out.write('{');
    bool first = true;
    // Already sorted by canonicalJson. Sorting here again would be a second opinion about key order.
    for (final MapEntry<String, Object?> entry in value.entries) {
      if (!first) out.write(',');
      first = false;
      out
        ..write(jsonEncode(entry.key))
        ..write(':');
      _encode(entry.value, out);
    }
    out.write('}');
  } else {
    throw ArgumentError.value(value, 'value', 'not JSON-representable');
  }
}

/// The largest integer an IEEE-754 double represents exactly: 2^53 - 1.
const int maxSafeInteger = 9007199254740991;

/// A number, in canonical form (Spec v2.3 §A15).
///
/// * NaN and infinities are prohibited — JSON cannot carry them, and a host that pretends otherwise
///   (JavaScript writes NaN as `null`) is worse than one that fails.
/// * An **int** beyond ±(2^53 - 1) is prohibited: a 64-bit Dart int above it cannot survive a
///   round-trip through a double, and therefore cannot survive JSON read by JavaScript. Refused, never
///   silently rounded. A **double** of any magnitude is fine — it is already a double, so it survives a
///   double by definition. `1e21` is a legal value; the int `9007199254740993` is not.
/// * Otherwise: the shortest decimal that round-trips, with **no trailing `.0`** and an **unsigned
///   zero**. The node's `type` already says whether the value is an int or a double; the number
///   carries the value. Encoding the same fact twice is how two encodings of it come to disagree.
String canonicalNumber(num value) {
  if (value is double && !value.isFinite) {
    throw ArgumentError.value(value, 'value', 'NaN and infinities have no canonical form (§A15)');
  }
  if (value is int && (value > maxSafeInteger || value < -maxSafeInteger)) {
    throw ArgumentError.value(
      value,
      'value',
      'integers beyond 2^53-1 cannot round-trip through JSON read by an IEEE-754 host (§A15)',
    );
  }
  if (value == 0) {
    // Unsigned. IEEE-754 distinguishes -0.0 from 0.0; the UIR does not, and JSON cannot carry it.
    return '0';
  }

  final String text = value.toString();
  // Dart's shortest-round-trip form agrees with JavaScript's digit for digit, including the exponent
  // thresholds — verified across the range, subnormals and the maximum double included. The one place
  // it differs is the trailing `.0` it gives an integral double.
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

/// How many hex characters of the digest an id keeps (Spec §2.3).
const int nodeIdLength = 16;

/// Strips `id`, `anchor` and `span` from [value] and from **everything inside it**.
///
/// Recursively, and that is the subtle part. A parent embeds its children whole, so a parent's JSON
/// contains its children's spans — and hashing that would change the parent's id whenever a *child*
/// moved. Since a child moves whenever a line is inserted above it, every id in the file would change
/// on every keystroke: the cache would never hit, and every override anchor would be orphaned on every
/// save.
Object? stripIdentity(Object? value) {
  if (value is Map<String, Object?>) {
    final Map<String, Object?> out = <String, Object?>{};
    for (final MapEntry<String, Object?> entry in value.entries) {
      if (entry.key == 'id' || entry.key == 'anchor' || entry.key == 'span') continue;
      out[entry.key] = stripIdentity(entry.value);
    }
    return out;
  }
  if (value is List<Object?>) return value.map(stripIdentity).toList();
  return value;
}

/// The id of a **tree node**: a hash of its canonical content (Spec §2.3, v2.3 §A16).
///
/// Two identical subtrees have one id. That is what content addressing *means*, and it is why the
/// anchor — not the id — is what tells two identical `SizedBox`es apart.
String nodeIdOfContent(Object? content) =>
    _digest('n', canonicalEncode(stripIdentity(content)));

/// The id of a **declaration**: a hash of its stable symbol.
///
/// Not of its content. Editing the *body* of a method must not change the id of the signal it writes —
/// otherwise a file being rebuilt could not resolve a reference into a cached file to the id that file
/// already has, and per-file caching would be impossible rather than merely difficult (M1-T5).
String nodeIdOfSymbol(String symbol) => _digest('d', symbol);

/// **The** id function. Both language domains generate this from one template, so they cannot drift —
/// which is the whole point of §A16, and which a hand-written copy in each domain would quietly undo.
///
/// ASSUMPTION (ISSUE-7, ratified in ADR-17): Spec §2.3 names blake3. There is none in the Dart SDK, and
/// the id must be bit-identical in both languages. SHA-256 is available in both. Only this function
/// changes if that is ever revisited.
String _digest(String tier, String payload) =>
    sha256.convert(utf8.encode('$tier:$payload')).toString().substring(0, nodeIdLength);

/// How an assignment combines its target with its value (Spec v2.2 §A10).
///
/// An enum, not a free-form string: a generator that receives an operator it does not know must fail to compile rather than silently emit the wrong arithmetic. `Binary.operator` is a string because a binary operator is pure — the worst a wrong one does is compute the wrong number. A wrong assignment operator writes the wrong value to state.
enum AssignmentOperator {
  /// `=` — replace the target's value.
  assign,
  /// `+=`
  addAssign,
  /// `-=`
  subtractAssign,
  /// `*=`
  multiplyAssign,
  /// `/=`
  divideAssign,
  /// `~/=` — Dart's integer division. JavaScript has no operator for it, so a generator must emit `Math.trunc(a / b)`; conflating it with `/=` silently changes the result type.
  truncatingDivideAssign,
  /// `%=` — Dart's modulo is always non-negative for a positive divisor; JavaScript's `%` is not. A generator must not assume they agree.
  moduloAssign,
  /// `??=` — assign only if the target is null.
  ifNullAssign,
  /// `&=`
  bitAndAssign,
  /// `|=`
  bitOrAssign,
  /// `^=`
  bitXorAssign,
  /// `<<=`
  shiftLeftAssign,
  /// `>>=`
  shiftRightAssign,
  /// `>>>=`
  unsignedShiftRightAssign,
  /// `++` — `value` is absent.
  increment,
  /// `--` — `value` is absent.
  decrement,
  ;

  /// Parses a [AssignmentOperator] from its wire value. Rejects anything outside the enum.
  static AssignmentOperator fromJson(Object? value, [String path = 'AssignmentOperator']) {
    final String raw = _asString(value, path);
    for (final AssignmentOperator candidate in AssignmentOperator.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown AssignmentOperator "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// Diagnostic codes reserved by the schema because a node or a pass carries them (Spec v2.1 §A6).
///
/// Only codes the UIR itself refers to are listed. The full registry lives in the compiler.
enum DiagnosticCode {
  /// A non-serializable object was passed as a route argument (ADR-11a). A URL route carries an identifier, not an object graph. Error.
  BRG2301,
  /// Cross-route state was promoted to a store by N11 (ADR-11). Informational — promotion is never silent.
  BRG2302,
  /// A cross-route callback could not be promoted; an override is required (ADR-11). Error.
  BRG2303,
  ;

  /// Parses a [DiagnosticCode] from its wire value. Rejects anything outside the enum.
  static DiagnosticCode fromJson(Object? value, [String path = 'DiagnosticCode']) {
    final String raw = _asString(value, path);
    for (final DiagnosticCode candidate in DiagnosticCode.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown DiagnosticCode "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// When an effect runs.
enum EffectTiming {
  /// On mount — Flutter's `initState`.
  mount,
  /// On dependency change — Flutter's `didUpdateWidget`.
  update,
  /// On unmount — Flutter's `dispose`.
  unmount,
  ;

  /// Parses a [EffectTiming] from its wire value. Rejects anything outside the enum.
  static EffectTiming fromJson(Object? value, [String path = 'EffectTiming']) {
    final String raw = _asString(value, path);
    for (final EffectTiming candidate in EffectTiming.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown EffectTiming "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// An HTTP method.
enum HttpMethod {
  /// GET.
  get,
  /// POST.
  post,
  /// PUT.
  put,
  /// PATCH.
  patch,
  /// DELETE.
  delete,
  ;

  /// Parses a [HttpMethod] from its wire value. Rejects anything outside the enum.
  static HttpMethod fromJson(Object? value, [String path = 'HttpMethod']) {
    final String raw = _asString(value, path);
    for (final HttpMethod candidate in HttpMethod.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown HttpMethod "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// Which implementation of Flutter's layout protocol a subtree needs (Spec §5, risk R2).
enum LayoutTier {
  /// Expressible in flexbox/grid. The default, and the cheapest: no measurement at runtime.
  css,
  /// Requires runtime measurement (ResizeObserver), because CSS cannot express the constraint.
  measured,
  ;

  /// Parses a [LayoutTier] from its wire value. Rejects anything outside the enum.
  static LayoutTier fromJson(Object? value, [String path = 'LayoutTier']) {
    final String raw = _asString(value, path);
    for (final LayoutTier candidate in LayoutTier.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown LayoutTier "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// A Material 3 colour role.
///
/// ADR-13: `hello_bridge` declares only `brightness`, `primaryColor` and `scaffoldBackgroundColor`; every other colour Flutter paints is *derived* algorithmically. That information is not in the Dart source text — it is in Material's algorithm — so N10 computes the full role set with `material_color_utilities`, the same package Flutter itself uses. The colours we copied verbatim matched exactly; the ones we guessed were wrong by up to 15/255 per channel, invisibly (M0-T5 F1).
enum MaterialRole {
  /// The Material 3 `primary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primary,
  /// The Material 3 `onPrimary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimary,
  /// The Material 3 `primaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryContainer,
  /// The Material 3 `onPrimaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryContainer,
  /// The Material 3 `primaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryFixed,
  /// The Material 3 `primaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  primaryFixedDim,
  /// The Material 3 `onPrimaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryFixed,
  /// The Material 3 `onPrimaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onPrimaryFixedVariant,
  /// The Material 3 `secondary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondary,
  /// The Material 3 `onSecondary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondary,
  /// The Material 3 `secondaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryContainer,
  /// The Material 3 `onSecondaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryContainer,
  /// The Material 3 `secondaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryFixed,
  /// The Material 3 `secondaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  secondaryFixedDim,
  /// The Material 3 `onSecondaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryFixed,
  /// The Material 3 `onSecondaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSecondaryFixedVariant,
  /// The Material 3 `tertiary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiary,
  /// The Material 3 `onTertiary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiary,
  /// The Material 3 `tertiaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryContainer,
  /// The Material 3 `onTertiaryContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryContainer,
  /// The Material 3 `tertiaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryFixed,
  /// The Material 3 `tertiaryFixedDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  tertiaryFixedDim,
  /// The Material 3 `onTertiaryFixed` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryFixed,
  /// The Material 3 `onTertiaryFixedVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onTertiaryFixedVariant,
  /// The Material 3 `error` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  error,
  /// The Material 3 `onError` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onError,
  /// The Material 3 `errorContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  errorContainer,
  /// The Material 3 `onErrorContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onErrorContainer,
  /// The Material 3 `surface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surface,
  /// The Material 3 `onSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSurface,
  /// The Material 3 `surfaceDim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceDim,
  /// The Material 3 `surfaceBright` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceBright,
  /// The Material 3 `surfaceContainerLowest` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerLowest,
  /// The Material 3 `surfaceContainerLow` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerLow,
  /// The Material 3 `surfaceContainer` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainer,
  /// The Material 3 `surfaceContainerHigh` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerHigh,
  /// The Material 3 `surfaceContainerHighest` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceContainerHighest,
  /// The Material 3 `onSurfaceVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onSurfaceVariant,
  /// The Material 3 `surfaceTint` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  surfaceTint,
  /// The Material 3 `outline` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  outline,
  /// The Material 3 `outlineVariant` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  outlineVariant,
  /// The Material 3 `shadow` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  shadow,
  /// The Material 3 `scrim` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  scrim,
  /// The Material 3 `inverseSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  inverseSurface,
  /// The Material 3 `onInverseSurface` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  onInverseSurface,
  /// The Material 3 `inversePrimary` colour role, derived from the seed and brightness by material_color_utilities (ADR-13). Never guessed.
  inversePrimary,
  ;

  /// Parses a [MaterialRole] from its wire value. Rejects anything outside the enum.
  static MaterialRole fromJson(Object? value, [String path = 'MaterialRole']) {
    final String raw = _asString(value, path);
    for (final MaterialRole candidate in MaterialRole.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown MaterialRole "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// What a `logic.Navigate` does.
///
/// Named for the **effect on the navigation stack**, not for the Flutter API that produced it: a `go_router` `context.go` and a `Navigator.pushNamed` are both `push`, and a generator lowers the effect rather than recognising a package. ADR-0025 §5 is why — the M6-D corpus found zero `go_router` in two production applications after C1 recorded it as dominant, so which package is popular is not something to build a vocabulary on.
enum NavigateAction {
  /// A new entry on the stack. `Navigator.push`, `pushNamed`, and every route overlay — a dialog, modal sheet or menu pushes a `Route` (ADR-0024 cites the SDK).
  push,
  /// The current entry is replaced. `pushReplacement`, `pushReplacementNamed`.
  replace,
  /// The top entry is removed. `pop`, `maybePop`.
  pop,
  /// Entries are removed until a predicate holds. The predicate is **not** modelled; a generator that cannot express one must refuse rather than approximate.
  popUntil,
  ;

  /// Parses a [NavigateAction] from its wire value. Rejects anything outside the enum.
  static NavigateAction fromJson(Object? value, [String path = 'NavigateAction']) {
    final String raw = _asString(value, path);
    for (final NavigateAction candidate in NavigateAction.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown NavigateAction "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// How a route argument survives — or fails to survive — a URL boundary (ADR-11, ADR-11a).
///
/// In Flutter a route argument is a live Dart value. In every URL-routed target it is a string in an address bar. This enum is where that difference is made explicit rather than discovered at runtime.
enum RouteArgumentTransport {
  /// A primitive. Crosses a URL boundary unchanged.
  primitive,
  /// A signal read, promoted to a store by N11 and dropped from the transition (BRG2302).
  promotedSignal,
  /// A callback, promoted to a store action by N11 and dropped from the transition (BRG2302).
  promotedCallback,
  /// A live object. A URL carries an identifier, not an object graph: reported as BRG2301 and left to the developer (evidence insufficient to infer identity and loader).
  objectTransport,
  /// A callback that captures state N11 cannot promote. Reported as BRG2303; an override is required.
  unpromotable,
  ;

  /// Parses a [RouteArgumentTransport] from its wire value. Rejects anything outside the enum.
  static RouteArgumentTransport fromJson(Object? value, [String path = 'RouteArgumentTransport']) {
    final String raw = _asString(value, path);
    for (final RouteArgumentTransport candidate in RouteArgumentTransport.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown RouteArgumentTransport "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// Where a signal lives.
///
/// N11 (`promote-cross-route-state`, ADR-11) rewrites `component` to `store` when a signal or its mutator crosses a route boundary: a closure cannot be serialized to a URL, so the state must outlive the component that declared it.
enum SignalScope {
  /// Owned by one component — a Flutter State field.
  component,
  /// Owned by a store, and therefore able to cross a route boundary.
  store,
  ;

  /// Parses a [SignalScope] from its wire value. Rejects anything outside the enum.
  static SignalScope fromJson(Object? value, [String path = 'SignalScope']) {
    final String raw = _asString(value, path);
    for (final SignalScope candidate in SignalScope.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown SignalScope "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// What a node wants to do with the space it is offered, along one axis (Spec v2.1 §A3).
///
/// Flutter's `Center` passes *loose* constraints: the child may take up to the parent's size and decides for itself. CSS has no equivalent — a flex child shrink-wraps, full stop — so one CSS rule cannot serve both `Center(child: Column(stretch))` and `Center(child: Text)`. The `layout-boundedness` analysis records the child's own intent here, and the generator hands it to the runtime kit rather than guessing.
enum SizeIntent {
  /// Take all the space offered, e.g. a Column with crossAxisAlignment: stretch.
  fill,
  /// Take only as much space as the content needs.
  shrink,
  /// Take an explicitly given size.
  fixed,
  ;

  /// Parses a [SizeIntent] from its wire value. Rejects anything outside the enum.
  static SizeIntent fromJson(Object? value, [String path = 'SizeIntent']) {
    final String raw = _asString(value, path);
    for (final SizeIntent candidate in SizeIntent.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown SizeIntent "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// Where a store came from.
enum StoreOrigin {
  /// The application declared it — e.g. a ChangeNotifier class.
  declared,
  /// N11 synthesized it, to hold state that crosses a route boundary (ADR-11). Reported as BRG2302: promotion is never silent.
  promoted,
  ;

  /// Parses a [StoreOrigin] from its wire value. Rejects anything outside the enum.
  static StoreOrigin fromJson(Object? value, [String path = 'StoreOrigin']) {
    final String raw = _asString(value, path);
    for (final StoreOrigin candidate in StoreOrigin.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown StoreOrigin "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// Which design-token family a token belongs to.
enum TokenGroup {
  /// A colour role.
  color,
  /// A type style.
  typography,
  /// A spacing step.
  space,
  /// A corner radius.
  radius,
  /// An elevation shadow.
  shadow,
  /// A duration or curve.
  motion,
  ;

  /// Parses a [TokenGroup] from its wire value. Rejects anything outside the enum.
  static TokenGroup fromJson(Object? value, [String path = 'TokenGroup']) {
    final String raw = _asString(value, path);
    for (final TokenGroup candidate in TokenGroup.values) {
      if (candidate.name == raw) return candidate;
    }
    throw UirParseError(path, 'unknown TokenGroup "$raw"');
  }

  /// The wire value.
  String toJson() => name;
}

/// A human-stable path to a node, e.g. `lib/screens/checkout.dart#CheckoutScreen/build/Column[0]/Row[2]`.
///
/// Stable across formatting-only edits. This is the key the override system uses, so a reformatted file must not orphan a human's hand-written component.
typedef Anchor = String;

/// A node's content-addressed identity: blake3 of the node's canonical form, minus its own id, anchor and span.
///
/// Ids are permanent. They key overrides, caches, incrementality and AI provenance (ADR-7), so the canonical form that produces them may never change meaning.
typedef NodeId = String;

/// How a prop gets its value.
sealed class Binding extends UirNode {
  /// Creates a [Binding].
  const Binding();

  /// Parses any [Binding], dispatching on `kind`.
  static Binding fromJson(Object? value, [String path = 'Binding']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    switch (kind) {
      case 'bind.Const':
        return ConstBinding.fromJson(json, path);
      case 'bind.Expr':
        return ExprBinding.fromJson(json, path);
      case 'bind.Param':
        return ParamBinding.fromJson(json, path);
      case 'bind.Signal':
        return SignalBinding.fromJson(json, path);
      default:
        throw UirParseError('$path.kind', 'unknown Binding kind "$kind"');
    }
  }

  /// Dispatches this node to [visitor].
  R accept<R>(BindingVisitor<R> visitor);
}

/// Any declaration.
sealed class Decl extends UirNode {
  /// Creates a [Decl].
  const Decl();

  /// Parses any [Decl], dispatching on `kind`.
  static Decl fromJson(Object? value, [String path = 'Decl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    switch (kind) {
      case 'logic.ClassDecl':
        return ClassDecl.fromJson(json, path);
      case 'logic.EnumDecl':
        return EnumDecl.fromJson(json, path);
      case 'logic.FieldDecl':
        return FieldDecl.fromJson(json, path);
      case 'logic.FunctionDecl':
        return FunctionDecl.fromJson(json, path);
      case 'logic.OpaqueDecl':
        return OpaqueDecl.fromJson(json, path);
      case 'logic.TypeAliasDecl':
        return TypeAliasDecl.fromJson(json, path);
      default:
        throw UirParseError('$path.kind', 'unknown Decl kind "$kind"');
    }
  }

  /// Dispatches this node to [visitor].
  R accept<R>(DeclVisitor<R> visitor);
}

/// Any expression.
sealed class Expr extends UirNode {
  /// Creates a [Expr].
  const Expr();

  /// Parses any [Expr], dispatching on `kind`.
  static Expr fromJson(Object? value, [String path = 'Expr']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    switch (kind) {
      case 'logic.Assign':
        return Assign.fromJson(json, path);
      case 'logic.Await':
        return Await.fromJson(json, path);
      case 'logic.Binary':
        return Binary.fromJson(json, path);
      case 'logic.Call':
        return Call.fromJson(json, path);
      case 'logic.Cast':
        return Cast.fromJson(json, path);
      case 'logic.Conditional':
        return Conditional.fromJson(json, path);
      case 'logic.Lambda':
        return Lambda.fromJson(json, path);
      case 'logic.ListLit':
        return ListLit.fromJson(json, path);
      case 'logic.Lit':
        return Lit.fromJson(json, path);
      case 'logic.MapLit':
        return MapLit.fromJson(json, path);
      case 'logic.MethodCall':
        return MethodCall.fromJson(json, path);
      case 'logic.New':
        return New.fromJson(json, path);
      case 'logic.NullCheck':
        return NullCheck.fromJson(json, path);
      case 'logic.OpaqueExpr':
        return OpaqueExpr.fromJson(json, path);
      case 'logic.PropertyAccess':
        return PropertyAccess.fromJson(json, path);
      case 'logic.Ref':
        return Ref.fromJson(json, path);
      case 'logic.StringInterp':
        return StringInterp.fromJson(json, path);
      case 'logic.Unary':
        return Unary.fromJson(json, path);
      default:
        throw UirParseError('$path.kind', 'unknown Expr kind "$kind"');
    }
  }

  /// Dispatches this node to [visitor].
  R accept<R>(ExprVisitor<R> visitor);
}

/// Any statement.
sealed class Stmt extends UirNode {
  /// Creates a [Stmt].
  const Stmt();

  /// Parses any [Stmt], dispatching on `kind`.
  static Stmt fromJson(Object? value, [String path = 'Stmt']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    switch (kind) {
      case 'logic.Block':
        return Block.fromJson(json, path);
      case 'logic.Break':
        return Break.fromJson(json, path);
      case 'logic.Continue':
        return Continue.fromJson(json, path);
      case 'logic.ExprStmt':
        return ExprStmt.fromJson(json, path);
      case 'logic.For':
        return For.fromJson(json, path);
      case 'logic.If':
        return If.fromJson(json, path);
      case 'logic.Navigate':
        return Navigate.fromJson(json, path);
      case 'logic.OpaqueStmt':
        return OpaqueStmt.fromJson(json, path);
      case 'logic.Return':
        return Return.fromJson(json, path);
      case 'logic.Switch':
        return Switch.fromJson(json, path);
      case 'logic.Throw':
        return Throw.fromJson(json, path);
      case 'logic.TryCatch':
        return TryCatch.fromJson(json, path);
      case 'logic.VarDecl':
        return VarDecl.fromJson(json, path);
      case 'logic.While':
        return While.fromJson(json, path);
      default:
        throw UirParseError('$path.kind', 'unknown Stmt kind "$kind"');
    }
  }

  /// Dispatches this node to [visitor].
  R accept<R>(StmtVisitor<R> visitor);
}

/// Any node in a render tree.
sealed class UiNode extends UirNode {
  /// Creates a [UiNode].
  const UiNode();

  /// Parses any [UiNode], dispatching on `kind`.
  static UiNode fromJson(Object? value, [String path = 'UiNode']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    switch (kind) {
      case 'ui.Async':
        return UiAsync.fromJson(json, path);
      case 'ui.Cond':
        return UiCond.fromJson(json, path);
      case 'ui.Element':
        return UiElement.fromJson(json, path);
      case 'ui.List':
        return UiList.fromJson(json, path);
      case 'ui.Opaque':
        return UiOpaque.fromJson(json, path);
      case 'ui.OverrideRef':
        return UiOverrideRef.fromJson(json, path);
      case 'ui.SlotRef':
        return UiSlotRef.fromJson(json, path);
      case 'ui.Text':
        return UiText.fromJson(json, path);
      default:
        throw UirParseError('$path.kind', 'unknown UiNode kind "$kind"');
    }
  }

  /// Dispatches this node to [visitor].
  R accept<R>(UiNodeVisitor<R> visitor);
}

/// One catch clause of a try statement.
@immutable
final class CatchClause {
  /// Creates a [CatchClause].
  const CatchClause({
    required this.body,
    this.exceptionName,
    this.exceptionType,
    this.stackTraceName,
  });

  /// Parses a [CatchClause] from JSON, validating as it goes.
  factory CatchClause.fromJson(Object? value, [String path = 'CatchClause']) {
    final Map<String, Object?> json = _asObject(value, path);
    return CatchClause(
      body: Block.fromJson(_req(json, 'body', path), '$path.body'),
      exceptionName: json['exceptionName'] == null ? null : _asString(json['exceptionName'], '$path.exceptionName'),
      exceptionType: json['exceptionType'] == null ? null : TypeRef.fromJson(json['exceptionType'], '$path.exceptionType'),
      stackTraceName: json['stackTraceName'] == null ? null : _asString(json['stackTraceName'], '$path.stackTraceName'),
    );
  }

  /// The clause body.
  final Block body;

  /// The bound exception variable.
  final String? exceptionName;

  /// The type caught, if narrowed.
  final TypeRef? exceptionType;

  /// The bound stack-trace variable.
  final String? stackTraceName;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'body': body.toJson(),
    'exceptionName': exceptionName,
    'exceptionType': exceptionType?.toJson(),
    'stackTraceName': stackTraceName,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  CatchClause copyWith({
    Block? body,
    String? exceptionName,
    TypeRef? exceptionType,
    String? stackTraceName,
  }) {
    return CatchClause(
      body: body ?? this.body,
      exceptionName: exceptionName ?? this.exceptionName,
      exceptionType: exceptionType ?? this.exceptionType,
      stackTraceName: stackTraceName ?? this.stackTraceName,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is CatchClause &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.exceptionName, exceptionName) &&
        _equality.equals(other.exceptionType, exceptionType) &&
        _equality.equals(other.stackTraceName, stackTraceName);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'CatchClause',
    _equality.hash(body),
    _equality.hash(exceptionName),
    _equality.hash(exceptionType),
    _equality.hash(stackTraceName),
  ]);
}

/// The layout information a ui-realm generator needs, computed by the `layout-boundedness` analysis.
///
/// Additive: it is an optional field on `UiElement` and changes no existing node semantics.
@immutable
final class LayoutIntent {
  /// Creates a [LayoutIntent].
  const LayoutIntent({
    required this.heightIntent,
    required this.tier,
    required this.widthIntent,
  });

  /// Parses a [LayoutIntent] from JSON, validating as it goes.
  factory LayoutIntent.fromJson(Object? value, [String path = 'LayoutIntent']) {
    final Map<String, Object?> json = _asObject(value, path);
    return LayoutIntent(
      heightIntent: SizeIntent.fromJson(_req(json, 'heightIntent', path), '$path.heightIntent'),
      tier: LayoutTier.fromJson(_req(json, 'tier', path), '$path.tier'),
      widthIntent: SizeIntent.fromJson(_req(json, 'widthIntent', path), '$path.widthIntent'),
    );
  }

  /// What the node does with offered height.
  final SizeIntent heightIntent;

  /// Which layout implementation the subtree requires.
  final LayoutTier tier;

  /// What the node does with offered width.
  final SizeIntent widthIntent;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'heightIntent': heightIntent.toJson(),
    'tier': tier.toJson(),
    'widthIntent': widthIntent.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  LayoutIntent copyWith({
    SizeIntent? heightIntent,
    LayoutTier? tier,
    SizeIntent? widthIntent,
  }) {
    return LayoutIntent(
      heightIntent: heightIntent ?? this.heightIntent,
      tier: tier ?? this.tier,
      widthIntent: widthIntent ?? this.widthIntent,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is LayoutIntent &&
        _equality.equals(other.heightIntent, heightIntent) &&
        _equality.equals(other.tier, tier) &&
        _equality.equals(other.widthIntent, widthIntent);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'LayoutIntent',
    _equality.hash(heightIntent),
    _equality.hash(tier),
    _equality.hash(widthIntent),
  ]);
}

/// A parameter of a function, method, or widget constructor.
@immutable
final class ParamDecl {
  /// Creates a [ParamDecl].
  const ParamDecl({
    required this.name,
    required this.type,
    this.defaultValue,
    this.named,
    this.required,
  });

  /// Parses a [ParamDecl] from JSON, validating as it goes.
  factory ParamDecl.fromJson(Object? value, [String path = 'ParamDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    return ParamDecl(
      defaultValue: json['defaultValue'] == null ? null : Expr.fromJson(json['defaultValue'], '$path.defaultValue'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      named: json['named'] == null ? null : _asBool(json['named'], '$path.named'),
      required: json['required'] == null ? null : _asBool(json['required'], '$path.required'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// Default value, if any.
  final Expr? defaultValue;

  /// Parameter name.
  final String name;

  /// Whether the parameter is named rather than positional.
  final bool? named;

  /// Whether the parameter is required.
  final bool? required;

  /// Resolved type.
  final TypeRef type;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'defaultValue': defaultValue?.toJson(),
    'name': name,
    'named': named,
    'required': required,
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ParamDecl copyWith({
    Expr? defaultValue,
    String? name,
    bool? named,
    bool? required,
    TypeRef? type,
  }) {
    return ParamDecl(
      defaultValue: defaultValue ?? this.defaultValue,
      name: name ?? this.name,
      named: named ?? this.named,
      required: required ?? this.required,
      type: type ?? this.type,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ParamDecl &&
        _equality.equals(other.defaultValue, defaultValue) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.named, named) &&
        _equality.equals(other.required, required) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ParamDecl',
    _equality.hash(defaultValue),
    _equality.hash(name),
    _equality.hash(named),
    _equality.hash(required),
    _equality.hash(type),
  ]);
}

/// One argument passed to a route transition, and what became of it.
@immutable
final class RouteArgument {
  /// Creates a [RouteArgument].
  const RouteArgument({
    required this.name,
    required this.transport,
    this.binding,
    this.diagnostic,
    this.promotedTo,
  });

  /// Parses a [RouteArgument] from JSON, validating as it goes.
  factory RouteArgument.fromJson(Object? value, [String path = 'RouteArgument']) {
    final Map<String, Object?> json = _asObject(value, path);
    return RouteArgument(
      binding: json['binding'] == null ? null : Binding.fromJson(json['binding'], '$path.binding'),
      diagnostic: json['diagnostic'] == null ? null : DiagnosticCode.fromJson(json['diagnostic'], '$path.diagnostic'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      promotedTo: json['promotedTo'] == null ? null : _asString(json['promotedTo'], '$path.promotedTo'),
      transport: RouteArgumentTransport.fromJson(_req(json, 'transport', path), '$path.transport'),
    );
  }

  /// The value passed, as bound at the call site.
  final Binding? binding;

  /// The diagnostic raised, when the argument cannot cross unchanged.
  final DiagnosticCode? diagnostic;

  /// The parameter name on the destination.
  final String name;

  /// The store this argument's state was promoted into, for the promoted transports.
  final NodeId? promotedTo;

  /// How it survives the URL boundary.
  final RouteArgumentTransport transport;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'binding': binding?.toJson(),
    'diagnostic': diagnostic?.toJson(),
    'name': name,
    'promotedTo': promotedTo,
    'transport': transport.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  RouteArgument copyWith({
    Binding? binding,
    DiagnosticCode? diagnostic,
    String? name,
    NodeId? promotedTo,
    RouteArgumentTransport? transport,
  }) {
    return RouteArgument(
      binding: binding ?? this.binding,
      diagnostic: diagnostic ?? this.diagnostic,
      name: name ?? this.name,
      promotedTo: promotedTo ?? this.promotedTo,
      transport: transport ?? this.transport,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is RouteArgument &&
        _equality.equals(other.binding, binding) &&
        _equality.equals(other.diagnostic, diagnostic) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.promotedTo, promotedTo) &&
        _equality.equals(other.transport, transport);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'RouteArgument',
    _equality.hash(binding),
    _equality.hash(diagnostic),
    _equality.hash(name),
    _equality.hash(promotedTo),
    _equality.hash(transport),
  ]);
}

/// Accessibility semantics, extracted from Flutter's Semantics tree.
///
/// The input to the semantics verifier (Spec §8), which compares this against the rendered ARIA tree — a check of *meaning*, not pixels.
@immutable
final class SemanticsInfo {
  /// Creates a [SemanticsInfo].
  const SemanticsInfo({
    this.excluded,
    this.hint,
    this.label,
    this.role,
  });

  /// Parses a [SemanticsInfo] from JSON, validating as it goes.
  factory SemanticsInfo.fromJson(Object? value, [String path = 'SemanticsInfo']) {
    final Map<String, Object?> json = _asObject(value, path);
    return SemanticsInfo(
      excluded: json['excluded'] == null ? null : _asBool(json['excluded'], '$path.excluded'),
      hint: json['hint'] == null ? null : _asString(json['hint'], '$path.hint'),
      label: json['label'] == null ? null : _asString(json['label'], '$path.label'),
      role: json['role'] == null ? null : _asString(json['role'], '$path.role'),
    );
  }

  /// Whether the subtree is excluded from semantics.
  final bool? excluded;

  /// The accessible hint.
  final String? hint;

  /// The accessible label.
  final String? label;

  /// The semantic role.
  final String? role;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'excluded': excluded,
    'hint': hint,
    'label': label,
    'role': role,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SemanticsInfo copyWith({
    bool? excluded,
    String? hint,
    String? label,
    String? role,
  }) {
    return SemanticsInfo(
      excluded: excluded ?? this.excluded,
      hint: hint ?? this.hint,
      label: label ?? this.label,
      role: role ?? this.role,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SemanticsInfo &&
        _equality.equals(other.excluded, excluded) &&
        _equality.equals(other.hint, hint) &&
        _equality.equals(other.label, label) &&
        _equality.equals(other.role, role);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SemanticsInfo',
    _equality.hash(excluded),
    _equality.hash(hint),
    _equality.hash(label),
    _equality.hash(role),
  ]);
}

/// Route metadata for the document head.
@immutable
final class SeoMeta {
  /// Creates a [SeoMeta].
  const SeoMeta({
    this.description,
    this.title,
  });

  /// Parses a [SeoMeta] from JSON, validating as it goes.
  factory SeoMeta.fromJson(Object? value, [String path = 'SeoMeta']) {
    final Map<String, Object?> json = _asObject(value, path);
    return SeoMeta(
      description: json['description'] == null ? null : _asString(json['description'], '$path.description'),
      title: json['title'] == null ? null : _asString(json['title'], '$path.title'),
    );
  }

  /// The meta description.
  final String? description;

  /// The page title.
  final String? title;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'description': description,
    'title': title,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SeoMeta copyWith({
    String? description,
    String? title,
  }) {
    return SeoMeta(
      description: description ?? this.description,
      title: title ?? this.title,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SeoMeta &&
        _equality.equals(other.description, description) &&
        _equality.equals(other.title, title);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SeoMeta',
    _equality.hash(description),
    _equality.hash(title),
  ]);
}

/// A location in a Dart source file.
@immutable
final class SourceSpan {
  /// Creates a [SourceSpan].
  const SourceSpan({
    required this.column,
    required this.file,
    required this.line,
    this.length,
  });

  /// Parses a [SourceSpan] from JSON, validating as it goes.
  factory SourceSpan.fromJson(Object? value, [String path = 'SourceSpan']) {
    final Map<String, Object?> json = _asObject(value, path);
    return SourceSpan(
      column: _asInt(_req(json, 'column', path), '$path.column'),
      file: _asString(_req(json, 'file', path), '$path.file'),
      length: json['length'] == null ? null : _asInt(json['length'], '$path.length'),
      line: _asInt(_req(json, 'line', path), '$path.line'),
    );
  }

  /// 1-based column.
  final int column;

  /// Project-relative path. Never absolute: an absolute path would make output depend on where the project sits on disk.
  final String file;

  /// Length in characters. Absent means a point.
  final int? length;

  /// 1-based line.
  final int line;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'column': column,
    'file': file,
    'length': length,
    'line': line,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SourceSpan copyWith({
    int? column,
    String? file,
    int? length,
    int? line,
  }) {
    return SourceSpan(
      column: column ?? this.column,
      file: file ?? this.file,
      length: length ?? this.length,
      line: line ?? this.line,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SourceSpan &&
        _equality.equals(other.column, column) &&
        _equality.equals(other.file, file) &&
        _equality.equals(other.length, length) &&
        _equality.equals(other.line, line);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SourceSpan',
    _equality.hash(column),
    _equality.hash(file),
    _equality.hash(length),
    _equality.hash(line),
  ]);
}

/// One case of a switch statement.
@immutable
final class SwitchCase {
  /// Creates a [SwitchCase].
  const SwitchCase({
    required this.body,
    this.test,
  });

  /// Parses a [SwitchCase] from JSON, validating as it goes.
  factory SwitchCase.fromJson(Object? value, [String path = 'SwitchCase']) {
    final Map<String, Object?> json = _asObject(value, path);
    return SwitchCase(
      body: _asList<Stmt>(_req(json, 'body', path), '$path.body', Stmt.fromJson),
      test: json['test'] == null ? null : Expr.fromJson(json['test'], '$path.test'),
    );
  }

  /// Body, in order.
  final List<Stmt> body;

  /// The value matched. Absent for the default case.
  final Expr? test;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'body': body.map((Stmt v) => v.toJson()).toList(),
    'test': test?.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SwitchCase copyWith({
    List<Stmt>? body,
    Expr? test,
  }) {
    return SwitchCase(
      body: body ?? this.body,
      test: test ?? this.test,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SwitchCase &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.test, test);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SwitchCase',
    _equality.hash(body),
    _equality.hash(test),
  ]);
}

/// A resolved Dart type, as the analyzer saw it.
@immutable
final class TypeRef {
  /// Creates a [TypeRef].
  const TypeRef({
    required this.name,
    this.library,
    this.nullable,
  });

  /// Parses a [TypeRef] from JSON, validating as it goes.
  factory TypeRef.fromJson(Object? value, [String path = 'TypeRef']) {
    final Map<String, Object?> json = _asObject(value, path);
    return TypeRef(
      library: json['library'] == null ? null : _asString(json['library'], '$path.library'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      nullable: json['nullable'] == null ? null : _asBool(json['nullable'], '$path.nullable'),
    );
  }

  /// The library that declares it, e.g. `package:flutter/material.dart`.
  final String? library;

  /// The display name, e.g. `List<Item>`.
  final String name;

  /// Whether the type is nullable.
  final bool? nullable;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'library': library,
    'name': name,
    'nullable': nullable,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  TypeRef copyWith({
    String? library,
    String? name,
    bool? nullable,
  }) {
    return TypeRef(
      library: library ?? this.library,
      name: name ?? this.name,
      nullable: nullable ?? this.nullable,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TypeRef &&
        _equality.equals(other.library, library) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.nullable, nullable);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'TypeRef',
    _equality.hash(library),
    _equality.hash(name),
    _equality.hash(nullable),
  ]);
}

/// A reference to a widget class — a framework widget, a package widget, or one the application declares.
@immutable
final class WidgetRef {
  /// Creates a [WidgetRef].
  const WidgetRef({
    required this.name,
    this.constructorName,
    this.library,
    this.userDefined,
  });

  /// Parses a [WidgetRef] from JSON, validating as it goes.
  factory WidgetRef.fromJson(Object? value, [String path = 'WidgetRef']) {
    final Map<String, Object?> json = _asObject(value, path);
    return WidgetRef(
      constructorName: json['constructorName'] == null ? null : _asString(json['constructorName'], '$path.constructorName'),
      library: json['library'] == null ? null : _asString(json['library'], '$path.library'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      userDefined: json['userDefined'] == null ? null : _asBool(json['userDefined'], '$path.userDefined'),
    );
  }

  /// The named constructor, e.g. `builder` for `ListView.builder`.
  final String? constructorName;

  /// The declaring library. Distinguishes a framework widget from a package's, and from the application's own.
  final String? library;

  /// The class name, e.g. `Scaffold`.
  final String name;

  /// Whether the application declares this widget.
  ///
  /// C1 evidence: a user's own screens are what the compiler *generates*, not constructs it must map. Reporting them as unknown constructs was a false positive that would have opened every compatibility report with a lie.
  final bool? userDefined;

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'constructorName': constructorName,
    'library': library,
    'name': name,
    'userDefined': userDefined,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  WidgetRef copyWith({
    String? constructorName,
    String? library,
    String? name,
    bool? userDefined,
  }) {
    return WidgetRef(
      constructorName: constructorName ?? this.constructorName,
      library: library ?? this.library,
      name: name ?? this.name,
      userDefined: userDefined ?? this.userDefined,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is WidgetRef &&
        _equality.equals(other.constructorName, constructorName) &&
        _equality.equals(other.library, library) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.userDefined, userDefined);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'WidgetRef',
    _equality.hash(constructorName),
    _equality.hash(library),
    _equality.hash(name),
    _equality.hash(userDefined),
  ]);
}

/// A mutation of state — the normalized form of a `setState` body or a store method.
///
/// `writes` must include state mutated through **method calls** on owned collections (`add`, `remove`, `[]=`), not only assignments. C1 evidence: `FavoritesStore.toggle` mutates via `_favoriteIds.add/remove`, so an assignment-only analysis returns an empty write set — and generated React state that never updates.
///
/// An action may take **parameters** (Spec v2.5 §A18). `FavoritesStore.toggle(int id)` is an ordinary store method, and without `params` the `id` its body reads is declared nowhere: a `logic.Ref` to it is indistinguishable from a reference to a top-level function or a typo, and no target can emit it.
@immutable
final class Action extends UirNode {
  /// Creates a [Action].
  const Action({
    required this.id,
    required this.span,
    this.anchor,
    this.body,
    this.ext,
    this.isAsync,
    this.params,
    this.writes,
  });

  /// Parses a [Action] from JSON, validating as it goes.
  factory Action.fromJson(Object? value, [String path = 'Action']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'sig.Action') {
      throw UirParseError('$path.kind', 'expected "sig.Action", got "$kind"');
    }
    return Action(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: json['body'] == null ? null : _asList<Stmt>(json['body'], '$path.body', Stmt.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isAsync: json['isAsync'] == null ? null : _asBool(json['isAsync'], '$path.isAsync'),
      params: json['params'] == null ? null : _asList<ParamDecl>(json['params'], '$path.params', ParamDecl.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      writes: json['writes'] == null ? null : _asList<NodeId>(json['writes'], '$path.writes', _asString),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The action body, in order.
  final List<Stmt>? body;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Whether the action is async.
  final bool? isAsync;

  /// The action's parameters, in order (Spec v2.5 §A18).
  ///
  /// A `ParamDecl` has no `id` — it is a value, not a node — so a `logic.Ref` in the body resolves to a parameter **by name**, within the action's scope, exactly as `ui.Component.params` already works. Absent means the action takes none, which is the common case and why this is optional.
  final List<ParamDecl>? params;

  /// Where the node came from.
  final SourceSpan span;

  /// The signals this action writes.
  final List<NodeId>? writes;

  /// The node's discriminant.
  @override
  String get kind => 'sig.Action';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body?.map((Stmt v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'isAsync': isAsync,
    'kind': 'sig.Action',
    'params': params?.map((ParamDecl v) => v.toJson()).toList(),
    'span': span.toJson(),
    'writes': writes,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Action copyWith({
    Anchor? anchor,
    List<Stmt>? body,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isAsync,
    List<ParamDecl>? params,
    SourceSpan? span,
    List<NodeId>? writes,
  }) {
    return Action(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isAsync: isAsync ?? this.isAsync,
      params: params ?? this.params,
      span: span ?? this.span,
      writes: writes ?? this.writes,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Action &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isAsync, isAsync) &&
        _equality.equals(other.params, params) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.writes, writes);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Action',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isAsync),
    _equality.hash(params),
    _equality.hash(span),
    _equality.hash(writes),
  ]);
}

/// A write to a target: `a = b`, `a += b`, `a++`.
///
/// Added in v2.2 (§A10). Before it, the `Expr` union had no assignment at all, so every `setState` body — the one thing a Flutter→React compiler exists to translate — could only be carried as `OpaqueExpr`, i.e. a Dart source string no generator can compile. A census of the C1 corpus found 401 assignments across compass_app and wonderous, of which 210 were inside a `State` or `ChangeNotifier`; in our own fixture, *every* assignment was a state mutation.
///
/// Distinct from `sig.Action.writes`, and not replaceable by it: `writes` is a data-flow summary (*which* signals change), while this is program semantics (*what they become*). Both are required.
@immutable
final class Assign extends Expr {
  /// Creates a [Assign].
  const Assign({
    required this.id,
    required this.operator,
    required this.span,
    required this.target,
    required this.type,
    this.anchor,
    this.ext,
    this.isPostfix,
    this.value,
  });

  /// Parses a [Assign] from JSON, validating as it goes.
  factory Assign.fromJson(Object? value, [String path = 'Assign']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Assign') {
      throw UirParseError('$path.kind', 'expected "logic.Assign", got "$kind"');
    }
    return Assign(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isPostfix: json['isPostfix'] == null ? null : _asBool(json['isPostfix'], '$path.isPostfix'),
      operator: AssignmentOperator.fromJson(_req(json, 'operator', path), '$path.operator'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      target: Expr.fromJson(_req(json, 'target', path), '$path.target'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
      value: json['value'] == null ? null : Expr.fromJson(json['value'], '$path.value'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// For `increment`/`decrement`: whether the operator followed its target (`i++`) rather than preceded it (`++i`). The two differ only when the expression's value is consumed — `list[i++]` — but they do differ, and dropping the distinction would silently generate the wrong index.
  final bool? isPostfix;

  /// How the value combines with the target.
  final AssignmentOperator operator;

  /// Where the node came from.
  final SourceSpan span;

  /// The place written to — a `Ref`, a `PropertyAccess`, or an index. It is an lvalue, which is why this cannot be a `Binary`: `Binary.left` is a value, and a generator reading one as the other emits a comparison where a write was meant.
  final Expr target;

  /// Resolved type of the expression — the value written. Required, because every other member of the `Expr` union requires it and a consumer may rely on that.
  final TypeRef type;

  /// The value assigned. Absent for `increment` and `decrement`, which have no operand.
  final Expr? value;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Assign';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'isPostfix': isPostfix,
    'kind': 'logic.Assign',
    'operator': operator.toJson(),
    'span': span.toJson(),
    'target': target.toJson(),
    'type': type.toJson(),
    'value': value?.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Assign copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isPostfix,
    AssignmentOperator? operator,
    SourceSpan? span,
    Expr? target,
    TypeRef? type,
    Expr? value,
  }) {
    return Assign(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isPostfix: isPostfix ?? this.isPostfix,
      operator: operator ?? this.operator,
      span: span ?? this.span,
      target: target ?? this.target,
      type: type ?? this.type,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitAssign(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Assign &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isPostfix, isPostfix) &&
        _equality.equals(other.operator, operator) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.target, target) &&
        _equality.equals(other.type, type) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Assign',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isPostfix),
    _equality.hash(operator),
    _equality.hash(span),
    _equality.hash(target),
    _equality.hash(type),
    _equality.hash(value),
  ]);
}

/// An `await` expression.
@immutable
final class Await extends Expr {
  /// Creates a [Await].
  const Await({
    required this.id,
    required this.operand,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [Await] from JSON, validating as it goes.
  factory Await.fromJson(Object? value, [String path = 'Await']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Await') {
      throw UirParseError('$path.kind', 'expected "logic.Await", got "$kind"');
    }
    return Await(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      operand: Expr.fromJson(_req(json, 'operand', path), '$path.operand'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The awaited expression.
  final Expr operand;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Await';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Await',
    'operand': operand.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Await copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? operand,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Await(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      operand: operand ?? this.operand,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitAwait(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Await &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.operand, operand) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Await',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(operand),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A binary operation, e.g. `a + b`.
@immutable
final class Binary extends Expr {
  /// Creates a [Binary].
  const Binary({
    required this.id,
    required this.left,
    required this.operator,
    required this.right,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [Binary] from JSON, validating as it goes.
  factory Binary.fromJson(Object? value, [String path = 'Binary']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Binary') {
      throw UirParseError('$path.kind', 'expected "logic.Binary", got "$kind"');
    }
    return Binary(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      left: Expr.fromJson(_req(json, 'left', path), '$path.left'),
      operator: _asString(_req(json, 'operator', path), '$path.operator'),
      right: Expr.fromJson(_req(json, 'right', path), '$path.right'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Left operand.
  final Expr left;

  /// The operator, e.g. `+`.
  final String operator;

  /// Right operand.
  final Expr right;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Binary';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Binary',
    'left': left.toJson(),
    'operator': operator,
    'right': right.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Binary copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? left,
    String? operator,
    Expr? right,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Binary(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      left: left ?? this.left,
      operator: operator ?? this.operator,
      right: right ?? this.right,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitBinary(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Binary &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.left, left) &&
        _equality.equals(other.operator, operator) &&
        _equality.equals(other.right, right) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Binary',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(left),
    _equality.hash(operator),
    _equality.hash(right),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A brace-delimited block.
@immutable
final class Block extends Stmt {
  /// Creates a [Block].
  const Block({
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.statements,
  });

  /// Parses a [Block] from JSON, validating as it goes.
  factory Block.fromJson(Object? value, [String path = 'Block']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Block') {
      throw UirParseError('$path.kind', 'expected "logic.Block", got "$kind"');
    }
    return Block(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      statements: json['statements'] == null ? null : _asList<Stmt>(json['statements'], '$path.statements', Stmt.fromJson),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// Statements, in order. Order is semantic.
  final List<Stmt>? statements;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Block';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Block',
    'span': span.toJson(),
    'statements': statements?.map((Stmt v) => v.toJson()).toList(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Block copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    List<Stmt>? statements,
  }) {
    return Block(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      statements: statements ?? this.statements,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitBlock(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Block &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.statements, statements);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Block',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(statements),
  ]);
}

/// A break statement.
@immutable
final class Break extends Stmt {
  /// Creates a [Break].
  const Break({
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.label,
  });

  /// Parses a [Break] from JSON, validating as it goes.
  factory Break.fromJson(Object? value, [String path = 'Break']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Break') {
      throw UirParseError('$path.kind', 'expected "logic.Break", got "$kind"');
    }
    return Break(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      label: json['label'] == null ? null : _asString(json['label'], '$path.label'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The target label, if any.
  final String? label;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Break';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Break',
    'label': label,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Break copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? label,
    SourceSpan? span,
  }) {
    return Break(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      label: label ?? this.label,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitBreak(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Break &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.label, label) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Break',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(label),
    _equality.hash(span),
  ]);
}

/// A call to a function.
@immutable
final class Call extends Expr {
  /// Creates a [Call].
  const Call({
    required this.callee,
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.args,
    this.ext,
    this.namedArgs,
  });

  /// Parses a [Call] from JSON, validating as it goes.
  factory Call.fromJson(Object? value, [String path = 'Call']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Call') {
      throw UirParseError('$path.kind', 'expected "logic.Call", got "$kind"');
    }
    return Call(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      args: json['args'] == null ? null : _asList<Expr>(json['args'], '$path.args', Expr.fromJson),
      callee: Expr.fromJson(_req(json, 'callee', path), '$path.callee'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      namedArgs: json['namedArgs'] == null ? null : _asMap<Expr>(json['namedArgs'], '$path.namedArgs', Expr.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Positional arguments, in order.
  final List<Expr>? args;

  /// The function called.
  final Expr callee;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Named arguments, keyed by parameter name.
  final Map<String, Expr>? namedArgs;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved return type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Call';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'args': args?.map((Expr v) => v.toJson()).toList(),
    'callee': callee.toJson(),
    'ext': ext,
    'id': id,
    'kind': 'logic.Call',
    'namedArgs': namedArgs?.map((String k, Expr v) => MapEntry<String, Object?>(k, v.toJson())),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Call copyWith({
    Anchor? anchor,
    List<Expr>? args,
    Expr? callee,
    Map<String, Object?>? ext,
    NodeId? id,
    Map<String, Expr>? namedArgs,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Call(
      anchor: anchor ?? this.anchor,
      args: args ?? this.args,
      callee: callee ?? this.callee,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      namedArgs: namedArgs ?? this.namedArgs,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitCall(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Call &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.args, args) &&
        _equality.equals(other.callee, callee) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.namedArgs, namedArgs) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Call',
    _equality.hash(anchor),
    _equality.hash(args),
    _equality.hash(callee),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(namedArgs),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// An `as` cast.
@immutable
final class Cast extends Expr {
  /// Creates a [Cast].
  const Cast({
    required this.id,
    required this.operand,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [Cast] from JSON, validating as it goes.
  factory Cast.fromJson(Object? value, [String path = 'Cast']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Cast') {
      throw UirParseError('$path.kind', 'expected "logic.Cast", got "$kind"');
    }
    return Cast(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      operand: Expr.fromJson(_req(json, 'operand', path), '$path.operand'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The value cast.
  final Expr operand;

  /// Where the node came from.
  final SourceSpan span;

  /// The target type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Cast';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Cast',
    'operand': operand.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Cast copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? operand,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Cast(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      operand: operand ?? this.operand,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitCast(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Cast &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.operand, operand) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Cast',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(operand),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A class declaration.
@immutable
final class ClassDecl extends Decl {
  /// Creates a [ClassDecl].
  const ClassDecl({
    required this.id,
    required this.name,
    required this.span,
    this.anchor,
    this.ext,
    this.fields,
    this.methods,
    this.superclass,
  });

  /// Parses a [ClassDecl] from JSON, validating as it goes.
  factory ClassDecl.fromJson(Object? value, [String path = 'ClassDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.ClassDecl') {
      throw UirParseError('$path.kind', 'expected "logic.ClassDecl", got "$kind"');
    }
    return ClassDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      fields: json['fields'] == null ? null : _asList<FieldDecl>(json['fields'], '$path.fields', FieldDecl.fromJson),
      id: _asString(_req(json, 'id', path), '$path.id'),
      methods: json['methods'] == null ? null : _asList<FunctionDecl>(json['methods'], '$path.methods', FunctionDecl.fromJson),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      superclass: json['superclass'] == null ? null : TypeRef.fromJson(json['superclass'], '$path.superclass'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// Fields, in declaration order.
  final List<FieldDecl>? fields;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Methods, in declaration order.
  final List<FunctionDecl>? methods;

  /// Class name.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// The superclass, if any.
  final TypeRef? superclass;

  /// The node's discriminant.
  @override
  String get kind => 'logic.ClassDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'fields': fields?.map((FieldDecl v) => v.toJson()).toList(),
    'id': id,
    'kind': 'logic.ClassDecl',
    'methods': methods?.map((FunctionDecl v) => v.toJson()).toList(),
    'name': name,
    'span': span.toJson(),
    'superclass': superclass?.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ClassDecl copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    List<FieldDecl>? fields,
    NodeId? id,
    List<FunctionDecl>? methods,
    String? name,
    SourceSpan? span,
    TypeRef? superclass,
  }) {
    return ClassDecl(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      fields: fields ?? this.fields,
      id: id ?? this.id,
      methods: methods ?? this.methods,
      name: name ?? this.name,
      span: span ?? this.span,
      superclass: superclass ?? this.superclass,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitClassDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ClassDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.fields, fields) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.methods, methods) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.superclass, superclass);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ClassDecl',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(fields),
    _equality.hash(id),
    _equality.hash(methods),
    _equality.hash(name),
    _equality.hash(span),
    _equality.hash(superclass),
  ]);
}

/// A widget the application declares — a screen or a reusable widget.
///
/// This is what the compiler *generates*; it is never a construct to be mapped.
@immutable
final class Component extends UirNode {
  /// Creates a [Component].
  const Component({
    required this.id,
    required this.name,
    required this.render,
    required this.span,
    this.anchor,
    this.ext,
    this.localSignals,
    this.params,
    this.semantics,
  });

  /// Parses a [Component] from JSON, validating as it goes.
  factory Component.fromJson(Object? value, [String path = 'Component']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Component') {
      throw UirParseError('$path.kind', 'expected "ui.Component", got "$kind"');
    }
    return Component(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      localSignals: json['localSignals'] == null ? null : _asList<NodeId>(json['localSignals'], '$path.localSignals', _asString),
      name: _asString(_req(json, 'name', path), '$path.name'),
      params: json['params'] == null ? null : _asList<ParamDecl>(json['params'], '$path.params', ParamDecl.fromJson),
      render: UiNode.fromJson(_req(json, 'render', path), '$path.render'),
      semantics: json['semantics'] == null ? null : SemanticsInfo.fromJson(json['semantics'], '$path.semantics'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Component-scoped signals — the State fields (Spec §2.3).
  final List<NodeId>? localSignals;

  /// The component name, e.g. `LoginScreen`.
  final String name;

  /// Constructor parameters, in order.
  final List<ParamDecl>? params;

  /// The render tree.
  final UiNode render;

  /// Semantics for the component root, if any.
  final SemanticsInfo? semantics;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Component';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'ui.Component',
    'localSignals': localSignals,
    'name': name,
    'params': params?.map((ParamDecl v) => v.toJson()).toList(),
    'render': render.toJson(),
    'semantics': semantics?.toJson(),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Component copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    List<NodeId>? localSignals,
    String? name,
    List<ParamDecl>? params,
    UiNode? render,
    SemanticsInfo? semantics,
    SourceSpan? span,
  }) {
    return Component(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      localSignals: localSignals ?? this.localSignals,
      name: name ?? this.name,
      params: params ?? this.params,
      render: render ?? this.render,
      semantics: semantics ?? this.semantics,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Component &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.localSignals, localSignals) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.params, params) &&
        _equality.equals(other.render, render) &&
        _equality.equals(other.semantics, semantics) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Component',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(localSignals),
    _equality.hash(name),
    _equality.hash(params),
    _equality.hash(render),
    _equality.hash(semantics),
    _equality.hash(span),
  ]);
}

/// A ternary conditional, e.g. `a ? b : c`.
@immutable
final class Conditional extends Expr {
  /// Creates a [Conditional].
  const Conditional({
    required this.id,
    required this.otherwise,
    required this.span,
    required this.test,
    required this.then,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [Conditional] from JSON, validating as it goes.
  factory Conditional.fromJson(Object? value, [String path = 'Conditional']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Conditional') {
      throw UirParseError('$path.kind', 'expected "logic.Conditional", got "$kind"');
    }
    return Conditional(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      otherwise: Expr.fromJson(_req(json, 'otherwise', path), '$path.otherwise'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      test: Expr.fromJson(_req(json, 'test', path), '$path.test'),
      then: Expr.fromJson(_req(json, 'then', path), '$path.then'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Value when false.
  final Expr otherwise;

  /// Where the node came from.
  final SourceSpan span;

  /// The condition.
  final Expr test;

  /// Value when true.
  final Expr then;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Conditional';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Conditional',
    'otherwise': otherwise.toJson(),
    'span': span.toJson(),
    'test': test.toJson(),
    'then': then.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Conditional copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? otherwise,
    SourceSpan? span,
    Expr? test,
    Expr? then,
    TypeRef? type,
  }) {
    return Conditional(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      otherwise: otherwise ?? this.otherwise,
      span: span ?? this.span,
      test: test ?? this.test,
      then: then ?? this.then,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitConditional(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Conditional &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.otherwise, otherwise) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.test, test) &&
        _equality.equals(other.then, then) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Conditional',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(otherwise),
    _equality.hash(span),
    _equality.hash(test),
    _equality.hash(then),
    _equality.hash(type),
  ]);
}

/// A constant value. Nothing reactive reads it.
@immutable
final class ConstBinding extends Binding {
  /// Creates a [ConstBinding].
  const ConstBinding({
    required this.id,
    required this.span,
    required this.value,
    this.anchor,
    this.ext,
  });

  /// Parses a [ConstBinding] from JSON, validating as it goes.
  factory ConstBinding.fromJson(Object? value, [String path = 'ConstBinding']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'bind.Const') {
      throw UirParseError('$path.kind', 'expected "bind.Const", got "$kind"');
    }
    return ConstBinding(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      value: _req(json, 'value', path),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The constant.
  final Object? value;

  /// The node's discriminant.
  @override
  String get kind => 'bind.Const';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'bind.Const',
    'span': span.toJson(),
    'value': value,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ConstBinding copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    Object? value,
  }) {
    return ConstBinding(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(BindingVisitor<R> visitor) => visitor.visitConstBinding(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ConstBinding &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ConstBinding',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(value),
  ]);
}

/// A continue statement.
@immutable
final class Continue extends Stmt {
  /// Creates a [Continue].
  const Continue({
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.label,
  });

  /// Parses a [Continue] from JSON, validating as it goes.
  factory Continue.fromJson(Object? value, [String path = 'Continue']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Continue') {
      throw UirParseError('$path.kind', 'expected "logic.Continue", got "$kind"');
    }
    return Continue(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      label: json['label'] == null ? null : _asString(json['label'], '$path.label'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The target label, if any.
  final String? label;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Continue';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Continue',
    'label': label,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Continue copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? label,
    SourceSpan? span,
  }) {
    return Continue(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      label: label ?? this.label,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitContinue(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Continue &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.label, label) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Continue',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(label),
    _equality.hash(span),
  ]);
}

/// A value computed from other signals — a Flutter getter over state.
@immutable
final class Derived extends UirNode {
  /// Creates a [Derived].
  const Derived({
    required this.body,
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.deps,
    this.ext,
  });

  /// Parses a [Derived] from JSON, validating as it goes.
  factory Derived.fromJson(Object? value, [String path = 'Derived']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'sig.Derived') {
      throw UirParseError('$path.kind', 'expected "sig.Derived", got "$kind"');
    }
    return Derived(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: Expr.fromJson(_req(json, 'body', path), '$path.body'),
      deps: json['deps'] == null ? null : _asList<NodeId>(json['deps'], '$path.deps', _asString),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The computation.
  final Expr body;

  /// The signals it reads.
  final List<NodeId>? deps;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'sig.Derived';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body.toJson(),
    'deps': deps,
    'ext': ext,
    'id': id,
    'kind': 'sig.Derived',
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Derived copyWith({
    Anchor? anchor,
    Expr? body,
    List<NodeId>? deps,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Derived(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      deps: deps ?? this.deps,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Derived &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.deps, deps) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Derived',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(deps),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A side effect tied to a component's lifecycle.
@immutable
final class Effect extends UirNode {
  /// Creates a [Effect].
  const Effect({
    required this.id,
    required this.span,
    required this.timing,
    this.anchor,
    this.body,
    this.deps,
    this.ext,
  });

  /// Parses a [Effect] from JSON, validating as it goes.
  factory Effect.fromJson(Object? value, [String path = 'Effect']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'sig.Effect') {
      throw UirParseError('$path.kind', 'expected "sig.Effect", got "$kind"');
    }
    return Effect(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: json['body'] == null ? null : _asList<Stmt>(json['body'], '$path.body', Stmt.fromJson),
      deps: json['deps'] == null ? null : _asList<NodeId>(json['deps'], '$path.deps', _asString),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      timing: EffectTiming.fromJson(_req(json, 'timing', path), '$path.timing'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The effect body, in order.
  final List<Stmt>? body;

  /// The signals it depends on.
  final List<NodeId>? deps;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// When it runs.
  final EffectTiming timing;

  /// The node's discriminant.
  @override
  String get kind => 'sig.Effect';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body?.map((Stmt v) => v.toJson()).toList(),
    'deps': deps,
    'ext': ext,
    'id': id,
    'kind': 'sig.Effect',
    'span': span.toJson(),
    'timing': timing.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Effect copyWith({
    Anchor? anchor,
    List<Stmt>? body,
    List<NodeId>? deps,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    EffectTiming? timing,
  }) {
    return Effect(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      deps: deps ?? this.deps,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      timing: timing ?? this.timing,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Effect &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.deps, deps) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.timing, timing);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Effect',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(deps),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(timing),
  ]);
}

/// A network call the application makes.
@immutable
final class Endpoint extends UirNode {
  /// Creates a [Endpoint].
  const Endpoint({
    required this.id,
    required this.method,
    required this.path,
    required this.response,
    required this.span,
    this.anchor,
    this.ext,
    this.request,
  });

  /// Parses a [Endpoint] from JSON, validating as it goes.
  factory Endpoint.fromJson(Object? value, [String path = 'Endpoint']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'app.Endpoint') {
      throw UirParseError('$path.kind', 'expected "app.Endpoint", got "$kind"');
    }
    return Endpoint(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      method: HttpMethod.fromJson(_req(json, 'method', path), '$path.method'),
      path: _asString(_req(json, 'path', path), '$path.path'),
      request: json['request'] == null ? null : TypeRef.fromJson(json['request'], '$path.request'),
      response: TypeRef.fromJson(_req(json, 'response', path), '$path.response'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The HTTP method.
  final HttpMethod method;

  /// The request path.
  final String path;

  /// The request body type, if any.
  final TypeRef? request;

  /// The response type.
  final TypeRef response;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'app.Endpoint';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'app.Endpoint',
    'method': method.toJson(),
    'path': path,
    'request': request?.toJson(),
    'response': response.toJson(),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Endpoint copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    HttpMethod? method,
    String? path,
    TypeRef? request,
    TypeRef? response,
    SourceSpan? span,
  }) {
    return Endpoint(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      method: method ?? this.method,
      path: path ?? this.path,
      request: request ?? this.request,
      response: response ?? this.response,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Endpoint &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.method, method) &&
        _equality.equals(other.path, path) &&
        _equality.equals(other.request, request) &&
        _equality.equals(other.response, response) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Endpoint',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(method),
    _equality.hash(path),
    _equality.hash(request),
    _equality.hash(response),
    _equality.hash(span),
  ]);
}

/// An enum declaration.
@immutable
final class EnumDecl extends Decl {
  /// Creates a [EnumDecl].
  const EnumDecl({
    required this.id,
    required this.name,
    required this.span,
    this.anchor,
    this.ext,
    this.values,
  });

  /// Parses a [EnumDecl] from JSON, validating as it goes.
  factory EnumDecl.fromJson(Object? value, [String path = 'EnumDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.EnumDecl') {
      throw UirParseError('$path.kind', 'expected "logic.EnumDecl", got "$kind"');
    }
    return EnumDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      values: json['values'] == null ? null : _asList<String>(json['values'], '$path.values', _asString),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Enum name.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// Values, in declaration order.
  final List<String>? values;

  /// The node's discriminant.
  @override
  String get kind => 'logic.EnumDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.EnumDecl',
    'name': name,
    'span': span.toJson(),
    'values': values,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  EnumDecl copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? name,
    SourceSpan? span,
    List<String>? values,
  }) {
    return EnumDecl(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      name: name ?? this.name,
      span: span ?? this.span,
      values: values ?? this.values,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitEnumDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is EnumDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.values, values);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'EnumDecl',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(name),
    _equality.hash(span),
    _equality.hash(values),
  ]);
}

/// An arbitrary expression, e.g. a ternary or an event handler lambda.
@immutable
final class ExprBinding extends Binding {
  /// Creates a [ExprBinding].
  const ExprBinding({
    required this.expr,
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [ExprBinding] from JSON, validating as it goes.
  factory ExprBinding.fromJson(Object? value, [String path = 'ExprBinding']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'bind.Expr') {
      throw UirParseError('$path.kind', 'expected "bind.Expr", got "$kind"');
    }
    return ExprBinding(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      expr: Expr.fromJson(_req(json, 'expr', path), '$path.expr'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The expression.
  final Expr expr;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'bind.Expr';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'expr': expr.toJson(),
    'ext': ext,
    'id': id,
    'kind': 'bind.Expr',
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ExprBinding copyWith({
    Anchor? anchor,
    Expr? expr,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
  }) {
    return ExprBinding(
      anchor: anchor ?? this.anchor,
      expr: expr ?? this.expr,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(BindingVisitor<R> visitor) => visitor.visitExprBinding(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ExprBinding &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.expr, expr) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ExprBinding',
    _equality.hash(anchor),
    _equality.hash(expr),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
  ]);
}

/// An expression evaluated for its effect.
@immutable
final class ExprStmt extends Stmt {
  /// Creates a [ExprStmt].
  const ExprStmt({
    required this.expr,
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [ExprStmt] from JSON, validating as it goes.
  factory ExprStmt.fromJson(Object? value, [String path = 'ExprStmt']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.ExprStmt') {
      throw UirParseError('$path.kind', 'expected "logic.ExprStmt", got "$kind"');
    }
    return ExprStmt(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      expr: Expr.fromJson(_req(json, 'expr', path), '$path.expr'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The expression.
  final Expr expr;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.ExprStmt';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'expr': expr.toJson(),
    'ext': ext,
    'id': id,
    'kind': 'logic.ExprStmt',
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ExprStmt copyWith({
    Anchor? anchor,
    Expr? expr,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
  }) {
    return ExprStmt(
      anchor: anchor ?? this.anchor,
      expr: expr ?? this.expr,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitExprStmt(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ExprStmt &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.expr, expr) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ExprStmt',
    _equality.hash(anchor),
    _equality.hash(expr),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
  ]);
}

/// A field declaration.
@immutable
final class FieldDecl extends Decl {
  /// Creates a [FieldDecl].
  const FieldDecl({
    required this.id,
    required this.name,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.initializer,
    this.isFinal,
    this.isStatic,
  });

  /// Parses a [FieldDecl] from JSON, validating as it goes.
  factory FieldDecl.fromJson(Object? value, [String path = 'FieldDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.FieldDecl') {
      throw UirParseError('$path.kind', 'expected "logic.FieldDecl", got "$kind"');
    }
    return FieldDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      initializer: json['initializer'] == null ? null : Expr.fromJson(json['initializer'], '$path.initializer'),
      isFinal: json['isFinal'] == null ? null : _asBool(json['isFinal'], '$path.isFinal'),
      isStatic: json['isStatic'] == null ? null : _asBool(json['isStatic'], '$path.isStatic'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The initializer, if any.
  final Expr? initializer;

  /// Whether the field is final.
  final bool? isFinal;

  /// Whether the field is static.
  final bool? isStatic;

  /// Field name.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.FieldDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'initializer': initializer?.toJson(),
    'isFinal': isFinal,
    'isStatic': isStatic,
    'kind': 'logic.FieldDecl',
    'name': name,
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  FieldDecl copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? initializer,
    bool? isFinal,
    bool? isStatic,
    String? name,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return FieldDecl(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      initializer: initializer ?? this.initializer,
      isFinal: isFinal ?? this.isFinal,
      isStatic: isStatic ?? this.isStatic,
      name: name ?? this.name,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitFieldDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is FieldDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.initializer, initializer) &&
        _equality.equals(other.isFinal, isFinal) &&
        _equality.equals(other.isStatic, isStatic) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'FieldDecl',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(initializer),
    _equality.hash(isFinal),
    _equality.hash(isStatic),
    _equality.hash(name),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A for or for-in loop.
@immutable
final class For extends Stmt {
  /// Creates a [For].
  const For({
    required this.body,
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.init,
    this.iterable,
    this.loopVariable,
    this.test,
    this.update,
  });

  /// Parses a [For] from JSON, validating as it goes.
  factory For.fromJson(Object? value, [String path = 'For']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.For') {
      throw UirParseError('$path.kind', 'expected "logic.For", got "$kind"');
    }
    return For(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: Stmt.fromJson(_req(json, 'body', path), '$path.body'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      init: json['init'] == null ? null : Stmt.fromJson(json['init'], '$path.init'),
      iterable: json['iterable'] == null ? null : Expr.fromJson(json['iterable'], '$path.iterable'),
      loopVariable: json['loopVariable'] == null ? null : _asString(json['loopVariable'], '$path.loopVariable'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      test: json['test'] == null ? null : Expr.fromJson(json['test'], '$path.test'),
      update: json['update'] == null ? null : _asList<Expr>(json['update'], '$path.update', Expr.fromJson),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The loop body.
  final Stmt body;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Initializer, for a C-style loop.
  final Stmt? init;

  /// The iterable, for a for-in loop.
  final Expr? iterable;

  /// The loop variable, for a for-in loop.
  final String? loopVariable;

  /// Where the node came from.
  final SourceSpan span;

  /// Loop condition.
  final Expr? test;

  /// Update expressions, in order.
  final List<Expr>? update;

  /// The node's discriminant.
  @override
  String get kind => 'logic.For';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body.toJson(),
    'ext': ext,
    'id': id,
    'init': init?.toJson(),
    'iterable': iterable?.toJson(),
    'kind': 'logic.For',
    'loopVariable': loopVariable,
    'span': span.toJson(),
    'test': test?.toJson(),
    'update': update?.map((Expr v) => v.toJson()).toList(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  For copyWith({
    Anchor? anchor,
    Stmt? body,
    Map<String, Object?>? ext,
    NodeId? id,
    Stmt? init,
    Expr? iterable,
    String? loopVariable,
    SourceSpan? span,
    Expr? test,
    List<Expr>? update,
  }) {
    return For(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      init: init ?? this.init,
      iterable: iterable ?? this.iterable,
      loopVariable: loopVariable ?? this.loopVariable,
      span: span ?? this.span,
      test: test ?? this.test,
      update: update ?? this.update,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitFor(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is For &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.init, init) &&
        _equality.equals(other.iterable, iterable) &&
        _equality.equals(other.loopVariable, loopVariable) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.test, test) &&
        _equality.equals(other.update, update);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'For',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(init),
    _equality.hash(iterable),
    _equality.hash(loopVariable),
    _equality.hash(span),
    _equality.hash(test),
    _equality.hash(update),
  ]);
}

/// A function or method declaration.
@immutable
final class FunctionDecl extends Decl {
  /// Creates a [FunctionDecl].
  const FunctionDecl({
    required this.id,
    required this.name,
    required this.returnType,
    required this.span,
    this.anchor,
    this.body,
    this.ext,
    this.isAsync,
    this.isStatic,
    this.params,
  });

  /// Parses a [FunctionDecl] from JSON, validating as it goes.
  factory FunctionDecl.fromJson(Object? value, [String path = 'FunctionDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.FunctionDecl') {
      throw UirParseError('$path.kind', 'expected "logic.FunctionDecl", got "$kind"');
    }
    return FunctionDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: json['body'] == null ? null : _asList<Stmt>(json['body'], '$path.body', Stmt.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isAsync: json['isAsync'] == null ? null : _asBool(json['isAsync'], '$path.isAsync'),
      isStatic: json['isStatic'] == null ? null : _asBool(json['isStatic'], '$path.isStatic'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      params: json['params'] == null ? null : _asList<ParamDecl>(json['params'], '$path.params', ParamDecl.fromJson),
      returnType: TypeRef.fromJson(_req(json, 'returnType', path), '$path.returnType'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Body, in order.
  final List<Stmt>? body;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Whether the function is async.
  final bool? isAsync;

  /// Whether the function is static.
  final bool? isStatic;

  /// Function name.
  final String name;

  /// Parameters, in order.
  final List<ParamDecl>? params;

  /// Resolved return type.
  final TypeRef returnType;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.FunctionDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body?.map((Stmt v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'isAsync': isAsync,
    'isStatic': isStatic,
    'kind': 'logic.FunctionDecl',
    'name': name,
    'params': params?.map((ParamDecl v) => v.toJson()).toList(),
    'returnType': returnType.toJson(),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  FunctionDecl copyWith({
    Anchor? anchor,
    List<Stmt>? body,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isAsync,
    bool? isStatic,
    String? name,
    List<ParamDecl>? params,
    TypeRef? returnType,
    SourceSpan? span,
  }) {
    return FunctionDecl(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isAsync: isAsync ?? this.isAsync,
      isStatic: isStatic ?? this.isStatic,
      name: name ?? this.name,
      params: params ?? this.params,
      returnType: returnType ?? this.returnType,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitFunctionDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is FunctionDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isAsync, isAsync) &&
        _equality.equals(other.isStatic, isStatic) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.params, params) &&
        _equality.equals(other.returnType, returnType) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'FunctionDecl',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isAsync),
    _equality.hash(isStatic),
    _equality.hash(name),
    _equality.hash(params),
    _equality.hash(returnType),
    _equality.hash(span),
  ]);
}

/// An if statement.
@immutable
final class If extends Stmt {
  /// Creates a [If].
  const If({
    required this.id,
    required this.span,
    required this.test,
    required this.then,
    this.anchor,
    this.ext,
    this.otherwise,
  });

  /// Parses a [If] from JSON, validating as it goes.
  factory If.fromJson(Object? value, [String path = 'If']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.If') {
      throw UirParseError('$path.kind', 'expected "logic.If", got "$kind"');
    }
    return If(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      otherwise: json['otherwise'] == null ? null : Stmt.fromJson(json['otherwise'], '$path.otherwise'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      test: Expr.fromJson(_req(json, 'test', path), '$path.test'),
      then: Stmt.fromJson(_req(json, 'then', path), '$path.then'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The else branch, if any.
  final Stmt? otherwise;

  /// Where the node came from.
  final SourceSpan span;

  /// The condition.
  final Expr test;

  /// The then branch.
  final Stmt then;

  /// The node's discriminant.
  @override
  String get kind => 'logic.If';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.If',
    'otherwise': otherwise?.toJson(),
    'span': span.toJson(),
    'test': test.toJson(),
    'then': then.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  If copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Stmt? otherwise,
    SourceSpan? span,
    Expr? test,
    Stmt? then,
  }) {
    return If(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      otherwise: otherwise ?? this.otherwise,
      span: span ?? this.span,
      test: test ?? this.test,
      then: then ?? this.then,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitIf(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is If &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.otherwise, otherwise) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.test, test) &&
        _equality.equals(other.then, then);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'If',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(otherwise),
    _equality.hash(span),
    _equality.hash(test),
    _equality.hash(then),
  ]);
}

/// An anonymous function.
@immutable
final class Lambda extends Expr {
  /// Creates a [Lambda].
  const Lambda({
    required this.body,
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.isAsync,
    this.params,
  });

  /// Parses a [Lambda] from JSON, validating as it goes.
  factory Lambda.fromJson(Object? value, [String path = 'Lambda']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Lambda') {
      throw UirParseError('$path.kind', 'expected "logic.Lambda", got "$kind"');
    }
    return Lambda(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: _asList<Stmt>(_req(json, 'body', path), '$path.body', Stmt.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isAsync: json['isAsync'] == null ? null : _asBool(json['isAsync'], '$path.isAsync'),
      params: json['params'] == null ? null : _asList<ParamDecl>(json['params'], '$path.params', ParamDecl.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Body, in order.
  final List<Stmt> body;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Whether the lambda is async.
  final bool? isAsync;

  /// Parameters, in order.
  final List<ParamDecl>? params;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved function type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Lambda';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body.map((Stmt v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'isAsync': isAsync,
    'kind': 'logic.Lambda',
    'params': params?.map((ParamDecl v) => v.toJson()).toList(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Lambda copyWith({
    Anchor? anchor,
    List<Stmt>? body,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isAsync,
    List<ParamDecl>? params,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Lambda(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isAsync: isAsync ?? this.isAsync,
      params: params ?? this.params,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitLambda(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Lambda &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isAsync, isAsync) &&
        _equality.equals(other.params, params) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Lambda',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isAsync),
    _equality.hash(params),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A list literal.
@immutable
final class ListLit extends Expr {
  /// Creates a [ListLit].
  const ListLit({
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.elements,
    this.ext,
  });

  /// Parses a [ListLit] from JSON, validating as it goes.
  factory ListLit.fromJson(Object? value, [String path = 'ListLit']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.ListLit') {
      throw UirParseError('$path.kind', 'expected "logic.ListLit", got "$kind"');
    }
    return ListLit(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      elements: json['elements'] == null ? null : _asList<Expr>(json['elements'], '$path.elements', Expr.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Elements, in order. Order is semantic.
  final List<Expr>? elements;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.ListLit';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'elements': elements?.map((Expr v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'kind': 'logic.ListLit',
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ListLit copyWith({
    Anchor? anchor,
    List<Expr>? elements,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return ListLit(
      anchor: anchor ?? this.anchor,
      elements: elements ?? this.elements,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitListLit(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ListLit &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.elements, elements) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ListLit',
    _equality.hash(anchor),
    _equality.hash(elements),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A literal: a number, string, boolean, or null.
@immutable
final class Lit extends Expr {
  /// Creates a [Lit].
  const Lit({
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.value,
  });

  /// Parses a [Lit] from JSON, validating as it goes.
  factory Lit.fromJson(Object? value, [String path = 'Lit']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Lit') {
      throw UirParseError('$path.kind', 'expected "logic.Lit", got "$kind"');
    }
    return Lit(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
      value: json['value'] == null ? null : json['value'],
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The literal value.
  final Object? value;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Lit';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Lit',
    'span': span.toJson(),
    'type': type.toJson(),
    'value': value,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Lit copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    TypeRef? type,
    Object? value,
  }) {
    return Lit(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      type: type ?? this.type,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitLit(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Lit &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Lit',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(type),
    _equality.hash(value),
  ]);
}

/// A map literal.
@immutable
final class MapLit extends Expr {
  /// Creates a [MapLit].
  const MapLit({
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.keys,
    this.values,
  });

  /// Parses a [MapLit] from JSON, validating as it goes.
  factory MapLit.fromJson(Object? value, [String path = 'MapLit']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.MapLit') {
      throw UirParseError('$path.kind', 'expected "logic.MapLit", got "$kind"');
    }
    return MapLit(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      keys: json['keys'] == null ? null : _asList<Expr>(json['keys'], '$path.keys', Expr.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
      values: json['values'] == null ? null : _asList<Expr>(json['values'], '$path.values', Expr.fromJson),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Keys, in order, paired positionally with `values`.
  final List<Expr>? keys;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// Values, in order, paired positionally with `keys`.
  final List<Expr>? values;

  /// The node's discriminant.
  @override
  String get kind => 'logic.MapLit';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'keys': keys?.map((Expr v) => v.toJson()).toList(),
    'kind': 'logic.MapLit',
    'span': span.toJson(),
    'type': type.toJson(),
    'values': values?.map((Expr v) => v.toJson()).toList(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  MapLit copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    List<Expr>? keys,
    SourceSpan? span,
    TypeRef? type,
    List<Expr>? values,
  }) {
    return MapLit(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      keys: keys ?? this.keys,
      span: span ?? this.span,
      type: type ?? this.type,
      values: values ?? this.values,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitMapLit(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is MapLit &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.keys, keys) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type) &&
        _equality.equals(other.values, values);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'MapLit',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(keys),
    _equality.hash(span),
    _equality.hash(type),
    _equality.hash(values),
  ]);
}

/// A call to a method on a receiver.
@immutable
final class MethodCall extends Expr {
  /// Creates a [MethodCall].
  const MethodCall({
    required this.id,
    required this.method,
    required this.receiver,
    required this.span,
    required this.type,
    this.anchor,
    this.args,
    this.ext,
    this.namedArgs,
  });

  /// Parses a [MethodCall] from JSON, validating as it goes.
  factory MethodCall.fromJson(Object? value, [String path = 'MethodCall']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.MethodCall') {
      throw UirParseError('$path.kind', 'expected "logic.MethodCall", got "$kind"');
    }
    return MethodCall(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      args: json['args'] == null ? null : _asList<Expr>(json['args'], '$path.args', Expr.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      method: _asString(_req(json, 'method', path), '$path.method'),
      namedArgs: json['namedArgs'] == null ? null : _asMap<Expr>(json['namedArgs'], '$path.namedArgs', Expr.fromJson),
      receiver: Expr.fromJson(_req(json, 'receiver', path), '$path.receiver'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Positional arguments, in order.
  final List<Expr>? args;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The method name.
  final String method;

  /// Named arguments.
  final Map<String, Expr>? namedArgs;

  /// The receiver.
  final Expr receiver;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved return type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.MethodCall';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'args': args?.map((Expr v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'kind': 'logic.MethodCall',
    'method': method,
    'namedArgs': namedArgs?.map((String k, Expr v) => MapEntry<String, Object?>(k, v.toJson())),
    'receiver': receiver.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  MethodCall copyWith({
    Anchor? anchor,
    List<Expr>? args,
    Map<String, Object?>? ext,
    NodeId? id,
    String? method,
    Map<String, Expr>? namedArgs,
    Expr? receiver,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return MethodCall(
      anchor: anchor ?? this.anchor,
      args: args ?? this.args,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      method: method ?? this.method,
      namedArgs: namedArgs ?? this.namedArgs,
      receiver: receiver ?? this.receiver,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitMethodCall(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is MethodCall &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.args, args) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.method, method) &&
        _equality.equals(other.namedArgs, namedArgs) &&
        _equality.equals(other.receiver, receiver) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'MethodCall',
    _equality.hash(anchor),
    _equality.hash(args),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(method),
    _equality.hash(namedArgs),
    _equality.hash(receiver),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// Performing a navigation — a push, a pop, or the opening of a route overlay (ADR-0025 D2).
///
/// `app.RouteTransition` is a *declarative edge in the navigation graph*; it is the input to N11 (ADR-11) and says where an application **can** go. It does not say where it **does** go, and nothing else did either: a `Navigator.pushNamed` survived extraction as an ordinary call to an unresolvable name, in violation of INV-22, and the generator had a route table, a live router and a call it could not connect to either.
///
/// This is that connection, and it is a **statement** rather than a field on the edge for one measured reason: a pop has no edge. Spec v2.4 §A17.3 rules that a pop returns along an edge that already exists rather than creating one, and the M6-D corpus measured pops as the most frequent navigation verb in real Flutter — 143 uses against 83 pushes. A `site` field on `app.RouteTransition` could not have expressed one.
///
/// **Scope.** The result of a navigation is not modelled: this node is evaluated for effect. `final ok = await showDialog<bool>(...)` — 19 measured sites — is still refused, because a statement carries no value. See `docs/m7/m7a-navigation-implementation.md`.
@immutable
final class Navigate extends Stmt {
  /// Creates a [Navigate].
  const Navigate({
    required this.action,
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.transition,
  });

  /// Parses a [Navigate] from JSON, validating as it goes.
  factory Navigate.fromJson(Object? value, [String path = 'Navigate']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Navigate') {
      throw UirParseError('$path.kind', 'expected "logic.Navigate", got "$kind"');
    }
    return Navigate(
      action: NavigateAction.fromJson(_req(json, 'action', path), '$path.action'),
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      transition: json['transition'] == null ? null : _asString(json['transition'], '$path.transition'),
    );
  }

  /// What the navigation does.
  final NavigateAction action;

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The `app.RouteTransition` this performs, for a departure.
  ///
  /// **Absent for a return** (`pop`, `popUntil`, `maybePop`): §A17.3 rules that a pop is not a transition, so there is no edge to name. A reader must not treat its absence as an incomplete document — `action` says which case it is.
  final NodeId? transition;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Navigate';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'action': action.toJson(),
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Navigate',
    'span': span.toJson(),
    'transition': transition,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Navigate copyWith({
    NavigateAction? action,
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    NodeId? transition,
  }) {
    return Navigate(
      action: action ?? this.action,
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      transition: transition ?? this.transition,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitNavigate(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Navigate &&
        _equality.equals(other.action, action) &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.transition, transition);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Navigate',
    _equality.hash(action),
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(transition),
  ]);
}

/// A constructor invocation.
@immutable
final class New extends Expr {
  /// Creates a [New].
  const New({
    required this.id,
    required this.span,
    required this.type,
    required this.typeName,
    this.anchor,
    this.args,
    this.constructorName,
    this.ext,
    this.isConst,
    this.namedArgs,
  });

  /// Parses a [New] from JSON, validating as it goes.
  factory New.fromJson(Object? value, [String path = 'New']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.New') {
      throw UirParseError('$path.kind', 'expected "logic.New", got "$kind"');
    }
    return New(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      args: json['args'] == null ? null : _asList<Expr>(json['args'], '$path.args', Expr.fromJson),
      constructorName: json['constructorName'] == null ? null : _asString(json['constructorName'], '$path.constructorName'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isConst: json['isConst'] == null ? null : _asBool(json['isConst'], '$path.isConst'),
      namedArgs: json['namedArgs'] == null ? null : _asMap<Expr>(json['namedArgs'], '$path.namedArgs', Expr.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
      typeName: _asString(_req(json, 'typeName', path), '$path.typeName'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Positional arguments, in order.
  final List<Expr>? args;

  /// The named constructor, if any.
  final String? constructorName;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Whether the construction is const — the input to const folding (pass N6).
  final bool? isConst;

  /// Named arguments.
  final Map<String, Expr>? namedArgs;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The class constructed.
  final String typeName;

  /// The node's discriminant.
  @override
  String get kind => 'logic.New';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'args': args?.map((Expr v) => v.toJson()).toList(),
    'constructorName': constructorName,
    'ext': ext,
    'id': id,
    'isConst': isConst,
    'kind': 'logic.New',
    'namedArgs': namedArgs?.map((String k, Expr v) => MapEntry<String, Object?>(k, v.toJson())),
    'span': span.toJson(),
    'type': type.toJson(),
    'typeName': typeName,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  New copyWith({
    Anchor? anchor,
    List<Expr>? args,
    String? constructorName,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isConst,
    Map<String, Expr>? namedArgs,
    SourceSpan? span,
    TypeRef? type,
    String? typeName,
  }) {
    return New(
      anchor: anchor ?? this.anchor,
      args: args ?? this.args,
      constructorName: constructorName ?? this.constructorName,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isConst: isConst ?? this.isConst,
      namedArgs: namedArgs ?? this.namedArgs,
      span: span ?? this.span,
      type: type ?? this.type,
      typeName: typeName ?? this.typeName,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitNew(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is New &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.args, args) &&
        _equality.equals(other.constructorName, constructorName) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isConst, isConst) &&
        _equality.equals(other.namedArgs, namedArgs) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type) &&
        _equality.equals(other.typeName, typeName);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'New',
    _equality.hash(anchor),
    _equality.hash(args),
    _equality.hash(constructorName),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isConst),
    _equality.hash(namedArgs),
    _equality.hash(span),
    _equality.hash(type),
    _equality.hash(typeName),
  ]);
}

/// A null-aware operation, e.g. `a ?? b` or `a?.b`.
@immutable
final class NullCheck extends Expr {
  /// Creates a [NullCheck].
  const NullCheck({
    required this.id,
    required this.operand,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.fallback,
  });

  /// Parses a [NullCheck] from JSON, validating as it goes.
  factory NullCheck.fromJson(Object? value, [String path = 'NullCheck']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.NullCheck') {
      throw UirParseError('$path.kind', 'expected "logic.NullCheck", got "$kind"');
    }
    return NullCheck(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      fallback: json['fallback'] == null ? null : Expr.fromJson(json['fallback'], '$path.fallback'),
      id: _asString(_req(json, 'id', path), '$path.id'),
      operand: Expr.fromJson(_req(json, 'operand', path), '$path.operand'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The fallback, for `??`.
  final Expr? fallback;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The operand.
  final Expr operand;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.NullCheck';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'fallback': fallback?.toJson(),
    'id': id,
    'kind': 'logic.NullCheck',
    'operand': operand.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  NullCheck copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    Expr? fallback,
    NodeId? id,
    Expr? operand,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return NullCheck(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      fallback: fallback ?? this.fallback,
      id: id ?? this.id,
      operand: operand ?? this.operand,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitNullCheck(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is NullCheck &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.fallback, fallback) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.operand, operand) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'NullCheck',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(fallback),
    _equality.hash(id),
    _equality.hash(operand),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A declaration the extractor cannot model — a mixin, an extension. Preserved rather than dropped (INV-4).
///
/// Added in v2.2 (§A11). The `Decl` union previously had no opaque variant, unlike `Expr` and `Stmt`, so an unmodellable declaration had nowhere to go and would have had to be silently discarded. compass_app declares 11 mixins; wonderous declares 5 extensions.
@immutable
final class OpaqueDecl extends Decl {
  /// Creates a [OpaqueDecl].
  const OpaqueDecl({
    required this.dartSource,
    required this.id,
    required this.reason,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [OpaqueDecl] from JSON, validating as it goes.
  factory OpaqueDecl.fromJson(Object? value, [String path = 'OpaqueDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.OpaqueDecl') {
      throw UirParseError('$path.kind', 'expected "logic.OpaqueDecl", got "$kind"');
    }
    return OpaqueDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      dartSource: _asString(_req(json, 'dartSource', path), '$path.dartSource'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      reason: _asString(_req(json, 'reason', path), '$path.reason'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The original Dart source.
  final String dartSource;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Why it could not be modeled.
  final String reason;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.OpaqueDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'dartSource': dartSource,
    'ext': ext,
    'id': id,
    'kind': 'logic.OpaqueDecl',
    'reason': reason,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  OpaqueDecl copyWith({
    Anchor? anchor,
    String? dartSource,
    Map<String, Object?>? ext,
    NodeId? id,
    String? reason,
    SourceSpan? span,
  }) {
    return OpaqueDecl(
      anchor: anchor ?? this.anchor,
      dartSource: dartSource ?? this.dartSource,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      reason: reason ?? this.reason,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitOpaqueDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is OpaqueDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.dartSource, dartSource) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.reason, reason) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'OpaqueDecl',
    _equality.hash(anchor),
    _equality.hash(dartSource),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(reason),
    _equality.hash(span),
  ]);
}

/// An expression the extractor cannot model.
///
/// Never dropped, never guessed (INV-4): the raw source, its resolved type, and the reason are preserved so the override system and the AI gap analyzer both have something real to work with.
@immutable
final class OpaqueExpr extends Expr {
  /// Creates a [OpaqueExpr].
  const OpaqueExpr({
    required this.dartSource,
    required this.id,
    required this.reason,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [OpaqueExpr] from JSON, validating as it goes.
  factory OpaqueExpr.fromJson(Object? value, [String path = 'OpaqueExpr']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.OpaqueExpr') {
      throw UirParseError('$path.kind', 'expected "logic.OpaqueExpr", got "$kind"');
    }
    return OpaqueExpr(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      dartSource: _asString(_req(json, 'dartSource', path), '$path.dartSource'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      reason: _asString(_req(json, 'reason', path), '$path.reason'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The original Dart source.
  final String dartSource;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Why it could not be modeled.
  final String reason;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type, which the analyzer still knows.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.OpaqueExpr';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'dartSource': dartSource,
    'ext': ext,
    'id': id,
    'kind': 'logic.OpaqueExpr',
    'reason': reason,
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  OpaqueExpr copyWith({
    Anchor? anchor,
    String? dartSource,
    Map<String, Object?>? ext,
    NodeId? id,
    String? reason,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return OpaqueExpr(
      anchor: anchor ?? this.anchor,
      dartSource: dartSource ?? this.dartSource,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      reason: reason ?? this.reason,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitOpaqueExpr(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is OpaqueExpr &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.dartSource, dartSource) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.reason, reason) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'OpaqueExpr',
    _equality.hash(anchor),
    _equality.hash(dartSource),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(reason),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A statement the extractor cannot model. Preserved rather than dropped (INV-4).
@immutable
final class OpaqueStmt extends Stmt {
  /// Creates a [OpaqueStmt].
  const OpaqueStmt({
    required this.dartSource,
    required this.id,
    required this.reason,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [OpaqueStmt] from JSON, validating as it goes.
  factory OpaqueStmt.fromJson(Object? value, [String path = 'OpaqueStmt']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.OpaqueStmt') {
      throw UirParseError('$path.kind', 'expected "logic.OpaqueStmt", got "$kind"');
    }
    return OpaqueStmt(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      dartSource: _asString(_req(json, 'dartSource', path), '$path.dartSource'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      reason: _asString(_req(json, 'reason', path), '$path.reason'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The original Dart source.
  final String dartSource;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Why it could not be modeled.
  final String reason;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.OpaqueStmt';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'dartSource': dartSource,
    'ext': ext,
    'id': id,
    'kind': 'logic.OpaqueStmt',
    'reason': reason,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  OpaqueStmt copyWith({
    Anchor? anchor,
    String? dartSource,
    Map<String, Object?>? ext,
    NodeId? id,
    String? reason,
    SourceSpan? span,
  }) {
    return OpaqueStmt(
      anchor: anchor ?? this.anchor,
      dartSource: dartSource ?? this.dartSource,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      reason: reason ?? this.reason,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitOpaqueStmt(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is OpaqueStmt &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.dartSource, dartSource) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.reason, reason) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'OpaqueStmt',
    _equality.hash(anchor),
    _equality.hash(dartSource),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(reason),
    _equality.hash(span),
  ]);
}

/// A read of one of the component's own parameters.
@immutable
final class ParamBinding extends Binding {
  /// Creates a [ParamBinding].
  const ParamBinding({
    required this.id,
    required this.param,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [ParamBinding] from JSON, validating as it goes.
  factory ParamBinding.fromJson(Object? value, [String path = 'ParamBinding']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'bind.Param') {
      throw UirParseError('$path.kind', 'expected "bind.Param", got "$kind"');
    }
    return ParamBinding(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      param: _asString(_req(json, 'param', path), '$path.param'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The parameter name.
  final String param;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'bind.Param';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'bind.Param',
    'param': param,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  ParamBinding copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? param,
    SourceSpan? span,
  }) {
    return ParamBinding(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      param: param ?? this.param,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(BindingVisitor<R> visitor) => visitor.visitParamBinding(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ParamBinding &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.param, param) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'ParamBinding',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(param),
    _equality.hash(span),
  ]);
}

/// Reading a property of a value.
@immutable
final class PropertyAccess extends Expr {
  /// Creates a [PropertyAccess].
  const PropertyAccess({
    required this.id,
    required this.property,
    required this.receiver,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [PropertyAccess] from JSON, validating as it goes.
  factory PropertyAccess.fromJson(Object? value, [String path = 'PropertyAccess']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.PropertyAccess') {
      throw UirParseError('$path.kind', 'expected "logic.PropertyAccess", got "$kind"');
    }
    return PropertyAccess(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      property: _asString(_req(json, 'property', path), '$path.property'),
      receiver: Expr.fromJson(_req(json, 'receiver', path), '$path.receiver'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The property name.
  final String property;

  /// The receiver.
  final Expr receiver;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.PropertyAccess';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.PropertyAccess',
    'property': property,
    'receiver': receiver.toJson(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  PropertyAccess copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? property,
    Expr? receiver,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return PropertyAccess(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      property: property ?? this.property,
      receiver: receiver ?? this.receiver,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitPropertyAccess(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is PropertyAccess &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.property, property) &&
        _equality.equals(other.receiver, receiver) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'PropertyAccess',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(property),
    _equality.hash(receiver),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A reference to a declared name — a local, a parameter, a field, or a signal.
@immutable
final class Ref extends Expr {
  /// Creates a [Ref].
  const Ref({
    required this.id,
    required this.name,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.target,
  });

  /// Parses a [Ref] from JSON, validating as it goes.
  factory Ref.fromJson(Object? value, [String path = 'Ref']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Ref') {
      throw UirParseError('$path.kind', 'expected "logic.Ref", got "$kind"');
    }
    return Ref(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      target: json['target'] == null ? null : _asString(json['target'], '$path.target'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The name referenced.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// The declaration referred to, when it is in the program.
  final NodeId? target;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Ref';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Ref',
    'name': name,
    'span': span.toJson(),
    'target': target,
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Ref copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? name,
    SourceSpan? span,
    NodeId? target,
    TypeRef? type,
  }) {
    return Ref(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      name: name ?? this.name,
      span: span ?? this.span,
      target: target ?? this.target,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitRef(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Ref &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.target, target) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Ref',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(name),
    _equality.hash(span),
    _equality.hash(target),
    _equality.hash(type),
  ]);
}

/// A return statement.
@immutable
final class Return extends Stmt {
  /// Creates a [Return].
  const Return({
    required this.id,
    required this.span,
    this.anchor,
    this.ext,
    this.value,
  });

  /// Parses a [Return] from JSON, validating as it goes.
  factory Return.fromJson(Object? value, [String path = 'Return']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Return') {
      throw UirParseError('$path.kind', 'expected "logic.Return", got "$kind"');
    }
    return Return(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      value: json['value'] == null ? null : Expr.fromJson(json['value'], '$path.value'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The returned value, if any.
  final Expr? value;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Return';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Return',
    'span': span.toJson(),
    'value': value?.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Return copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    Expr? value,
  }) {
    return Return(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitReturn(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Return &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Return',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(value),
  ]);
}

/// One route of the application.
@immutable
final class Route extends UirNode {
  /// Creates a [Route].
  const Route({
    required this.component,
    required this.id,
    required this.path,
    required this.span,
    this.anchor,
    this.arguments,
    this.ext,
    this.guards,
    this.layout,
    this.meta,
    this.params,
  });

  /// Parses a [Route] from JSON, validating as it goes.
  factory Route.fromJson(Object? value, [String path = 'Route']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'app.Route') {
      throw UirParseError('$path.kind', 'expected "app.Route", got "$kind"');
    }
    return Route(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      arguments: json['arguments'] == null ? null : _asList<RouteArgument>(json['arguments'], '$path.arguments', RouteArgument.fromJson),
      component: _asString(_req(json, 'component', path), '$path.component'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      guards: json['guards'] == null ? null : _asList<NodeId>(json['guards'], '$path.guards', _asString),
      id: _asString(_req(json, 'id', path), '$path.id'),
      layout: json['layout'] == null ? null : _asString(json['layout'], '$path.layout'),
      meta: json['meta'] == null ? null : SeoMeta.fromJson(json['meta'], '$path.meta'),
      params: json['params'] == null ? null : _asList<ParamDecl>(json['params'], '$path.params', ParamDecl.fromJson),
      path: _asString(_req(json, 'path', path), '$path.path'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Arguments the construction site passed to the component, in order (ADR-0025 D1).
  ///
  /// **Distinct from `params`**, which are the route's *path* parameters — the `:id` in `/user/:id`, supplied by the router at navigation time. These are supplied by the author at the construction site: `home: CounterPanel(label: 'Taps')`. The two differ in who provides them and when, which is why reusing `params` for both would have conflated them.
  ///
  /// The same `RouteArgument` an `app.RouteTransition` carries, deliberately: a declarative route and an imperative navigation are the same question asked twice, and before this field only one of them could answer. It is what makes `transport` — and so ADR-11a's live-object refusal (BRG2301) — reachable for a declarative route, which it was not.
  final List<RouteArgument>? arguments;

  /// The component rendered.
  final NodeId component;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// Guards, in order.
  final List<NodeId>? guards;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The layout component wrapping it, if any.
  final NodeId? layout;

  /// Document metadata.
  final SeoMeta? meta;

  /// Route parameters, in order.
  final List<ParamDecl>? params;

  /// The URL path, e.g. `/product/:id`.
  final String path;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'app.Route';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'arguments': arguments?.map((RouteArgument v) => v.toJson()).toList(),
    'component': component,
    'ext': ext,
    'guards': guards,
    'id': id,
    'kind': 'app.Route',
    'layout': layout,
    'meta': meta?.toJson(),
    'params': params?.map((ParamDecl v) => v.toJson()).toList(),
    'path': path,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Route copyWith({
    Anchor? anchor,
    List<RouteArgument>? arguments,
    NodeId? component,
    Map<String, Object?>? ext,
    List<NodeId>? guards,
    NodeId? id,
    NodeId? layout,
    SeoMeta? meta,
    List<ParamDecl>? params,
    String? path,
    SourceSpan? span,
  }) {
    return Route(
      anchor: anchor ?? this.anchor,
      arguments: arguments ?? this.arguments,
      component: component ?? this.component,
      ext: ext ?? this.ext,
      guards: guards ?? this.guards,
      id: id ?? this.id,
      layout: layout ?? this.layout,
      meta: meta ?? this.meta,
      params: params ?? this.params,
      path: path ?? this.path,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Route &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.arguments, arguments) &&
        _equality.equals(other.component, component) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.guards, guards) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.layout, layout) &&
        _equality.equals(other.meta, meta) &&
        _equality.equals(other.params, params) &&
        _equality.equals(other.path, path) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Route',
    _equality.hash(anchor),
    _equality.hash(arguments),
    _equality.hash(component),
    _equality.hash(ext),
    _equality.hash(guards),
    _equality.hash(id),
    _equality.hash(layout),
    _equality.hash(meta),
    _equality.hash(params),
    _equality.hash(path),
    _equality.hash(span),
  ]);
}

/// A navigation from one place in the application to another — a `Navigator.push`, or a `go_router` navigation.
///
/// This is the input to N11 (ADR-11). C1 found that `go_router` is the dominant navigation shape in real apps and our first analyzer saw none of it; with an empty nav-graph, N11 silently does nothing — a pass that looks like it works because it never fires.
///
/// **Exactly one of `target` and `component` is present** (Spec v2.4 §A17). A navigation either names a route that exists, or constructs its destination inline — and the second is not a route: it has no path, and none is invented for it. The dialect cannot express that exclusivity (a `NodeId` is a string; nothing about its shape says what it points at), so it is checked in code at emit and again at load — `BRG1307`.
///
/// A `Navigator.pop()` is **not** a transition: it returns along an edge that already exists rather than creating one.
@immutable
final class RouteTransition extends UirNode {
  /// Creates a [RouteTransition].
  const RouteTransition({
    required this.id,
    required this.span,
    this.anchor,
    this.arguments,
    this.component,
    this.ext,
    this.source,
    this.target,
  });

  /// Parses a [RouteTransition] from JSON, validating as it goes.
  factory RouteTransition.fromJson(Object? value, [String path = 'RouteTransition']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'app.RouteTransition') {
      throw UirParseError('$path.kind', 'expected "app.RouteTransition", got "$kind"');
    }
    return RouteTransition(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      arguments: json['arguments'] == null ? null : _asList<RouteArgument>(json['arguments'], '$path.arguments', RouteArgument.fromJson),
      component: json['component'] == null ? null : _asString(json['component'], '$path.component'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      source: json['source'] == null ? null : _asString(json['source'], '$path.source'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      target: json['target'] == null ? null : _asString(json['target'], '$path.target'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Arguments passed, in order.
  final List<RouteArgument>? arguments;

  /// The `ui.Component` rendered, when the navigation constructs its destination inline — `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen()))`.
  ///
  /// There is no path here and none is invented: which URL such a push *becomes* on a path-based target is a legalization decision, made in the layer that knows the target (Spec v2.4 §A17.6).
  ///
  /// Absent when the navigation names a route; see `target`.
  final NodeId? component;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The component the navigation happens from.
  final NodeId? source;

  /// Where the node came from.
  final SourceSpan span;

  /// The destination route — an `app.Route` — when the navigation names one, as `context.go('/wonder/3')` does.
  ///
  /// Absent when the navigation constructs its destination inline; see `component`.
  final NodeId? target;

  /// The node's discriminant.
  @override
  String get kind => 'app.RouteTransition';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'arguments': arguments?.map((RouteArgument v) => v.toJson()).toList(),
    'component': component,
    'ext': ext,
    'id': id,
    'kind': 'app.RouteTransition',
    'source': source,
    'span': span.toJson(),
    'target': target,
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  RouteTransition copyWith({
    Anchor? anchor,
    List<RouteArgument>? arguments,
    NodeId? component,
    Map<String, Object?>? ext,
    NodeId? id,
    NodeId? source,
    SourceSpan? span,
    NodeId? target,
  }) {
    return RouteTransition(
      anchor: anchor ?? this.anchor,
      arguments: arguments ?? this.arguments,
      component: component ?? this.component,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      source: source ?? this.source,
      span: span ?? this.span,
      target: target ?? this.target,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is RouteTransition &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.arguments, arguments) &&
        _equality.equals(other.component, component) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.source, source) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.target, target);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'RouteTransition',
    _equality.hash(anchor),
    _equality.hash(arguments),
    _equality.hash(component),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(source),
    _equality.hash(span),
    _equality.hash(target),
  ]);
}

/// A unit of reactive state.
///
/// Every target's reactivity is a lowering of this: React hooks, Vue `computed`, Svelte runes and Angular signals all come from here (ADR-4). No generator ever sees `setState`.
@immutable
final class Signal extends UirNode {
  /// Creates a [Signal].
  const Signal({
    required this.id,
    required this.scope,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.initial,
    this.store,
  });

  /// Parses a [Signal] from JSON, validating as it goes.
  factory Signal.fromJson(Object? value, [String path = 'Signal']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'sig.Signal') {
      throw UirParseError('$path.kind', 'expected "sig.Signal", got "$kind"');
    }
    return Signal(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      initial: json['initial'] == null ? null : Expr.fromJson(json['initial'], '$path.initial'),
      scope: SignalScope.fromJson(_req(json, 'scope', path), '$path.scope'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      store: json['store'] == null ? null : _asString(json['store'], '$path.store'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The initial value, if any.
  final Expr? initial;

  /// Where the signal lives.
  final SignalScope scope;

  /// Where the node came from.
  final SourceSpan span;

  /// The store that owns it, when scope is `store`.
  final NodeId? store;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'sig.Signal';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'initial': initial?.toJson(),
    'kind': 'sig.Signal',
    'scope': scope.toJson(),
    'span': span.toJson(),
    'store': store,
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Signal copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? initial,
    SignalScope? scope,
    SourceSpan? span,
    NodeId? store,
    TypeRef? type,
  }) {
    return Signal(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      initial: initial ?? this.initial,
      scope: scope ?? this.scope,
      span: span ?? this.span,
      store: store ?? this.store,
      type: type ?? this.type,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Signal &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.initial, initial) &&
        _equality.equals(other.scope, scope) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.store, store) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Signal',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(initial),
    _equality.hash(scope),
    _equality.hash(span),
    _equality.hash(store),
    _equality.hash(type),
  ]);
}

/// A read of a signal. This is an edge in the reactivity graph.
@immutable
final class SignalBinding extends Binding {
  /// Creates a [SignalBinding].
  const SignalBinding({
    required this.id,
    required this.signal,
    required this.span,
    this.anchor,
    this.ext,
    this.path,
  });

  /// Parses a [SignalBinding] from JSON, validating as it goes.
  factory SignalBinding.fromJson(Object? value, [String path = 'SignalBinding']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'bind.Signal') {
      throw UirParseError('$path.kind', 'expected "bind.Signal", got "$kind"');
    }
    return SignalBinding(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      path: json['path'] == null ? null : _asList<String>(json['path'], '$path.path', _asString),
      signal: _asString(_req(json, 'signal', path), '$path.signal'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Path into the signal's value, e.g. `['items', 'length']`.
  final List<String>? path;

  /// The signal read.
  final NodeId signal;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'bind.Signal';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'bind.Signal',
    'path': path,
    'signal': signal,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SignalBinding copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    List<String>? path,
    NodeId? signal,
    SourceSpan? span,
  }) {
    return SignalBinding(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      path: path ?? this.path,
      signal: signal ?? this.signal,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(BindingVisitor<R> visitor) => visitor.visitSignalBinding(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SignalBinding &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.path, path) &&
        _equality.equals(other.signal, signal) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SignalBinding',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(path),
    _equality.hash(signal),
    _equality.hash(span),
  ]);
}

/// One Dart source file in the analyzed project.
///
/// The two fingerprints are what make incremental compilation sound (Spec §7.2, ADR-5): editing a method *body* changes `implFingerprint` only, so dependents stay valid; changing a widget's constructor changes `apiFingerprint` and correctly invalidates them.
@immutable
final class SourceFile extends UirNode {
  /// Creates a [SourceFile].
  const SourceFile({
    required this.apiFingerprint,
    required this.contentHash,
    required this.id,
    required this.implFingerprint,
    required this.path,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [SourceFile] from JSON, validating as it goes.
  factory SourceFile.fromJson(Object? value, [String path = 'SourceFile']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'l0.SourceFile') {
      throw UirParseError('$path.kind', 'expected "l0.SourceFile", got "$kind"');
    }
    return SourceFile(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      apiFingerprint: _asString(_req(json, 'apiFingerprint', path), '$path.apiFingerprint'),
      contentHash: _asString(_req(json, 'contentHash', path), '$path.contentHash'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      implFingerprint: _asString(_req(json, 'implFingerprint', path), '$path.implFingerprint'),
      path: _asString(_req(json, 'path', path), '$path.path'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Hash of the file's exported surface. Changing it invalidates dependents.
  final String apiFingerprint;

  /// Hash of the file's bytes.
  final String contentHash;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Hash of the file's bodies. Changing it invalidates only this file's own downstream work.
  final String implFingerprint;

  /// Project-relative path.
  final String path;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'l0.SourceFile';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'apiFingerprint': apiFingerprint,
    'contentHash': contentHash,
    'ext': ext,
    'id': id,
    'implFingerprint': implFingerprint,
    'kind': 'l0.SourceFile',
    'path': path,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  SourceFile copyWith({
    Anchor? anchor,
    String? apiFingerprint,
    String? contentHash,
    Map<String, Object?>? ext,
    NodeId? id,
    String? implFingerprint,
    String? path,
    SourceSpan? span,
  }) {
    return SourceFile(
      anchor: anchor ?? this.anchor,
      apiFingerprint: apiFingerprint ?? this.apiFingerprint,
      contentHash: contentHash ?? this.contentHash,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      implFingerprint: implFingerprint ?? this.implFingerprint,
      path: path ?? this.path,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SourceFile &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.apiFingerprint, apiFingerprint) &&
        _equality.equals(other.contentHash, contentHash) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.implFingerprint, implFingerprint) &&
        _equality.equals(other.path, path) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'SourceFile',
    _equality.hash(anchor),
    _equality.hash(apiFingerprint),
    _equality.hash(contentHash),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(implFingerprint),
    _equality.hash(path),
    _equality.hash(span),
  ]);
}

/// A collection of signals, derivations and actions that outlives any one component.
@immutable
final class Store extends UirNode {
  /// Creates a [Store].
  const Store({
    required this.id,
    required this.name,
    required this.origin,
    required this.span,
    this.actions,
    this.anchor,
    this.derived,
    this.ext,
    this.signals,
  });

  /// Parses a [Store] from JSON, validating as it goes.
  factory Store.fromJson(Object? value, [String path = 'Store']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'app.Store') {
      throw UirParseError('$path.kind', 'expected "app.Store", got "$kind"');
    }
    return Store(
      actions: json['actions'] == null ? null : _asList<NodeId>(json['actions'], '$path.actions', _asString),
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      derived: json['derived'] == null ? null : _asList<NodeId>(json['derived'], '$path.derived', _asString),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      origin: StoreOrigin.fromJson(_req(json, 'origin', path), '$path.origin'),
      signals: json['signals'] == null ? null : _asList<NodeId>(json['signals'], '$path.signals', _asString),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The actions it owns.
  final List<NodeId>? actions;

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The derivations it owns.
  final List<NodeId>? derived;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The store name.
  final String name;

  /// Whether the application declared it, or N11 synthesized it.
  final StoreOrigin origin;

  /// The signals it owns.
  final List<NodeId>? signals;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'app.Store';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'actions': actions,
    'anchor': anchor,
    'derived': derived,
    'ext': ext,
    'id': id,
    'kind': 'app.Store',
    'name': name,
    'origin': origin.toJson(),
    'signals': signals,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Store copyWith({
    List<NodeId>? actions,
    Anchor? anchor,
    List<NodeId>? derived,
    Map<String, Object?>? ext,
    NodeId? id,
    String? name,
    StoreOrigin? origin,
    List<NodeId>? signals,
    SourceSpan? span,
  }) {
    return Store(
      actions: actions ?? this.actions,
      anchor: anchor ?? this.anchor,
      derived: derived ?? this.derived,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      name: name ?? this.name,
      origin: origin ?? this.origin,
      signals: signals ?? this.signals,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Store &&
        _equality.equals(other.actions, actions) &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.derived, derived) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.origin, origin) &&
        _equality.equals(other.signals, signals) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Store',
    _equality.hash(actions),
    _equality.hash(anchor),
    _equality.hash(derived),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(name),
    _equality.hash(origin),
    _equality.hash(signals),
    _equality.hash(span),
  ]);
}

/// An interpolated string. Each interpolation is a reactive read.
@immutable
final class StringInterp extends Expr {
  /// Creates a [StringInterp].
  const StringInterp({
    required this.id,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.parts,
  });

  /// Parses a [StringInterp] from JSON, validating as it goes.
  factory StringInterp.fromJson(Object? value, [String path = 'StringInterp']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.StringInterp') {
      throw UirParseError('$path.kind', 'expected "logic.StringInterp", got "$kind"');
    }
    return StringInterp(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      parts: json['parts'] == null ? null : _asList<Expr>(json['parts'], '$path.parts', Expr.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Parts, in order.
  final List<Expr>? parts;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.StringInterp';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.StringInterp',
    'parts': parts?.map((Expr v) => v.toJson()).toList(),
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  StringInterp copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    List<Expr>? parts,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return StringInterp(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      parts: parts ?? this.parts,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitStringInterp(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is StringInterp &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.parts, parts) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'StringInterp',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(parts),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A switch statement.
@immutable
final class Switch extends Stmt {
  /// Creates a [Switch].
  const Switch({
    required this.id,
    required this.span,
    required this.subject,
    this.anchor,
    this.cases,
    this.ext,
  });

  /// Parses a [Switch] from JSON, validating as it goes.
  factory Switch.fromJson(Object? value, [String path = 'Switch']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Switch') {
      throw UirParseError('$path.kind', 'expected "logic.Switch", got "$kind"');
    }
    return Switch(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      cases: json['cases'] == null ? null : _asList<SwitchCase>(json['cases'], '$path.cases', SwitchCase.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      subject: Expr.fromJson(_req(json, 'subject', path), '$path.subject'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Cases, in order.
  final List<SwitchCase>? cases;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The value switched on.
  final Expr subject;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Switch';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'cases': cases?.map((SwitchCase v) => v.toJson()).toList(),
    'ext': ext,
    'id': id,
    'kind': 'logic.Switch',
    'span': span.toJson(),
    'subject': subject.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Switch copyWith({
    Anchor? anchor,
    List<SwitchCase>? cases,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    Expr? subject,
  }) {
    return Switch(
      anchor: anchor ?? this.anchor,
      cases: cases ?? this.cases,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      subject: subject ?? this.subject,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitSwitch(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Switch &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.cases, cases) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.subject, subject);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Switch',
    _equality.hash(anchor),
    _equality.hash(cases),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(subject),
  ]);
}

/// A throw statement.
@immutable
final class Throw extends Stmt {
  /// Creates a [Throw].
  const Throw({
    required this.id,
    required this.span,
    required this.value,
    this.anchor,
    this.ext,
  });

  /// Parses a [Throw] from JSON, validating as it goes.
  factory Throw.fromJson(Object? value, [String path = 'Throw']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Throw') {
      throw UirParseError('$path.kind', 'expected "logic.Throw", got "$kind"');
    }
    return Throw(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      value: Expr.fromJson(_req(json, 'value', path), '$path.value'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The thrown value.
  final Expr value;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Throw';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Throw',
    'span': span.toJson(),
    'value': value.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Throw copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    Expr? value,
  }) {
    return Throw(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitThrow(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Throw &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Throw',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(value),
  ]);
}

/// One design token.
///
/// Colour tokens are **derived**, never guessed: see MaterialRole and ADR-13. INV-20: every colour a mapped Material widget paints resolves to a token, and generated code contains no literal colour values.
@immutable
final class Token extends UirNode {
  /// Creates a [Token].
  const Token({
    required this.group,
    required this.id,
    required this.light,
    required this.name,
    required this.span,
    this.anchor,
    this.dark,
    this.ext,
    this.role,
  });

  /// Parses a [Token] from JSON, validating as it goes.
  factory Token.fromJson(Object? value, [String path = 'Token']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'app.Token') {
      throw UirParseError('$path.kind', 'expected "app.Token", got "$kind"');
    }
    return Token(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      dark: json['dark'] == null ? null : json['dark'],
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      group: TokenGroup.fromJson(_req(json, 'group', path), '$path.group'),
      id: _asString(_req(json, 'id', path), '$path.id'),
      light: _req(json, 'light', path),
      name: _asString(_req(json, 'name', path), '$path.name'),
      role: json['role'] == null ? null : MaterialRole.fromJson(json['role'], '$path.role'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The value in the dark scheme, when the theme defines one.
  final Object? dark;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The token family.
  final TokenGroup group;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The value in the light scheme.
  final Object? light;

  /// The token name within its group.
  final String name;

  /// The Material colour role, for colour tokens.
  final MaterialRole? role;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'app.Token';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'dark': dark,
    'ext': ext,
    'group': group.toJson(),
    'id': id,
    'kind': 'app.Token',
    'light': light,
    'name': name,
    'role': role?.toJson(),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Token copyWith({
    Anchor? anchor,
    Object? dark,
    Map<String, Object?>? ext,
    TokenGroup? group,
    NodeId? id,
    Object? light,
    String? name,
    MaterialRole? role,
    SourceSpan? span,
  }) {
    return Token(
      anchor: anchor ?? this.anchor,
      dark: dark ?? this.dark,
      ext: ext ?? this.ext,
      group: group ?? this.group,
      id: id ?? this.id,
      light: light ?? this.light,
      name: name ?? this.name,
      role: role ?? this.role,
      span: span ?? this.span,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Token &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.dark, dark) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.group, group) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.light, light) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.role, role) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Token',
    _equality.hash(anchor),
    _equality.hash(dark),
    _equality.hash(ext),
    _equality.hash(group),
    _equality.hash(id),
    _equality.hash(light),
    _equality.hash(name),
    _equality.hash(role),
    _equality.hash(span),
  ]);
}

/// A try statement.
@immutable
final class TryCatch extends Stmt {
  /// Creates a [TryCatch].
  const TryCatch({
    required this.body,
    required this.id,
    required this.span,
    this.anchor,
    this.catches,
    this.ext,
    this.finallyBlock,
  });

  /// Parses a [TryCatch] from JSON, validating as it goes.
  factory TryCatch.fromJson(Object? value, [String path = 'TryCatch']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.TryCatch') {
      throw UirParseError('$path.kind', 'expected "logic.TryCatch", got "$kind"');
    }
    return TryCatch(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: Block.fromJson(_req(json, 'body', path), '$path.body'),
      catches: json['catches'] == null ? null : _asList<CatchClause>(json['catches'], '$path.catches', CatchClause.fromJson),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      finallyBlock: json['finallyBlock'] == null ? null : Block.fromJson(json['finallyBlock'], '$path.finallyBlock'),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The protected block.
  final Block body;

  /// Catch clauses, in order.
  final List<CatchClause>? catches;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The finally block, if any.
  final Block? finallyBlock;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.TryCatch';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body.toJson(),
    'catches': catches?.map((CatchClause v) => v.toJson()).toList(),
    'ext': ext,
    'finallyBlock': finallyBlock?.toJson(),
    'id': id,
    'kind': 'logic.TryCatch',
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  TryCatch copyWith({
    Anchor? anchor,
    Block? body,
    List<CatchClause>? catches,
    Map<String, Object?>? ext,
    Block? finallyBlock,
    NodeId? id,
    SourceSpan? span,
  }) {
    return TryCatch(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      catches: catches ?? this.catches,
      ext: ext ?? this.ext,
      finallyBlock: finallyBlock ?? this.finallyBlock,
      id: id ?? this.id,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitTryCatch(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TryCatch &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.catches, catches) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.finallyBlock, finallyBlock) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'TryCatch',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(catches),
    _equality.hash(ext),
    _equality.hash(finallyBlock),
    _equality.hash(id),
    _equality.hash(span),
  ]);
}

/// A typedef.
@immutable
final class TypeAliasDecl extends Decl {
  /// Creates a [TypeAliasDecl].
  const TypeAliasDecl({
    required this.aliased,
    required this.id,
    required this.name,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [TypeAliasDecl] from JSON, validating as it goes.
  factory TypeAliasDecl.fromJson(Object? value, [String path = 'TypeAliasDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.TypeAliasDecl') {
      throw UirParseError('$path.kind', 'expected "logic.TypeAliasDecl", got "$kind"');
    }
    return TypeAliasDecl(
      aliased: TypeRef.fromJson(_req(json, 'aliased', path), '$path.aliased'),
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The aliased type.
  final TypeRef aliased;

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Alias name.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'logic.TypeAliasDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'aliased': aliased.toJson(),
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.TypeAliasDecl',
    'name': name,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  TypeAliasDecl copyWith({
    TypeRef? aliased,
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? name,
    SourceSpan? span,
  }) {
    return TypeAliasDecl(
      aliased: aliased ?? this.aliased,
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      name: name ?? this.name,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(DeclVisitor<R> visitor) => visitor.visitTypeAliasDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TypeAliasDecl &&
        _equality.equals(other.aliased, aliased) &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'TypeAliasDecl',
    _equality.hash(aliased),
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(name),
    _equality.hash(span),
  ]);
}

/// An asynchronous subtree — the normalized form of `FutureBuilder` (pass N4).
///
/// The waiting/error/data branch shape is mechanically recognizable in real Flutter code, which is what lets N4 pattern-match rather than interpret.
@immutable
final class UiAsync extends UiNode {
  /// Creates a [UiAsync].
  const UiAsync({
    required this.data,
    required this.id,
    required this.source,
    required this.span,
    this.anchor,
    this.dataParam,
    this.error,
    this.ext,
    this.loading,
  });

  /// Parses a [UiAsync] from JSON, validating as it goes.
  factory UiAsync.fromJson(Object? value, [String path = 'UiAsync']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Async') {
      throw UirParseError('$path.kind', 'expected "ui.Async", got "$kind"');
    }
    return UiAsync(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      data: UiNode.fromJson(_req(json, 'data', path), '$path.data'),
      dataParam: json['dataParam'] == null ? null : _asString(json['dataParam'], '$path.dataParam'),
      error: json['error'] == null ? null : UiNode.fromJson(json['error'], '$path.error'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      loading: json['loading'] == null ? null : UiNode.fromJson(json['loading'], '$path.loading'),
      source: Binding.fromJson(_req(json, 'source', path), '$path.source'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Rendered on success.
  final UiNode data;

  /// The name bound to the resolved value inside `data`.
  final String? dataParam;

  /// Rendered on failure.
  final UiNode? error;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Rendered while pending.
  final UiNode? loading;

  /// The future or stream driving the subtree.
  final Binding source;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Async';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'data': data.toJson(),
    'dataParam': dataParam,
    'error': error?.toJson(),
    'ext': ext,
    'id': id,
    'kind': 'ui.Async',
    'loading': loading?.toJson(),
    'source': source.toJson(),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiAsync copyWith({
    Anchor? anchor,
    UiNode? data,
    String? dataParam,
    UiNode? error,
    Map<String, Object?>? ext,
    NodeId? id,
    UiNode? loading,
    Binding? source,
    SourceSpan? span,
  }) {
    return UiAsync(
      anchor: anchor ?? this.anchor,
      data: data ?? this.data,
      dataParam: dataParam ?? this.dataParam,
      error: error ?? this.error,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      loading: loading ?? this.loading,
      source: source ?? this.source,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiAsync(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiAsync &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.data, data) &&
        _equality.equals(other.dataParam, dataParam) &&
        _equality.equals(other.error, error) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.loading, loading) &&
        _equality.equals(other.source, source) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiAsync',
    _equality.hash(anchor),
    _equality.hash(data),
    _equality.hash(dataParam),
    _equality.hash(error),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(loading),
    _equality.hash(source),
    _equality.hash(span),
  ]);
}

/// A conditional subtree — the normalized form of a collection-`if` or a ternary (pass N2).
@immutable
final class UiCond extends UiNode {
  /// Creates a [UiCond].
  const UiCond({
    required this.id,
    required this.span,
    required this.test,
    required this.then,
    this.anchor,
    this.ext,
    this.otherwise,
  });

  /// Parses a [UiCond] from JSON, validating as it goes.
  factory UiCond.fromJson(Object? value, [String path = 'UiCond']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Cond') {
      throw UirParseError('$path.kind', 'expected "ui.Cond", got "$kind"');
    }
    return UiCond(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      otherwise: json['otherwise'] == null ? null : UiNode.fromJson(json['otherwise'], '$path.otherwise'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      test: Binding.fromJson(_req(json, 'test', path), '$path.test'),
      then: UiNode.fromJson(_req(json, 'then', path), '$path.then'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Rendered when false, if anything.
  final UiNode? otherwise;

  /// Where the node came from.
  final SourceSpan span;

  /// The condition.
  final Binding test;

  /// Rendered when true.
  final UiNode then;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Cond';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'ui.Cond',
    'otherwise': otherwise?.toJson(),
    'span': span.toJson(),
    'test': test.toJson(),
    'then': then.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiCond copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    UiNode? otherwise,
    SourceSpan? span,
    Binding? test,
    UiNode? then,
  }) {
    return UiCond(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      otherwise: otherwise ?? this.otherwise,
      span: span ?? this.span,
      test: test ?? this.test,
      then: then ?? this.then,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiCond(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiCond &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.otherwise, otherwise) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.test, test) &&
        _equality.equals(other.then, then);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiCond',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(otherwise),
    _equality.hash(span),
    _equality.hash(test),
    _equality.hash(then),
  ]);
}

/// A widget instantiation.
@immutable
final class UiElement extends UiNode {
  /// Creates a [UiElement].
  const UiElement({
    required this.component,
    required this.id,
    required this.span,
    this.anchor,
    this.children,
    this.ext,
    this.key,
    this.layout,
    this.props,
    this.semantics,
    this.slots,
  });

  /// Parses a [UiElement] from JSON, validating as it goes.
  factory UiElement.fromJson(Object? value, [String path = 'UiElement']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Element') {
      throw UirParseError('$path.kind', 'expected "ui.Element", got "$kind"');
    }
    return UiElement(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      children: json['children'] == null ? null : _asList<UiNode>(json['children'], '$path.children', UiNode.fromJson),
      component: WidgetRef.fromJson(_req(json, 'component', path), '$path.component'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      key: json['key'] == null ? null : Binding.fromJson(json['key'], '$path.key'),
      layout: json['layout'] == null ? null : LayoutIntent.fromJson(json['layout'], '$path.layout'),
      props: json['props'] == null ? null : _asMap<Binding>(json['props'], '$path.props', Binding.fromJson),
      semantics: json['semantics'] == null ? null : SemanticsInfo.fromJson(json['semantics'], '$path.semantics'),
      slots: json['slots'] == null ? null : _asMap<UiNode>(json['slots'], '$path.slots', UiNode.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Children, **in order**. Order is semantic: it is the order they appear on screen, and equality and serialization both preserve it.
  final List<UiNode>? children;

  /// The widget.
  final WidgetRef component;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The widget key, when one was given.
  final Binding? key;

  /// Layout intent, from the `layout-boundedness` analysis.
  final LayoutIntent? layout;

  /// Props, keyed by parameter name. Serialized in sorted key order.
  final Map<String, Binding>? props;

  /// Accessibility semantics, when the widget carries them.
  final SemanticsInfo? semantics;

  /// Named single-child slots, e.g. `appBar`, `body`.
  final Map<String, UiNode>? slots;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Element';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'children': children?.map((UiNode v) => v.toJson()).toList(),
    'component': component.toJson(),
    'ext': ext,
    'id': id,
    'key': key?.toJson(),
    'kind': 'ui.Element',
    'layout': layout?.toJson(),
    'props': props?.map((String k, Binding v) => MapEntry<String, Object?>(k, v.toJson())),
    'semantics': semantics?.toJson(),
    'slots': slots?.map((String k, UiNode v) => MapEntry<String, Object?>(k, v.toJson())),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiElement copyWith({
    Anchor? anchor,
    List<UiNode>? children,
    WidgetRef? component,
    Map<String, Object?>? ext,
    NodeId? id,
    Binding? key,
    LayoutIntent? layout,
    Map<String, Binding>? props,
    SemanticsInfo? semantics,
    Map<String, UiNode>? slots,
    SourceSpan? span,
  }) {
    return UiElement(
      anchor: anchor ?? this.anchor,
      children: children ?? this.children,
      component: component ?? this.component,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      key: key ?? this.key,
      layout: layout ?? this.layout,
      props: props ?? this.props,
      semantics: semantics ?? this.semantics,
      slots: slots ?? this.slots,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiElement(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiElement &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.children, children) &&
        _equality.equals(other.component, component) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.key, key) &&
        _equality.equals(other.layout, layout) &&
        _equality.equals(other.props, props) &&
        _equality.equals(other.semantics, semantics) &&
        _equality.equals(other.slots, slots) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiElement',
    _equality.hash(anchor),
    _equality.hash(children),
    _equality.hash(component),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(key),
    _equality.hash(layout),
    _equality.hash(props),
    _equality.hash(semantics),
    _equality.hash(slots),
    _equality.hash(span),
  ]);
}

/// A list rendered from a collection — the normalized form of `ListView.builder` (pass N3).
@immutable
final class UiList extends UiNode {
  /// Creates a [UiList].
  const UiList({
    required this.id,
    required this.itemParam,
    required this.source,
    required this.span,
    required this.template,
    this.anchor,
    this.ext,
    this.indexParam,
    this.key,
  });

  /// Parses a [UiList] from JSON, validating as it goes.
  factory UiList.fromJson(Object? value, [String path = 'UiList']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.List') {
      throw UirParseError('$path.kind', 'expected "ui.List", got "$kind"');
    }
    return UiList(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      indexParam: json['indexParam'] == null ? null : _asString(json['indexParam'], '$path.indexParam'),
      itemParam: _asString(_req(json, 'itemParam', path), '$path.itemParam'),
      key: json['key'] == null ? null : Binding.fromJson(json['key'], '$path.key'),
      source: Binding.fromJson(_req(json, 'source', path), '$path.source'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      template: UiNode.fromJson(_req(json, 'template', path), '$path.template'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The name bound to each index, if the builder takes one.
  final String? indexParam;

  /// The name bound to each item inside the template.
  final String itemParam;

  /// The per-item key, inferred when Flutter gave none (pass N9).
  final Binding? key;

  /// The collection rendered.
  final Binding source;

  /// Where the node came from.
  final SourceSpan span;

  /// The subtree rendered per item.
  final UiNode template;

  /// The node's discriminant.
  @override
  String get kind => 'ui.List';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'indexParam': indexParam,
    'itemParam': itemParam,
    'key': key?.toJson(),
    'kind': 'ui.List',
    'source': source.toJson(),
    'span': span.toJson(),
    'template': template.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiList copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? indexParam,
    String? itemParam,
    Binding? key,
    Binding? source,
    SourceSpan? span,
    UiNode? template,
  }) {
    return UiList(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      indexParam: indexParam ?? this.indexParam,
      itemParam: itemParam ?? this.itemParam,
      key: key ?? this.key,
      source: source ?? this.source,
      span: span ?? this.span,
      template: template ?? this.template,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiList(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiList &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.indexParam, indexParam) &&
        _equality.equals(other.itemParam, itemParam) &&
        _equality.equals(other.key, key) &&
        _equality.equals(other.source, source) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.template, template);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiList',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(indexParam),
    _equality.hash(itemParam),
    _equality.hash(key),
    _equality.hash(source),
    _equality.hash(span),
    _equality.hash(template),
  ]);
}

/// A widget the extractor cannot model. Preserved with its source and reason (INV-4); routed to the override system.
@immutable
final class UiOpaque extends UiNode {
  /// Creates a [UiOpaque].
  const UiOpaque({
    required this.dartSource,
    required this.id,
    required this.reason,
    required this.span,
    this.anchor,
    this.ext,
    this.widget,
  });

  /// Parses a [UiOpaque] from JSON, validating as it goes.
  factory UiOpaque.fromJson(Object? value, [String path = 'UiOpaque']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Opaque') {
      throw UirParseError('$path.kind', 'expected "ui.Opaque", got "$kind"');
    }
    return UiOpaque(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      dartSource: _asString(_req(json, 'dartSource', path), '$path.dartSource'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      reason: _asString(_req(json, 'reason', path), '$path.reason'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      widget: json['widget'] == null ? null : WidgetRef.fromJson(json['widget'], '$path.widget'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The original Dart source.
  final String dartSource;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Why it could not be modeled.
  final String reason;

  /// Where the node came from.
  final SourceSpan span;

  /// The widget, when it could at least be identified.
  final WidgetRef? widget;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Opaque';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'dartSource': dartSource,
    'ext': ext,
    'id': id,
    'kind': 'ui.Opaque',
    'reason': reason,
    'span': span.toJson(),
    'widget': widget?.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiOpaque copyWith({
    Anchor? anchor,
    String? dartSource,
    Map<String, Object?>? ext,
    NodeId? id,
    String? reason,
    SourceSpan? span,
    WidgetRef? widget,
  }) {
    return UiOpaque(
      anchor: anchor ?? this.anchor,
      dartSource: dartSource ?? this.dartSource,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      reason: reason ?? this.reason,
      span: span ?? this.span,
      widget: widget ?? this.widget,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiOpaque(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiOpaque &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.dartSource, dartSource) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.reason, reason) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.widget, widget);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiOpaque',
    _equality.hash(anchor),
    _equality.hash(dartSource),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(reason),
    _equality.hash(span),
    _equality.hash(widget),
  ]);
}

/// A subtree a human owns.
///
/// The generator emits an import of the override instead of generated code, and `bridge sync` checks that the override's props still match the Flutter side — so a changed constructor is a named diff, not silent drift.
@immutable
final class UiOverrideRef extends UiNode {
  /// Creates a [UiOverrideRef].
  const UiOverrideRef({
    required this.id,
    required this.overrideKey,
    required this.span,
    this.anchor,
    this.ext,
    this.props,
  });

  /// Parses a [UiOverrideRef] from JSON, validating as it goes.
  factory UiOverrideRef.fromJson(Object? value, [String path = 'UiOverrideRef']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.OverrideRef') {
      throw UirParseError('$path.kind', 'expected "ui.OverrideRef", got "$kind"');
    }
    return UiOverrideRef(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      overrideKey: _asString(_req(json, 'overrideKey', path), '$path.overrideKey'),
      props: json['props'] == null ? null : _asMap<Binding>(json['props'], '$path.props', Binding.fromJson),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The override key.
  final Anchor overrideKey;

  /// Props the override receives.
  final Map<String, Binding>? props;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'ui.OverrideRef';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'ui.OverrideRef',
    'overrideKey': overrideKey,
    'props': props?.map((String k, Binding v) => MapEntry<String, Object?>(k, v.toJson())),
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiOverrideRef copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Anchor? overrideKey,
    Map<String, Binding>? props,
    SourceSpan? span,
  }) {
    return UiOverrideRef(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      overrideKey: overrideKey ?? this.overrideKey,
      props: props ?? this.props,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiOverrideRef(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiOverrideRef &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.overrideKey, overrideKey) &&
        _equality.equals(other.props, props) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiOverrideRef',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(overrideKey),
    _equality.hash(props),
    _equality.hash(span),
  ]);
}

/// A reference to a named slot supplied by a parent.
@immutable
final class UiSlotRef extends UiNode {
  /// Creates a [UiSlotRef].
  const UiSlotRef({
    required this.id,
    required this.slot,
    required this.span,
    this.anchor,
    this.ext,
  });

  /// Parses a [UiSlotRef] from JSON, validating as it goes.
  factory UiSlotRef.fromJson(Object? value, [String path = 'UiSlotRef']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.SlotRef') {
      throw UirParseError('$path.kind', 'expected "ui.SlotRef", got "$kind"');
    }
    return UiSlotRef(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      slot: _asString(_req(json, 'slot', path), '$path.slot'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The slot name.
  final String slot;

  /// Where the node came from.
  final SourceSpan span;

  /// The node's discriminant.
  @override
  String get kind => 'ui.SlotRef';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'ui.SlotRef',
    'slot': slot,
    'span': span.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiSlotRef copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    String? slot,
    SourceSpan? span,
  }) {
    return UiSlotRef(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      slot: slot ?? this.slot,
      span: span ?? this.span,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiSlotRef(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiSlotRef &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.slot, slot) &&
        _equality.equals(other.span, span);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiSlotRef',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(slot),
    _equality.hash(span),
  ]);
}

/// A text node.
@immutable
final class UiText extends UiNode {
  /// Creates a [UiText].
  const UiText({
    required this.id,
    required this.span,
    required this.value,
    this.anchor,
    this.ext,
    this.style,
  });

  /// Parses a [UiText] from JSON, validating as it goes.
  factory UiText.fromJson(Object? value, [String path = 'UiText']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'ui.Text') {
      throw UirParseError('$path.kind', 'expected "ui.Text", got "$kind"');
    }
    return UiText(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      style: json['style'] == null ? null : _asMap<Binding>(json['style'], '$path.style', Binding.fromJson),
      value: Binding.fromJson(_req(json, 'value', path), '$path.value'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Where the node came from.
  final SourceSpan span;

  /// Style properties, keyed by name.
  final Map<String, Binding>? style;

  /// The text. A string interpolation makes this a reactive read.
  final Binding value;

  /// The node's discriminant.
  @override
  String get kind => 'ui.Text';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'ui.Text',
    'span': span.toJson(),
    'style': style?.map((String k, Binding v) => MapEntry<String, Object?>(k, v.toJson())),
    'value': value.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  UiText copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    SourceSpan? span,
    Map<String, Binding>? style,
    Binding? value,
  }) {
    return UiText(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      span: span ?? this.span,
      style: style ?? this.style,
      value: value ?? this.value,
    );
  }

  @override
  R accept<R>(UiNodeVisitor<R> visitor) => visitor.visitUiText(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is UiText &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.style, style) &&
        _equality.equals(other.value, value);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'UiText',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(span),
    _equality.hash(style),
    _equality.hash(value),
  ]);
}

/// A unary operation, e.g. `!a`.
@immutable
final class Unary extends Expr {
  /// Creates a [Unary].
  const Unary({
    required this.id,
    required this.operand,
    required this.operator,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
  });

  /// Parses a [Unary] from JSON, validating as it goes.
  factory Unary.fromJson(Object? value, [String path = 'Unary']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.Unary') {
      throw UirParseError('$path.kind', 'expected "logic.Unary", got "$kind"');
    }
    return Unary(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      operand: Expr.fromJson(_req(json, 'operand', path), '$path.operand'),
      operator: _asString(_req(json, 'operator', path), '$path.operator'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The operand.
  final Expr operand;

  /// The operator, e.g. `!`.
  final String operator;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.Unary';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'kind': 'logic.Unary',
    'operand': operand.toJson(),
    'operator': operator,
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  Unary copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? operand,
    String? operator,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return Unary(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      operand: operand ?? this.operand,
      operator: operator ?? this.operator,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(ExprVisitor<R> visitor) => visitor.visitUnary(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Unary &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.operand, operand) &&
        _equality.equals(other.operator, operator) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'Unary',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(operand),
    _equality.hash(operator),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A local variable declaration.
@immutable
final class VarDecl extends Stmt {
  /// Creates a [VarDecl].
  const VarDecl({
    required this.id,
    required this.name,
    required this.span,
    required this.type,
    this.anchor,
    this.ext,
    this.initializer,
    this.isFinal,
  });

  /// Parses a [VarDecl] from JSON, validating as it goes.
  factory VarDecl.fromJson(Object? value, [String path = 'VarDecl']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.VarDecl') {
      throw UirParseError('$path.kind', 'expected "logic.VarDecl", got "$kind"');
    }
    return VarDecl(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      initializer: json['initializer'] == null ? null : Expr.fromJson(json['initializer'], '$path.initializer'),
      isFinal: json['isFinal'] == null ? null : _asBool(json['isFinal'], '$path.isFinal'),
      name: _asString(_req(json, 'name', path), '$path.name'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      type: TypeRef.fromJson(_req(json, 'type', path), '$path.type'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// The initializer, if any.
  final Expr? initializer;

  /// Whether the variable is final.
  final bool? isFinal;

  /// The variable name.
  final String name;

  /// Where the node came from.
  final SourceSpan span;

  /// Resolved type.
  final TypeRef type;

  /// The node's discriminant.
  @override
  String get kind => 'logic.VarDecl';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'ext': ext,
    'id': id,
    'initializer': initializer?.toJson(),
    'isFinal': isFinal,
    'kind': 'logic.VarDecl',
    'name': name,
    'span': span.toJson(),
    'type': type.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  VarDecl copyWith({
    Anchor? anchor,
    Map<String, Object?>? ext,
    NodeId? id,
    Expr? initializer,
    bool? isFinal,
    String? name,
    SourceSpan? span,
    TypeRef? type,
  }) {
    return VarDecl(
      anchor: anchor ?? this.anchor,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      initializer: initializer ?? this.initializer,
      isFinal: isFinal ?? this.isFinal,
      name: name ?? this.name,
      span: span ?? this.span,
      type: type ?? this.type,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitVarDecl(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is VarDecl &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.initializer, initializer) &&
        _equality.equals(other.isFinal, isFinal) &&
        _equality.equals(other.name, name) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.type, type);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'VarDecl',
    _equality.hash(anchor),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(initializer),
    _equality.hash(isFinal),
    _equality.hash(name),
    _equality.hash(span),
    _equality.hash(type),
  ]);
}

/// A while or do-while loop.
@immutable
final class While extends Stmt {
  /// Creates a [While].
  const While({
    required this.body,
    required this.id,
    required this.span,
    required this.test,
    this.anchor,
    this.ext,
    this.isDoWhile,
  });

  /// Parses a [While] from JSON, validating as it goes.
  factory While.fromJson(Object? value, [String path = 'While']) {
    final Map<String, Object?> json = _asObject(value, path);
    final String kind = _asString(_req(json, 'kind', path), '$path.kind');
    if (kind != 'logic.While') {
      throw UirParseError('$path.kind', 'expected "logic.While", got "$kind"');
    }
    return While(
      anchor: json['anchor'] == null ? null : _asString(json['anchor'], '$path.anchor'),
      body: Stmt.fromJson(_req(json, 'body', path), '$path.body'),
      ext: json['ext'] == null ? null : _asMap<Object?>(json['ext'], '$path.ext', (Object? v, String p) => v),
      id: _asString(_req(json, 'id', path), '$path.id'),
      isDoWhile: json['isDoWhile'] == null ? null : _asBool(json['isDoWhile'], '$path.isDoWhile'),
      span: SourceSpan.fromJson(_req(json, 'span', path), '$path.span'),
      test: Expr.fromJson(_req(json, 'test', path), '$path.test'),
    );
  }

  /// The override key, when the node is addressable by a human.
  final Anchor? anchor;

  /// The body.
  final Stmt body;

  /// Plugin extension data, namespaced `x-<plugin>`. Core passes round-trip it untouched (Spec §2.6).
  final Map<String, Object?>? ext;

  /// The node's stable, content-addressed identity.
  final NodeId id;

  /// Whether the test runs after the body.
  final bool? isDoWhile;

  /// Where the node came from.
  final SourceSpan span;

  /// The condition.
  final Expr test;

  /// The node's discriminant.
  @override
  String get kind => 'logic.While';

  /// Serializes to canonical JSON: keys sorted, nulls omitted.
  @override
  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{
    'anchor': anchor,
    'body': body.toJson(),
    'ext': ext,
    'id': id,
    'isDoWhile': isDoWhile,
    'kind': 'logic.While',
    'span': span.toJson(),
    'test': test.toJson(),
  })! as Map<String, Object?>;

  /// Returns a copy with the given fields replaced. The original is never mutated.
  ///
  /// An omitted argument keeps its current value; `copyWith` cannot set a field back to
  /// null. Construct a new node when that is what you mean.
  While copyWith({
    Anchor? anchor,
    Stmt? body,
    Map<String, Object?>? ext,
    NodeId? id,
    bool? isDoWhile,
    SourceSpan? span,
    Expr? test,
  }) {
    return While(
      anchor: anchor ?? this.anchor,
      body: body ?? this.body,
      ext: ext ?? this.ext,
      id: id ?? this.id,
      isDoWhile: isDoWhile ?? this.isDoWhile,
      span: span ?? this.span,
      test: test ?? this.test,
    );
  }

  @override
  R accept<R>(StmtVisitor<R> visitor) => visitor.visitWhile(this);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is While &&
        _equality.equals(other.anchor, anchor) &&
        _equality.equals(other.body, body) &&
        _equality.equals(other.ext, ext) &&
        _equality.equals(other.id, id) &&
        _equality.equals(other.isDoWhile, isDoWhile) &&
        _equality.equals(other.span, span) &&
        _equality.equals(other.test, test);
  }

  @override
  int get hashCode => Object.hashAll(<Object?>[
    'While',
    _equality.hash(anchor),
    _equality.hash(body),
    _equality.hash(ext),
    _equality.hash(id),
    _equality.hash(isDoWhile),
    _equality.hash(span),
    _equality.hash(test),
  ]);
}

/// Visitor over [Binding].
///
/// Exhaustive by construction: adding a variant to the schema breaks every implementation at
/// compile time, which is exactly what a compiler wants.
abstract interface class BindingVisitor<R> {
  /// Visits a [ConstBinding].
  R visitConstBinding(ConstBinding node);

  /// Visits a [ExprBinding].
  R visitExprBinding(ExprBinding node);

  /// Visits a [ParamBinding].
  R visitParamBinding(ParamBinding node);

  /// Visits a [SignalBinding].
  R visitSignalBinding(SignalBinding node);
}

/// Visitor over [Decl].
///
/// Exhaustive by construction: adding a variant to the schema breaks every implementation at
/// compile time, which is exactly what a compiler wants.
abstract interface class DeclVisitor<R> {
  /// Visits a [ClassDecl].
  R visitClassDecl(ClassDecl node);

  /// Visits a [EnumDecl].
  R visitEnumDecl(EnumDecl node);

  /// Visits a [FieldDecl].
  R visitFieldDecl(FieldDecl node);

  /// Visits a [FunctionDecl].
  R visitFunctionDecl(FunctionDecl node);

  /// Visits a [OpaqueDecl].
  R visitOpaqueDecl(OpaqueDecl node);

  /// Visits a [TypeAliasDecl].
  R visitTypeAliasDecl(TypeAliasDecl node);
}

/// Visitor over [Expr].
///
/// Exhaustive by construction: adding a variant to the schema breaks every implementation at
/// compile time, which is exactly what a compiler wants.
abstract interface class ExprVisitor<R> {
  /// Visits a [Assign].
  R visitAssign(Assign node);

  /// Visits a [Await].
  R visitAwait(Await node);

  /// Visits a [Binary].
  R visitBinary(Binary node);

  /// Visits a [Call].
  R visitCall(Call node);

  /// Visits a [Cast].
  R visitCast(Cast node);

  /// Visits a [Conditional].
  R visitConditional(Conditional node);

  /// Visits a [Lambda].
  R visitLambda(Lambda node);

  /// Visits a [ListLit].
  R visitListLit(ListLit node);

  /// Visits a [Lit].
  R visitLit(Lit node);

  /// Visits a [MapLit].
  R visitMapLit(MapLit node);

  /// Visits a [MethodCall].
  R visitMethodCall(MethodCall node);

  /// Visits a [New].
  R visitNew(New node);

  /// Visits a [NullCheck].
  R visitNullCheck(NullCheck node);

  /// Visits a [OpaqueExpr].
  R visitOpaqueExpr(OpaqueExpr node);

  /// Visits a [PropertyAccess].
  R visitPropertyAccess(PropertyAccess node);

  /// Visits a [Ref].
  R visitRef(Ref node);

  /// Visits a [StringInterp].
  R visitStringInterp(StringInterp node);

  /// Visits a [Unary].
  R visitUnary(Unary node);
}

/// Visitor over [Stmt].
///
/// Exhaustive by construction: adding a variant to the schema breaks every implementation at
/// compile time, which is exactly what a compiler wants.
abstract interface class StmtVisitor<R> {
  /// Visits a [Block].
  R visitBlock(Block node);

  /// Visits a [Break].
  R visitBreak(Break node);

  /// Visits a [Continue].
  R visitContinue(Continue node);

  /// Visits a [ExprStmt].
  R visitExprStmt(ExprStmt node);

  /// Visits a [For].
  R visitFor(For node);

  /// Visits a [If].
  R visitIf(If node);

  /// Visits a [Navigate].
  R visitNavigate(Navigate node);

  /// Visits a [OpaqueStmt].
  R visitOpaqueStmt(OpaqueStmt node);

  /// Visits a [Return].
  R visitReturn(Return node);

  /// Visits a [Switch].
  R visitSwitch(Switch node);

  /// Visits a [Throw].
  R visitThrow(Throw node);

  /// Visits a [TryCatch].
  R visitTryCatch(TryCatch node);

  /// Visits a [VarDecl].
  R visitVarDecl(VarDecl node);

  /// Visits a [While].
  R visitWhile(While node);
}

/// Visitor over [UiNode].
///
/// Exhaustive by construction: adding a variant to the schema breaks every implementation at
/// compile time, which is exactly what a compiler wants.
abstract interface class UiNodeVisitor<R> {
  /// Visits a [UiAsync].
  R visitUiAsync(UiAsync node);

  /// Visits a [UiCond].
  R visitUiCond(UiCond node);

  /// Visits a [UiElement].
  R visitUiElement(UiElement node);

  /// Visits a [UiList].
  R visitUiList(UiList node);

  /// Visits a [UiOpaque].
  R visitUiOpaque(UiOpaque node);

  /// Visits a [UiOverrideRef].
  R visitUiOverrideRef(UiOverrideRef node);

  /// Visits a [UiSlotRef].
  R visitUiSlotRef(UiSlotRef node);

  /// Visits a [UiText].
  R visitUiText(UiText node);
}

/// Parses any UIR node, dispatching on `kind` across every node kind in the schema.
///
/// This is the only way a UIR node should be constructed from data: it guarantees that the node
/// is a generated type, fully validated, with no field left unchecked.
UirNode uirNodeFromJson(Object? value, [String path = 'UirNode']) {
  final Map<String, Object?> json = _asObject(value, path);
  final String kind = _asString(_req(json, 'kind', path), '$path.kind');
  switch (kind) {
    case 'sig.Action':
      return Action.fromJson(json, path);
    case 'logic.Assign':
      return Assign.fromJson(json, path);
    case 'logic.Await':
      return Await.fromJson(json, path);
    case 'logic.Binary':
      return Binary.fromJson(json, path);
    case 'logic.Block':
      return Block.fromJson(json, path);
    case 'logic.Break':
      return Break.fromJson(json, path);
    case 'logic.Call':
      return Call.fromJson(json, path);
    case 'logic.Cast':
      return Cast.fromJson(json, path);
    case 'logic.ClassDecl':
      return ClassDecl.fromJson(json, path);
    case 'ui.Component':
      return Component.fromJson(json, path);
    case 'logic.Conditional':
      return Conditional.fromJson(json, path);
    case 'bind.Const':
      return ConstBinding.fromJson(json, path);
    case 'logic.Continue':
      return Continue.fromJson(json, path);
    case 'sig.Derived':
      return Derived.fromJson(json, path);
    case 'sig.Effect':
      return Effect.fromJson(json, path);
    case 'app.Endpoint':
      return Endpoint.fromJson(json, path);
    case 'logic.EnumDecl':
      return EnumDecl.fromJson(json, path);
    case 'bind.Expr':
      return ExprBinding.fromJson(json, path);
    case 'logic.ExprStmt':
      return ExprStmt.fromJson(json, path);
    case 'logic.FieldDecl':
      return FieldDecl.fromJson(json, path);
    case 'logic.For':
      return For.fromJson(json, path);
    case 'logic.FunctionDecl':
      return FunctionDecl.fromJson(json, path);
    case 'logic.If':
      return If.fromJson(json, path);
    case 'logic.Lambda':
      return Lambda.fromJson(json, path);
    case 'logic.ListLit':
      return ListLit.fromJson(json, path);
    case 'logic.Lit':
      return Lit.fromJson(json, path);
    case 'logic.MapLit':
      return MapLit.fromJson(json, path);
    case 'logic.MethodCall':
      return MethodCall.fromJson(json, path);
    case 'logic.Navigate':
      return Navigate.fromJson(json, path);
    case 'logic.New':
      return New.fromJson(json, path);
    case 'logic.NullCheck':
      return NullCheck.fromJson(json, path);
    case 'logic.OpaqueDecl':
      return OpaqueDecl.fromJson(json, path);
    case 'logic.OpaqueExpr':
      return OpaqueExpr.fromJson(json, path);
    case 'logic.OpaqueStmt':
      return OpaqueStmt.fromJson(json, path);
    case 'bind.Param':
      return ParamBinding.fromJson(json, path);
    case 'logic.PropertyAccess':
      return PropertyAccess.fromJson(json, path);
    case 'logic.Ref':
      return Ref.fromJson(json, path);
    case 'logic.Return':
      return Return.fromJson(json, path);
    case 'app.Route':
      return Route.fromJson(json, path);
    case 'app.RouteTransition':
      return RouteTransition.fromJson(json, path);
    case 'sig.Signal':
      return Signal.fromJson(json, path);
    case 'bind.Signal':
      return SignalBinding.fromJson(json, path);
    case 'l0.SourceFile':
      return SourceFile.fromJson(json, path);
    case 'app.Store':
      return Store.fromJson(json, path);
    case 'logic.StringInterp':
      return StringInterp.fromJson(json, path);
    case 'logic.Switch':
      return Switch.fromJson(json, path);
    case 'logic.Throw':
      return Throw.fromJson(json, path);
    case 'app.Token':
      return Token.fromJson(json, path);
    case 'logic.TryCatch':
      return TryCatch.fromJson(json, path);
    case 'logic.TypeAliasDecl':
      return TypeAliasDecl.fromJson(json, path);
    case 'ui.Async':
      return UiAsync.fromJson(json, path);
    case 'ui.Cond':
      return UiCond.fromJson(json, path);
    case 'ui.Element':
      return UiElement.fromJson(json, path);
    case 'ui.List':
      return UiList.fromJson(json, path);
    case 'ui.Opaque':
      return UiOpaque.fromJson(json, path);
    case 'ui.OverrideRef':
      return UiOverrideRef.fromJson(json, path);
    case 'ui.SlotRef':
      return UiSlotRef.fromJson(json, path);
    case 'ui.Text':
      return UiText.fromJson(json, path);
    case 'logic.Unary':
      return Unary.fromJson(json, path);
    case 'logic.VarDecl':
      return VarDecl.fromJson(json, path);
    case 'logic.While':
      return While.fromJson(json, path);
    default:
      throw UirParseError('$path.kind', 'unknown UIR node kind "$kind"');
  }
}
