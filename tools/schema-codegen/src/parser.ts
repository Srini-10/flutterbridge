/**
 * The UIR schema dialect, and the parser that reads it into a language-neutral model.
 *
 * The schema files are valid JSON Schema 2020-12, but the generator only understands a deliberately
 * small subset of it. A general JSON Schema compiler is a research project; a constrained dialect is
 * a tool. Anything outside the dialect is rejected by the validator rather than half-supported —
 * silent partial support is how a code generator starts lying about its input.
 *
 * ## The dialect
 *
 * | Construct | Meaning |
 * | --- | --- |
 * | `{"type": "object", "properties": …}` | a value object |
 * | `{"type": "object", "x-uir-kind": "ui.Element"}` | a **node**: gets the UirNode base fields and a `kind` discriminant |
 * | `{"oneOf": [$ref, …], "x-uir-union": true}` | a sealed union, discriminated on `kind` |
 * | `{"enum": ["a", "b"]}` | a string enum |
 * | `{"type": "string"}` (top-level def) | a named string alias, e.g. NodeId |
 * | `{"allOf": [{$ref: base}, {inline object}]}` | object extension; exactly one base ref plus one inline object |
 * | `{"type": "array", "items": …}` | an ordered list — **order is semantic** (see `children ordering`) |
 * | `{"type": "object", "additionalProperties": …}` | a string-keyed map |
 * | `{"$ref": "l2.json#/$defs/UiNode"}` | a reference |
 *
 * Every definition and every property **must** carry a `description`. The validator rejects the
 * schema otherwise: documentation is copied into both generated languages, and an undocumented model
 * is one nobody can use without reading the compiler.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compare } from './order.js';

/** A reference to a named definition, e.g. `UiNode`. */
export interface RefType {
  readonly kind: 'ref';
  readonly name: string;
}

/** A JSON primitive. */
export interface PrimitiveType {
  readonly kind: 'primitive';
  readonly primitive: 'string' | 'integer' | 'number' | 'boolean' | 'json';
}

/** An ordered list. Order is significant and preserved by every generator. */
export interface ListType {
  readonly kind: 'list';
  readonly item: TypeRef;
}

/** A string-keyed map. Iteration order is canonical (sorted), never insertion order. */
export interface MapType {
  readonly kind: 'map';
  readonly value: TypeRef;
}

/** Any type expressible in the dialect. */
export type TypeRef = RefType | PrimitiveType | ListType | MapType;

/** One field of an object. */
export interface Field {
  readonly name: string;
  readonly type: TypeRef;
  readonly required: boolean;
  readonly doc: string;
  /** Set when the field is a fixed discriminant, e.g. `kind: "ui.Element"`. */
  readonly constValue?: string;
}

/** A value object, or a node when [uirKind] is set. */
export interface ObjectDef {
  readonly kind: 'object';
  readonly name: string;
  readonly doc: string;
  readonly layer: string;
  /** The `kind` discriminant, for nodes. Absent for plain value objects. */
  readonly uirKind?: string;
  readonly fields: readonly Field[];
  /**
   * A base object whose fields this one inherits, via `allOf`.
   *
   * Resolved and merged away by the parser: the model a generator sees has every field already
   * flattened, so no generator has to understand schema inheritance.
   */
  readonly extendsName?: string;
  /** Set for base objects that exist only to be extended. Never emitted as a type. */
  readonly isAbstract?: boolean;
}

/** A sealed union, discriminated on `kind`. */
export interface UnionDef {
  readonly kind: 'union';
  readonly name: string;
  readonly doc: string;
  readonly layer: string;
  readonly variants: readonly string[];
}

/** A string enum. */
export interface EnumDef {
  readonly kind: 'enum';
  readonly name: string;
  readonly doc: string;
  readonly layer: string;
  readonly values: readonly EnumValue[];
}

/** One member of a string enum. */
export interface EnumValue {
  readonly value: string;
  readonly doc: string;
}

/** A named string alias, e.g. `NodeId`. */
export interface AliasDef {
  readonly kind: 'alias';
  readonly name: string;
  readonly doc: string;
  readonly layer: string;
  readonly type: TypeRef;
}

/** Any definition in the schema. */
export type Def = ObjectDef | UnionDef | EnumDef | AliasDef;

