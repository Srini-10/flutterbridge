/**
 * The TypeScript emitter.
 *
 * Produces immutable interfaces, discriminated unions, deserializers that validate, serializers,
 * structural equality, stable hashing, `copyWith`, and visitors.
 */

import type { AliasDef, EnumDef, ObjectDef, SchemaModel, TypeRef, UnionDef } from '../parser.js';
import { camel, docComment, enumDefs, nodeDefs, unionDefs, valueDefs } from './common.js';
import { banner } from './templates/banner.js';

/** Generates the single TypeScript module for [model]. */
export function generateTypeScript(model: SchemaModel): string {
  const out: string[] = [banner(model.uirVersion), ''];

  out.push(
    '/* eslint-disable */',
    '',
    "import { createHash } from 'node:crypto';",
    '',
    '/** The UIR schema version this module was generated from. */',
    `export const UIR_VERSION = '${model.uirVersion}' as const;`,
    '',
    '/** A hash of the schema sources this module was generated from. */',
    `export const UIR_SCHEMA_HASH = '${model.schemaHash}' as const;`,
    '',
    tsReferenceFieldMap(model),
    '',
    prelude(model),
    '',
  );

  for (const def of enumDefs(model)) out.push(emitEnum(def), '', emitEnumParse(def), '');
  for (const def of model.defs.filter((d): d is AliasDef => d.kind === 'alias')) {
    out.push(
      docComment(def.doc),
      `export type ${def.name} = ${tsType(def.type)};`,
      '',
      `/** Parses a {@link ${def.name}}. */`,
      `export function parse${def.name}(value: unknown, path = '${def.name}'): ${def.name} {`,
      `  return ${tsRead(def.type, 'value', 'path')};`,
      `}`,
      '',
    );
  }
  for (const def of [...valueDefs(model), ...nodeDefs(model)]) out.push(emitInterface(def), '');
  for (const def of unionDefs(model)) out.push(emitUnion(def), '');

  for (const def of [...valueDefs(model), ...nodeDefs(model)]) {
    out.push(emitParse(def), '', emitSerialize(def), '', emitEquals(def), '', emitCopyWith(def), '');
  }
  for (const def of unionDefs(model)) {
    out.push(emitUnionParse(model, def), '', emitUnionSerialize(def), '', emitVisitor(model, def), '');
  }

  out.push(emitGlobalDispatcher(model), '');
  out.push(emitHash(), '');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** The primitives the schema actually uses. */
function usedPrimitives(model: SchemaModel): Set<string> {
  const used = new Set<string>();
  const walk = (type: TypeRef): void => {
    if (type.kind === 'primitive') used.add(type.primitive);
    else if (type.kind === 'list') walk(type.item);
    else if (type.kind === 'map') walk(type.value);
  };
  for (const def of model.defs) {
    if (def.kind === 'object') for (const f of def.fields) walk(f.type);
    else if (def.kind === 'alias') walk(def.type);
  }
  return used;
}

function prelude(model: SchemaModel): string {
  const used = usedPrimitives(model);
  const parts: string[] = [PRELUDE_CORE];
  if (used.has('string')) parts.push(HELPER_STRING);
  if (used.has('integer')) parts.push(HELPER_INT);
  if (used.has('number')) parts.push(HELPER_NUMBER);
  if (used.has('boolean')) parts.push(HELPER_BOOL);
  parts.push(PRELUDE_TAIL);
  return parts.join('\n\n');
}

const HELPER_STRING = `function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new UirParseError(path, 'expected a string');
  return value;
}`;

const HELPER_INT = `function asInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new UirParseError(path, 'expected an integer');
  }
  return value;
}`;

const HELPER_NUMBER = `function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number') throw new UirParseError(path, 'expected a number');
  return value;
}`;

const HELPER_BOOL = `function asBool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new UirParseError(path, 'expected a boolean');
  return value;
}`;

const PRELUDE_CORE = `/** Raised when JSON does not conform to the schema. Deserialization validates; it never guesses. */
export class UirParseError extends Error {
  constructor(readonly path: string, message: string) {
    super(\`\${path}: \${message}\`);
    this.name = 'UirParseError';
  }
}

/**
 * Reads an own property.
 *
 * Never \`json[key]\`: a plain object inherits \`constructor\`, \`toString\` and friends from
 * Object.prototype, so a plain lookup can return a function for a field the document never set.
 */
function own(json: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(json, key) ? json[key] : undefined;
}

function req(json: Record<string, unknown>, key: string, path: string): unknown {
  const value = own(json, key);
  if (value === undefined || value === null) {
    throw new UirParseError(\`\${path}.\${key}\`, 'required field is missing');
  }
  return value;
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UirParseError(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}`;

const PRELUDE_TAIL = `function asList<T>(value: unknown, path: string, item: (v: unknown, p: string) => T): readonly T[] {
  if (!Array.isArray(value)) throw new UirParseError(path, 'expected an array');
  return value.map((v, i) => item(v, \`\${path}[\${i}]\`));
}

function asMap<T>(
  value: unknown,
  path: string,
  item: (v: unknown, p: string) => T,
): Readonly<Record<string, T>> {
  const raw = asObject(value, path);
  const out: Record<string, T> = {};
  for (const key of Object.keys(raw).sort()) out[key] = item(raw[key], \`\${path}.\${key}\`);
  return out;
}

function asEnum<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  const s = asString(value, path);
  if (!(values as readonly string[]).includes(s)) {
    throw new UirParseError(path, \`expected one of \${values.join(' | ')}, got "\${s}"\`);
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
 * Not \`JSON.stringify\`. A host's encoder formats numbers the way *that host* likes: Dart writes the
 * double 100.0 as \`100.0\` and JavaScript writes it as \`100\`; JavaScript writes \`-0\` as \`0\` and loses
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
  // thresholds. It never emits a trailing \`.0\`, so there is nothing to strip.
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
  if (Array.isArray(value)) return \`[\${value.map(encode).join(',')}]\`;
  if (typeof value === 'object') {
    // Already sorted by canonicalJson. Sorting again would be a second opinion about key order.
    const entries = Object.entries(value as Record<string, unknown>);
    return \`{\${entries.map(([k, v]) => \`\${JSON.stringify(k)}:\${encode(v)}\`).join(',')}}\`;
  }
  throw new TypeError(\`not JSON-representable: \${typeof value}\`);
}

/** How many hex characters of the digest an id keeps (Spec §2.3). */
export const NODE_ID_LENGTH = 16;

/**
 * Strips \`id\`, \`anchor\` and \`span\` from a value and from **everything inside it**.
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
    .update(\`\${tier}:\${payload}\`, 'utf8')
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
}`;

/** Node kind -> the fields of that node which hold `NodeId` references. See the Dart emitter. */
function tsReferenceFieldMap(model: SchemaModel): string {
  const isNodeId = (type: TypeRef): boolean =>
    (type.kind === 'ref' && type.name === 'NodeId') ||
    (type.kind === 'list' && type.item.kind === 'ref' && type.item.name === 'NodeId');

  const entries = nodeDefs(model)
    .map((node) => {
      const fields = node.fields.filter((f) => isNodeId(f.type)).map((f) => f.name);
      return fields.length === 0
        ? null
        : `  '${node.uirKind}': [${fields.map((f) => `'${f}'`).join(', ')}],`;
    })
    .filter((line): line is string => line !== null);

  return [
    '/** Node kind -> the fields of that node which hold `NodeId` references. */',
    'export const UIR_REFERENCE_FIELDS: Readonly<Record<string, readonly string[]>> = {',
    ...entries,
    '};',
  ].join('\n');
}

function emitEnum(def: EnumDef): string {
  const members = def.values
    .map((v) => `${docComment(v.doc, '  ')}\n  ${v.value}: '${v.value}',`)
    .join('\n');
  return [
    docComment(def.doc),
    `export const ${def.name} = {`,
    members,
    '} as const;',
    '',
    docComment(def.doc),
    `export type ${def.name} = (typeof ${def.name})[keyof typeof ${def.name}];`,
    '',
    `const ${camel(def.name)}Values = Object.values(${def.name}) as readonly ${def.name}[];`,
  ].join('\n');
}

function emitInterface(def: ObjectDef): string {
  const fields = def.fields
    .map((f) => {
      const type = f.constValue !== undefined ? `'${f.constValue}'` : tsType(f.type);
      return `${docComment(f.doc, '  ')}\n  readonly ${f.name}${f.required ? '' : '?'}: ${type};`;
    })
    .join('\n');
  return [docComment(def.doc), `export interface ${def.name} {`, fields, '}'].join('\n');
}

function emitUnion(def: UnionDef): string {
  return [
    docComment(def.doc),
    `export type ${def.name} =`,
    def.variants.map((v) => `  | ${v}`).join('\n'),
    ';',
  ].join('\n');
}

function emitParse(def: ObjectDef): string {
  const assigns = def.fields
    .map((f) => {
      if (f.constValue !== undefined) return `    ${f.name}: '${f.constValue}',`;
      if (f.required) {
        return `    ${f.name}: ${tsRead(f.type, `req(o, '${f.name}', path)`, `\`\${path}.${f.name}\``)},`;
      }
      // An absent optional field is omitted entirely, never set to `undefined`
      // (exactOptionalPropertyTypes): "the key is missing" and "the key is undefined" are different
      // statements, and the schema means the first one.
      const read = tsRead(f.type, `own(o, '${f.name}')`, `\`\${path}.${f.name}\``);
      return `    ...(own(o, '${f.name}') === undefined || own(o, '${f.name}') === null ? {} : { ${f.name}: ${read} }),`;
    })
    .join('\n');

  const kindCheck =
    def.uirKind === undefined
      ? ''
      : `  const kind = asString(req(o, 'kind', path), \`\${path}.kind\`);\n  if (kind !== '${def.uirKind}') throw new UirParseError(\`\${path}.kind\`, \`expected "${def.uirKind}", got "\${kind}"\`);\n`;

  return [
    `/** Parses a {@link ${def.name}}, validating as it goes. Throws {@link UirParseError} on bad input. */`,
    `export function parse${def.name}(value: unknown, path = '${def.name}'): ${def.name} {`,
    `  const o = asObject(value, path);`,
    kindCheck,
    `  return {`,
    assigns,
    `  };`,
    `}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function emitSerialize(def: ObjectDef): string {
  return [
    `/** Serializes a {@link ${def.name}} to canonical JSON. */`,
    `export function serialize${def.name}(node: ${def.name}): Record<string, unknown> {`,
    `  return canonicalJson(node) as Record<string, unknown>;`,
    `}`,
  ].join('\n');
}

function emitEquals(def: ObjectDef): string {
  return [
    `/** Structural equality. List order is significant: UIR children are ordered (Spec §2.3). */`,
    `export function equals${def.name}(a: ${def.name}, b: ${def.name}): boolean {`,
    `  return deepEquals(canonicalJson(a), canonicalJson(b));`,
    `}`,
  ].join('\n');
}

function emitCopyWith(def: ObjectDef): string {
  return [
    `/** Returns a copy of [node] with [patch] applied. The original is never mutated. */`,
    `export function copyWith${def.name}(node: ${def.name}, patch: Partial<${def.name}>): ${def.name} {`,
    `  return { ...node, ...patch };`,
    `}`,
  ].join('\n');
}

function emitUnionParse(model: SchemaModel, def: UnionDef): string {
  const cases = def.variants
    .map((variant) => {
      const node = model.defs.find((d) => d.name === variant) as ObjectDef;
      return `    case '${node.uirKind}':\n      return parse${variant}(o, path);`;
    })
    .join('\n');

  return [
    `/** Parses any {@link ${def.name}}, dispatching on \`kind\`. */`,
    `export function parse${def.name}(value: unknown, path = '${def.name}'): ${def.name} {`,
    `  const o = asObject(value, path);`,
    `  const kind = asString(req(o, 'kind', path), \`\${path}.kind\`);`,
    `  switch (kind) {`,
    cases,
    `    default:`,
    `      throw new UirParseError(\`\${path}.kind\`, \`unknown ${def.name} kind "\${kind}"\`);`,
    `  }`,
    `}`,
  ].join('\n');
}

function emitUnionSerialize(def: UnionDef): string {
  return [
    `/** Serializes any {@link ${def.name}} to canonical JSON. */`,
    `export function serialize${def.name}(node: ${def.name}): Record<string, unknown> {`,
    `  return canonicalJson(node) as Record<string, unknown>;`,
    `}`,
  ].join('\n');
}

function emitVisitor(model: SchemaModel, def: UnionDef): string {
  const methods = def.variants.map((v) => `  visit${v}(node: ${v}): R;`).join('\n');
  const cases = def.variants
    .map((v) => {
      const node = model.defs.find((d) => d.name === v) as ObjectDef;
      return `    case '${node.uirKind}':\n      return visitor.visit${v}(node as ${v});`;
    })
    .join('\n');

  return [
    `/** Visitor over {@link ${def.name}}. Exhaustive: adding a variant breaks every implementation, on purpose. */`,
    `export interface ${def.name}Visitor<R> {`,
    methods,
    `}`,
    ``,
    `/** Dispatches [node] to [visitor]. */`,
    `export function accept${def.name}<R>(node: ${def.name}, visitor: ${def.name}Visitor<R>): R {`,
    `  switch (node.kind) {`,
    cases,
    `    default:`,
    `      throw new UirParseError('${def.name}', `,
    "        `unknown kind \"${(node as { kind: string }).kind}\"`,",
    `      );`,
    `  }`,
    `}`,
  ].join('\n');
}

function emitEnumParse(def: EnumDef): string {
  return [
    `/** Parses a {@link ${def.name}}. Rejects any value outside the enum. */`,
    `export function parse${def.name}(value: unknown, path = '${def.name}'): ${def.name} {`,
    `  return asEnum(value, path, ${camel(def.name)}Values);`,
    `}`,
  ].join('\n');
}

/** A dispatcher over every node in the schema. See the Dart emitter for the rationale. */
function emitGlobalDispatcher(model: SchemaModel): string {
  const nodes = nodeDefs(model);
  const cases = nodes
    .map((n) => `    case '${n.uirKind}':\n      return parse${n.name}(o, path);`)
    .join('\n');
  const union = nodes.map((n) => n.name).join(' | ');
  return [
    '/** Any UIR node. */',
    `export type AnyUirNode = ${union};`,
    '',
    '/** Parses any UIR node, dispatching on `kind` across every node kind in the schema. */',
    "export function parseUirNode(value: unknown, path = 'UirNode'): AnyUirNode {",
    '  const o = asObject(value, path);',
    "  const kind = asString(req(o, 'kind', path), `${path}.kind`);",
    '  switch (kind) {',
    cases,
    '    default:',
    '      throw new UirParseError(`${path}.kind`, `unknown UIR node kind "${kind}"`);',
    '  }',
    '}',
  ].join('\n');
}

function emitHash(): string {
  return [
    '/**',
    ' * A stable structural hash of any UIR value.',
    ' *',
    ' * Computed over canonical JSON, so it depends only on content — never on key insertion order or',
    ' * on the order the compiler happened to build the value in (D1–D5).',
    ' */',
    'export function hashUir(value: unknown): number {',
    '  const text = JSON.stringify(canonicalJson(value));',
    '  let hash = 0x811c9dc5;',
    '  for (let i = 0; i < text.length; i++) {',
    '    hash ^= text.charCodeAt(i);',
    '    hash = Math.imul(hash, 0x01000193) >>> 0;',
    '  }',
    '  return hash >>> 0;',
    '}',
  ].join('\n');
}

function tsType(type: TypeRef): string {
  switch (type.kind) {
    case 'ref':
      return type.name;
    case 'list':
      return `readonly ${tsType(type.item)}[]`;
    case 'map':
      return `Readonly<Record<string, ${tsType(type.value)}>>`;
    case 'primitive':
      switch (type.primitive) {
        case 'string':
          return 'string';
        case 'integer':
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'json':
          return 'unknown';
      }
  }
}

/** The element reader handed to `asList`/`asMap`. Declares only the parameters it uses. */
function tsReader(type: TypeRef): string {
  if (type.kind === 'primitive' && type.primitive === 'json') return '(v) => v';
  return `(v, p) => ${tsRead(type, 'v', 'p')}`;
}

/** How a value of [type] is read from `unknown`, with validation. */
function tsRead(type: TypeRef, expr: string, path: string): string {
  switch (type.kind) {
    case 'ref':
      return `parse${type.name}(${expr}, ${path})`;
    case 'list':
      return `asList(${expr}, ${path}, ${tsReader(type.item)})`;
    case 'map':
      return `asMap(${expr}, ${path}, ${tsReader(type.value)})`;
    case 'primitive':
      switch (type.primitive) {
        case 'string':
          return `asString(${expr}, ${path})`;
        case 'integer':
          return `asInt(${expr}, ${path})`;
        case 'number':
          return `asNumber(${expr}, ${path})`;
        case 'boolean':
          return `asBool(${expr}, ${path})`;
        case 'json':
          return expr;
      }
  }
}
