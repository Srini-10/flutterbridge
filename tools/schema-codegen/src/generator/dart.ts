/**
 * The Dart emitter.
 *
 * Produces immutable `final`/`sealed` classes with const constructors, `fromJson`/`toJson`, value
 * equality, `hashCode`, `copyWith`, and visitors.
 *
 * Everything lands in **one library**: Dart's `sealed` requires all subtypes to live in the same
 * library, and sealed unions are what make a `switch` over UIR nodes exhaustive at compile time. That
 * exhaustiveness is the point — adding a node to the schema must break every incomplete switch in the
 * compiler, loudly, at build time rather than in a user's converted app.
 */

import type { AliasDef, Def, EnumDef, ObjectDef, SchemaModel, TypeRef, UnionDef } from '../parser.js';
import { docComment, enumDefs, nodeDefs, unionDefs, unionOf, valueDefs } from './common.js';
import { banner } from './templates/banner.js';

/** Generates the single Dart library for [model]. */
export function generateDart(model: SchemaModel): string {
  const index = new Map<string, Def>(model.defs.map((d) => [d.name, d]));

  const out: string[] = [
    banner(model.uirVersion),
    '',
    '// Generated code is held to the same analysis standard as hand-written code, with three',
    '// exceptions that only a generator produces:',
    '//   constant_identifier_names — enum values carry their wire spelling (e.g. BRG2301).',
    '//   prefer_if_null_operators  — optional-field reads are explicit null checks, for clarity.',
    '//   comment_references        — documentation is copied verbatim from the schema.',
    '//   unused_element            — a reader helper is emitted whether or not the schema uses it.',
    '// ignore_for_file: constant_identifier_names, prefer_if_null_operators',
    '// ignore_for_file: comment_references, unused_element',
    '',
    '/// The Universal Intermediate Representation. Generated from the UIR schema.',
    'library;',
    '',
    "import 'dart:collection';",
    "import 'dart:convert';",
    '',
    "import 'package:collection/collection.dart';",
    "import 'package:crypto/crypto.dart';",
    "import 'package:meta/meta.dart';",
    '',
    '/// The UIR schema version this library was generated from.',
    `const String uirVersion = '${model.uirVersion}';`,
    '',
    '/// A hash of the schema sources this library was generated from.',
    '///',
    '/// Stamped into every emitted manifest: a UIR document always says which schema produced it.',
    `const String uirSchemaHash = '${model.schemaHash}';`,
    '',
    referenceFieldMap(model),
    '',
    prelude(),
    '',
  ];

  for (const def of enumDefs(model)) out.push(emitEnum(def), '');
  for (const def of model.defs.filter((d): d is AliasDef => d.kind === 'alias')) {
    out.push(docComment(def.doc), `typedef ${def.name} = ${dartType(index, def.type)};`, '');
  }
  for (const def of unionDefs(model)) out.push(emitUnionBase(model, def), '');
  for (const def of [...valueDefs(model), ...nodeDefs(model)]) out.push(emitClass(model, index, def), '');
  for (const def of unionDefs(model)) out.push(emitVisitor(def), '');
  out.push(emitGlobalDispatcher(model), '');

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * Which fields of which nodes hold `NodeId` references.
 *
 * The emitter checks that every reference in a document resolves, and it cannot do that without
 * knowing which strings *are* references — a `NodeId` is a `String` once the types are erased. This
 * map is generated from the schema, so it can never fall out of step with it.
 */
function referenceFieldMap(model: SchemaModel): string {
  const isNodeId = (type: TypeRef): boolean =>
    (type.kind === 'ref' && type.name === 'NodeId') ||
    (type.kind === 'list' && type.item.kind === 'ref' && type.item.name === 'NodeId');

  const entries = nodeDefs(model)
    .map((node) => {
      const fields = node.fields.filter((f) => isNodeId(f.type)).map((f) => f.name);
      return fields.length === 0
        ? null
        : `  '${node.uirKind}': <String>[${fields.map((f) => `'${f}'`).join(', ')}],`;
    })
    .filter((line): line is string => line !== null);

  return [
    '/// Node kind -> the fields of that node which hold `NodeId` references.',
    '///',
    '/// Generated from the schema: a `NodeId` is a `String` once types are erased, so a consumer that',
    '/// wants to check that every reference resolves needs to be told which strings are references.',
    'const Map<String, List<String>> uirReferenceFields = <String, List<String>>{',
    ...entries,
    '};',
  ].join('\n');
}

function prelude(): string {
  return `/// Thrown when JSON does not conform to the schema.
///
/// Deserialization validates; it never guesses. A UIR document that does not match the schema is a
/// bug in whatever produced it, and it must not be allowed to become a plausible-looking node tree.
class UirParseError implements Exception {
  /// Creates a parse error at [path].
  const UirParseError(this.path, this.message);

  /// Where in the document the problem is, e.g. \`UiElement.children[2].kind\`.
  final String path;

  /// What is wrong.
  final String message;

  @override
  String toString() => 'UirParseError \$path: \$message';
}

/// The base of every UIR node.
///
/// Every node carries a stable [id], a [kind] discriminant, and a [span] (Spec §2.3).
abstract base class UirNode {
  /// Creates a node.
  const UirNode();

  /// The node's discriminant, e.g. \`ui.Element\`.
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
  if (value == null) throw UirParseError('\$path.\$key', 'required field is missing');
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
    out.add(item(value[i], '\$path[\$i]'));
  }
  return List<T>.unmodifiable(out);
}

Map<String, T> _asMap<T>(Object? value, String path, T Function(Object?, String) item) {
  final Map<String, Object?> raw = _asObject(value, path);
  final SplayTreeMap<String, T> out = SplayTreeMap<String, T>();
  for (final String key in raw.keys.toList()..sort()) {
    out[key] = item(raw[key], '\$path.\$key');
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
/// Not \`jsonEncode\`. A host's JSON encoder formats numbers the way *that host* likes: Dart writes the
/// double 100.0 as \`100.0\`, JavaScript writes it as \`100\`, and \`-0.0\` loses its sign in one of them.
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
///   (JavaScript writes NaN as \`null\`) is worse than one that fails.
/// * An **int** beyond ±(2^53 - 1) is prohibited: a 64-bit Dart int above it cannot survive a
///   round-trip through a double, and therefore cannot survive JSON read by JavaScript. Refused, never
///   silently rounded. A **double** of any magnitude is fine — it is already a double, so it survives a
///   double by definition. \`1e21\` is a legal value; the int \`9007199254740993\` is not.
/// * Otherwise: the shortest decimal that round-trips, with **no trailing \`.0\`** and an **unsigned
///   zero**. The node's \`type\` already says whether the value is an int or a double; the number
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
  // it differs is the trailing \`.0\` it gives an integral double.
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

/// How many hex characters of the digest an id keeps (Spec §2.3).
const int nodeIdLength = 16;

/// Strips \`id\`, \`anchor\` and \`span\` from [value] and from **everything inside it**.
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
/// anchor — not the id — is what tells two identical \`SizedBox\`es apart.
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
    sha256.convert(utf8.encode('\$tier:\$payload')).toString().substring(0, nodeIdLength);`;
}

function emitEnum(def: EnumDef): string {
  const members = def.values.map((v) => `${docComment(v.doc, '  ')}\n  ${v.value},`).join('\n');
  return [
    docComment(def.doc),
    `enum ${def.name} {`,
    members,
    `  ;`,
    '',
    `  /// Parses a [${def.name}] from its wire value. Rejects anything outside the enum.`,
    `  static ${def.name} fromJson(Object? value, [String path = '${def.name}']) {`,
    `    final String raw = _asString(value, path);`,
    `    for (final ${def.name} candidate in ${def.name}.values) {`,
    `      if (candidate.name == raw) return candidate;`,
    `    }`,
    `    throw UirParseError(path, 'unknown ${def.name} "\$raw"');`,
    `  }`,
    '',
    `  /// The wire value.`,
    `  String toJson() => name;`,
    `}`,
  ].join('\n');
}

function emitUnionBase(model: SchemaModel, def: UnionDef): string {
  const cases = def.variants
    .map((variant) => {
      const node = model.defs.find((d) => d.name === variant) as ObjectDef;
      return `      case '${node.uirKind}':\n        return ${variant}.fromJson(json, path);`;
    })
    .join('\n');

  return [
    docComment(def.doc),
    `sealed class ${def.name} extends UirNode {`,
    `  /// Creates a [${def.name}].`,
    `  const ${def.name}();`,
    '',
    `  /// Parses any [${def.name}], dispatching on \`kind\`.`,
    `  static ${def.name} fromJson(Object? value, [String path = '${def.name}']) {`,
    `    final Map<String, Object?> json = _asObject(value, path);`,
    `    final String kind = _asString(_req(json, 'kind', path), '\$path.kind');`,
    `    switch (kind) {`,
    cases,
    `      default:`,
    `        throw UirParseError('\$path.kind', 'unknown ${def.name} kind "\$kind"');`,
    `    }`,
    `  }`,
    '',
    `  /// Dispatches this node to [visitor].`,
    `  R accept<R>(${def.name}Visitor<R> visitor);`,
    `}`,
  ].join('\n');
}

function emitClass(model: SchemaModel, index: Map<string, Def>, def: ObjectDef): string {
  const isNode = def.uirKind !== undefined;
  const union = isNode ? unionOf(model, def) : undefined;
  const supertype =
    union !== undefined ? ` extends ${union.name}` : isNode ? ' extends UirNode' : '';

  const real = def.fields.filter((f) => f.constValue === undefined);

  const lines: string[] = [];
  lines.push(docComment(def.doc));
  lines.push('@immutable');
  lines.push(`final class ${def.name}${supertype} {`);

  lines.push(`  /// Creates a [${def.name}].`);
  lines.push(`  const ${def.name}({`);
  // Required named parameters come first (Dart lint: always_put_required_named_parameters_first).
  // Within each group the order stays alphabetical, so the signature is still deterministic.
  for (const f of real.filter((x) => x.required)) lines.push(`    required this.${f.name},`);
  for (const f of real.filter((x) => !x.required)) lines.push(`    this.${f.name},`);
  lines.push(`  });`);
  lines.push('');

  lines.push(`  /// Parses a [${def.name}] from JSON, validating as it goes.`);
  lines.push(`  factory ${def.name}.fromJson(Object? value, [String path = '${def.name}']) {`);
  lines.push(`    final Map<String, Object?> json = _asObject(value, path);`);
  if (def.uirKind !== undefined) {
    lines.push(`    final String kind = _asString(_req(json, 'kind', path), '\$path.kind');`);
    lines.push(`    if (kind != '${def.uirKind}') {`);
    lines.push(`      throw UirParseError('\$path.kind', 'expected "${def.uirKind}", got "\$kind"');`);
    lines.push(`    }`);
  }
  lines.push(`    return ${def.name}(`);
  for (const f of real) {
    const read = f.required
      ? dartRead(index, f.type, `_req(json, '${f.name}', path)`, `'\$path.${f.name}'`)
      : `json['${f.name}'] == null ? null : ${dartRead(index, f.type, `json['${f.name}']`, `'\$path.${f.name}'`)}`;
    lines.push(`      ${f.name}: ${read},`);
  }
  lines.push(`    );`);
  lines.push(`  }`);
  lines.push('');

  for (const f of real) {
    lines.push(docComment(f.doc, '  '));
    lines.push(`  final ${dartFieldType(index, f.type, f.required)} ${f.name};`);
    lines.push('');
  }

  if (def.uirKind !== undefined) {
    lines.push(`  /// The node's discriminant.`);
    lines.push(`  @override`);
    lines.push(`  String get kind => '${def.uirKind}';`);
    lines.push('');
  }

  lines.push(`  /// Serializes to canonical JSON: keys sorted, nulls omitted.`);
  if (isNode) lines.push(`  @override`);
  lines.push(`  Map<String, Object?> toJson() => canonicalJson(<String, Object?>{`);
  for (const f of def.fields) {
    if (f.constValue !== undefined) {
      lines.push(`    '${f.name}': '${f.constValue}',`);
    } else {
      lines.push(`    '${f.name}': ${dartWrite(index, f.type, f.name, f.required)},`);
    }
  }
  lines.push(`  })! as Map<String, Object?>;`);
  lines.push('');

  lines.push(`  /// Returns a copy with the given fields replaced. The original is never mutated.`);
  lines.push(`  ///`);
  lines.push(`  /// An omitted argument keeps its current value; \`copyWith\` cannot set a field back to`);
  lines.push(`  /// null. Construct a new node when that is what you mean.`);
  lines.push(`  ${def.name} copyWith({`);
  for (const f of real) lines.push(`    ${dartFieldType(index, f.type, false)} ${f.name},`);
  lines.push(`  }) {`);
  lines.push(`    return ${def.name}(`);
  for (const f of real) lines.push(`      ${f.name}: ${f.name} ?? this.${f.name},`);
  lines.push(`    );`);
  lines.push(`  }`);
  lines.push('');

  if (union !== undefined) {
    lines.push(`  @override`);
    lines.push(`  R accept<R>(${union.name}Visitor<R> visitor) => visitor.visit${def.name}(this);`);
    lines.push('');
  }

  lines.push(`  @override`);
  if (real.length === 0) {
    lines.push(`  bool operator ==(Object other) => identical(this, other) || other is ${def.name};`);
  } else {
    lines.push(`  bool operator ==(Object other) {`);
    lines.push(`    if (identical(this, other)) return true;`);
    lines.push(`    return other is ${def.name} &&`);
    lines.push(
      real.map((f) => `        _equality.equals(other.${f.name}, ${f.name})`).join(' &&\n') + ';',
    );
    lines.push(`  }`);
  }
  lines.push('');

  lines.push(`  @override`);
  lines.push(`  int get hashCode => Object.hashAll(<Object?>[`);
  lines.push(`    '${def.name}',`);
  for (const f of real) lines.push(`    _equality.hash(${f.name}),`);
  lines.push(`  ]);`);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * A dispatcher over every node in the schema.
 *
 * The canonical builder constructs UIR by producing canonical JSON and handing it to this function:
 * that way the builder holds no per-node knowledge, and a schema change cannot leave a hand-written
 * factory silently behind.
 */
function emitGlobalDispatcher(model: SchemaModel): string {
  const cases = nodeDefs(model)
    .map((n) => `    case '${n.uirKind}':\n      return ${n.name}.fromJson(json, path);`)
    .join('\n');
  return [
    '/// Parses any UIR node, dispatching on `kind` across every node kind in the schema.',
    '///',
    '/// This is the only way a UIR node should be constructed from data: it guarantees that the node',
    '/// is a generated type, fully validated, with no field left unchecked.',
    "UirNode uirNodeFromJson(Object? value, [String path = 'UirNode']) {",
    '  final Map<String, Object?> json = _asObject(value, path);',
    "  final String kind = _asString(_req(json, 'kind', path), '\$path.kind');",
    '  switch (kind) {',
    cases,
    '    default:',
    "      throw UirParseError('\$path.kind', 'unknown UIR node kind \"\$kind\"');",
    '  }',
    '}',
  ].join('\n');
}

function emitVisitor(def: UnionDef): string {
  const methods = def.variants
    .map((v) => `  /// Visits a [${v}].\n  R visit${v}(${v} node);`)
    .join('\n\n');
  return [
    `/// Visitor over [${def.name}].`,
    `///`,
    `/// Exhaustive by construction: adding a variant to the schema breaks every implementation at`,
    `/// compile time, which is exactly what a compiler wants.`,
    `abstract interface class ${def.name}Visitor<R> {`,
    methods,
    `}`,
  ].join('\n');
}

/**
 * The declared Dart type of a field.
 *
 * `Object?` (the schema's free-form JSON) is already nullable, so an optional field of that type must
 * not acquire a second `?`. Dart has no `Object??`.
 */
function dartFieldType(index: Map<string, Def>, type: TypeRef, required: boolean): string {
  const declared = dartType(index, type);
  if (required || declared.endsWith('?')) return declared;
  return `${declared}?`;
}

/** Resolves an alias to the type it stands for. `NodeId` is a `String`, and has no `fromJson`. */
function resolve(index: Map<string, Def>, type: TypeRef): TypeRef {
  if (type.kind !== 'ref') return type;
  const target = index.get(type.name);
  if (target?.kind === 'alias') return resolve(index, target.type);
  return type;
}

function dartType(index: Map<string, Def>, type: TypeRef): string {
  switch (type.kind) {
    case 'ref':
      return type.name; // aliases keep their name in signatures: `NodeId` reads better than `String`
    case 'list':
      return `List<${dartType(index, type.item)}>`;
    case 'map':
      return `Map<String, ${dartType(index, type.value)}>`;
    case 'primitive':
      switch (type.primitive) {
        case 'string':
          return 'String';
        case 'integer':
          return 'int';
        case 'number':
          return 'double';
        case 'boolean':
          return 'bool';
        case 'json':
          return 'Object?';
      }
  }
}

function dartRead(index: Map<string, Def>, type: TypeRef, expr: string, path: string): string {
  const resolved = resolve(index, type);
  switch (resolved.kind) {
    case 'ref':
      return `${resolved.name}.fromJson(${expr}, ${path})`;
    case 'list':
      return `_asList<${dartType(index, resolved.item)}>(${expr}, ${path}, ${dartReader(index, resolved.item)})`;
    case 'map':
      return `_asMap<${dartType(index, resolved.value)}>(${expr}, ${path}, ${dartReader(index, resolved.value)})`;
    case 'primitive':
      switch (resolved.primitive) {
        case 'string':
          return `_asString(${expr}, ${path})`;
        case 'integer':
          return `_asInt(${expr}, ${path})`;
        case 'number':
          return `_asDouble(${expr}, ${path})`;
        case 'boolean':
          return `_asBool(${expr}, ${path})`;
        case 'json':
          return expr;
      }
  }
}

/**
 * The element reader passed to `_asList`/`_asMap`.
 *
 * A direct `X.fromJson` is emitted as a tearoff rather than as a closure that forwards to it: the
 * generated code should read the way a person would have written it.
 */
function dartReader(index: Map<string, Def>, type: TypeRef): string {
  const resolved = resolve(index, type);
  if (resolved.kind === 'ref') return `${resolved.name}.fromJson`;
  if (resolved.kind === 'primitive') {
    switch (resolved.primitive) {
      case 'string':
        return '_asString';
      case 'integer':
        return '_asInt';
      case 'number':
        return '_asDouble';
      case 'boolean':
        return '_asBool';
      case 'json':
        return '(Object? v, String p) => v';
    }
  }
  return `(Object? v, String p) => ${dartRead(index, resolved, 'v', 'p')}`;
}

function dartWrite(index: Map<string, Def>, type: TypeRef, name: string, required: boolean): string {
  const resolved = resolve(index, type);
  const q = required ? '' : '?';
  switch (resolved.kind) {
    case 'ref':
      return `${name}${q}.toJson()`;
    case 'list':
      // A list of primitives is already JSON: mapping it through an identity lambda is noise.
      if (resolve(index, resolved.item).kind === 'primitive') return name;
      return `${name}${q}.map((${dartType(index, resolved.item)} v) => ${dartWriteValue(index, resolved.item, 'v')}).toList()`;
    case 'map':
      if (resolve(index, resolved.value).kind === 'primitive') return name;
      return `${name}${q}.map((String k, ${dartType(index, resolved.value)} v) => MapEntry<String, Object?>(k, ${dartWriteValue(index, resolved.value, 'v')}))`;
    case 'primitive':
      return name;
  }
}

function dartWriteValue(index: Map<string, Def>, type: TypeRef, expr: string): string {
  const resolved = resolve(index, type);
  switch (resolved.kind) {
    case 'ref':
      return `${expr}.toJson()`;
    case 'list':
      return `${expr}.map((${dartType(index, resolved.item)} v) => ${dartWriteValue(index, resolved.item, 'v')}).toList()`;
    case 'map':
      return `${expr}.map((String k, ${dartType(index, resolved.value)} v) => MapEntry<String, Object?>(k, ${dartWriteValue(index, resolved.value, 'v')}))`;
    case 'primitive':
      return expr;
  }
}