/** The whole schema, as one language-neutral model. */
export interface SchemaModel {
  readonly uirVersion: string;
  /**
   * A hash of the schema sources.
   *
   * Stamped into every emitted manifest, so a UIR document always says which schema produced it. A
   * document whose schema hash a consumer does not recognise is one it must not guess at.
   */
  readonly schemaHash: string;
  /** Every definition, sorted by name. Sorted at construction: generation must be deterministic. */
  readonly defs: readonly Def[];
}

/** Raised when the schema is outside the dialect. Carries a location the author can act on. */
export class SchemaError extends Error {
  constructor(
    readonly where: string,
    message: string,
  ) {
    super(`${where}: ${message}`);
    this.name = 'SchemaError';
  }
}

type Json = Record<string, unknown>;

/** Files that make up the schema, in layer order. `shared` first: everything else references it. */
const SCHEMA_FILES = ['shared.json', 'l0.json', 'l1.json', 'l2.json', 'l3.json'] as const;

/**
 * Reads every schema file in [schemaDir] and produces the model.
 *
 * Throws [SchemaError] for anything outside the dialect. Semantic checks (dangling refs, cycles,
 * duplicate kinds) belong to `validators.ts` and run against the model this produces.
 */
export function parseSchemas(schemaDir: string): SchemaModel {
  const present = new Set(readdirSync(schemaDir).filter((f) => f.endsWith('.json')));
  for (const file of SCHEMA_FILES) {
    if (!present.has(file)) {
      throw new SchemaError(schemaDir, `missing schema file "${file}"`);
    }
  }

  const defs: Def[] = [];
  let uirVersion: string | undefined;

  // Hashed in fixed file order over the raw bytes: the hash must depend on the schema and on nothing
  // else — not on the order a directory listing happened to return.
  const hash = createHash('sha256');

  for (const file of SCHEMA_FILES) {
    const raw = readFileSync(join(schemaDir, file), 'utf8');
    hash.update(raw);
    const doc = JSON.parse(raw) as Json;
    const layer = requireString(doc, 'x-uir-layer', file);

    if (file === 'shared.json') {
      uirVersion = requireString(doc, 'x-uir-version', file);
    }

    const rawDefs = doc.$defs;
    if (rawDefs === undefined || typeof rawDefs !== 'object') {
      throw new SchemaError(file, 'missing $defs');
    }

    for (const [name, raw] of Object.entries(rawDefs as Json)) {
      defs.push(parseDef(name, raw as Json, layer, `${file}#/$defs/${name}`));
    }
  }

  if (uirVersion === undefined) {
    throw new SchemaError('shared.json', 'missing x-uir-version');
  }

  const merged = flattenInheritance(defs);

  // Sorted at construction. Every downstream consumer inherits determinism instead of having to
  // remember to sort (D1–D5).
  merged.sort((a, b) => compare(a.name, b.name));

  return { uirVersion, schemaHash: hash.digest('hex').slice(0, 16), defs: merged };
}

/**
 * Flattens `allOf` inheritance, so that generators never see it.
 *
 * A node's own field wins over the base's when both declare it — that is how `kind` narrows from the
 * base's open `string` to the node's `const`.
 */
function flattenInheritance(defs: Def[]): Def[] {
  const byName = new Map<string, Def>(defs.map((d) => [d.name, d]));

  return defs.map((def) => {
    if (def.kind !== 'object' || def.extendsName === undefined) return def;

    const base = byName.get(def.extendsName);
    if (base === undefined || base.kind !== 'object') {
      throw new SchemaError(def.name, `allOf base "${def.extendsName}" is not a defined object`);
    }

    const own = new Map(def.fields.map((f) => [f.name, f]));
    const fields: Field[] = [
      ...base.fields.filter((f) => !own.has(f.name)),
      ...def.fields,
    ].sort((a, b) => compare(a.name, b.name));

    return { ...def, fields };
  });
}

function parseDef(name: string, raw: Json, layer: string, where: string): Def {
  const doc = requireString(raw, 'description', where);

  if (Array.isArray(raw.oneOf)) {
    if (raw['x-uir-union'] !== true) {
      throw new SchemaError(where, 'oneOf requires "x-uir-union": true');
    }
    const variants = raw.oneOf.map((v, i) => {
      const ref = (v as Json).$ref;
      if (typeof ref !== 'string') {
        throw new SchemaError(where, `oneOf[${i}] must be a $ref`);
      }
      return refName(ref, where);
    });
    return { kind: 'union', name, doc, layer, variants: [...variants].sort() };
  }

  if (Array.isArray(raw.enum)) {
    const docs = (raw['x-uir-enum-docs'] ?? {}) as Record<string, string>;
    const values = raw.enum.map((value) => {
      if (typeof value !== 'string') {
        throw new SchemaError(where, 'only string enums are supported');
      }
      const valueDoc = docs[value];
      if (valueDoc === undefined || valueDoc.length === 0) {
        throw new SchemaError(where, `enum value "${value}" has no entry in x-uir-enum-docs`);
      }
      return { value, doc: valueDoc };
    });
    return { kind: 'enum', name, doc, layer, values };
  }

  if (Array.isArray(raw.allOf)) {
    if (raw.allOf.length !== 2) {
      throw new SchemaError(where, 'allOf must be exactly [ {$ref: base}, {inline object} ]');
    }
    const [baseRaw, ownRaw] = raw.allOf as [Json, Json];
    const baseRef = baseRaw.$ref;
    if (typeof baseRef !== 'string') {
      throw new SchemaError(where, 'allOf[0] must be a $ref to a base object');
    }
    const own = parseObject(name, ownRaw, layer, doc, where, raw['x-uir-kind']);
    return { ...own, extendsName: refName(baseRef, where) };
  }

  if (raw.type === 'object') {
    const object = parseObject(name, raw, layer, doc, where, raw['x-uir-kind']);
    return raw['x-uir-abstract'] === true ? { ...object, isAbstract: true } : object;
  }

  if (raw.type === 'string' || raw.type === 'integer' || raw.type === 'number') {
    return { kind: 'alias', name, doc, layer, type: parseType(raw, where) };
  }

  throw new SchemaError(where, 'definition is outside the dialect (expected object, oneOf, enum, or string alias)');
}

function parseObject(
  name: string,
  raw: Json,
  layer: string,
  doc: string,
  where: string,
  uirKind: unknown,
): ObjectDef {
  if (raw.additionalProperties !== false) {
    throw new SchemaError(where, 'objects must declare "additionalProperties": false');
  }

  const properties = (raw.properties ?? {}) as Json;
  const required = new Set((raw.required as string[] | undefined) ?? []);

  const fields: Field[] = Object.entries(properties).map(([fieldName, rawField]) => {
    const field = rawField as Json;
    const fieldWhere = `${where}/${fieldName}`;
    const fieldDoc = requireString(field, 'description', fieldWhere);
    const constValue = typeof field.const === 'string' ? field.const : undefined;
    return {
      name: fieldName,
      type: parseType(field, fieldWhere),
      required: required.has(fieldName),
      doc: fieldDoc,
      ...(constValue === undefined ? {} : { constValue }),
    };
  });

  // Sorted by name: field order in the generated model must not depend on JSON key order.
  fields.sort((a, b) => compare(a.name, b.name));

  if (uirKind !== undefined && typeof uirKind !== 'string') {
    throw new SchemaError(where, 'x-uir-kind must be a string');
  }

  return {
    kind: 'object',
    name,
    doc,
    layer,
    ...(uirKind === undefined ? {} : { uirKind }),
    fields,
  };
}

function parseType(raw: Json, where: string): TypeRef {
  if (typeof raw.$ref === 'string') {
    return { kind: 'ref', name: refName(raw.$ref, where) };
  }
  if (raw.type === 'array') {
    if (raw.items === undefined) {
      throw new SchemaError(where, 'array requires "items"');
    }
    return { kind: 'list', item: parseType(raw.items as Json, where) };
  }
  if (raw.type === 'object') {
    const value = raw.additionalProperties;
    if (value === undefined || typeof value !== 'object') {
      throw new SchemaError(where, 'inline objects must be maps: give "additionalProperties" a schema');
    }
    return { kind: 'map', value: parseType(value as Json, where) };
  }
  if (raw.type === 'string') return { kind: 'primitive', primitive: 'string' };
  if (raw.type === 'integer') return { kind: 'primitive', primitive: 'integer' };
  if (raw.type === 'number') return { kind: 'primitive', primitive: 'number' };
  if (raw.type === 'boolean') return { kind: 'primitive', primitive: 'boolean' };
  if (raw['x-uir-json'] === true) return { kind: 'primitive', primitive: 'json' };

  throw new SchemaError(where, 'type is outside the dialect');
}

function refName(ref: string, where: string): string {
  const match = /#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
  if (match === null) {
    throw new SchemaError(where, `unsupported $ref "${ref}" (expected "<file>#/$defs/<Name>")`);
  }
  return match[1]!;
}

function requireString(raw: Json, key: string, where: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new SchemaError(where, `missing or empty "${key}"`);
  }
  return value;
}
