/**
 * Naming, ordering, and documentation shared by both language generators.
 *
 * Anything that decides *order* lives here, so that determinism is a property of one module rather
 * than a habit two generators have to remember.
 */

import type { Def, EnumDef, ObjectDef, SchemaModel, UnionDef } from '../parser.js';
import { compare } from '../order.js';

/** Nodes (objects with a `kind`), sorted by name. */
export function nodeDefs(model: SchemaModel): ObjectDef[] {
  return model.defs
    .filter((d): d is ObjectDef => d.kind === 'object' && d.uirKind !== undefined)
    .sort(byName);
}

/** Plain value objects (no `kind`), sorted by name. */
export function valueDefs(model: SchemaModel): ObjectDef[] {
  return model.defs
    .filter((d): d is ObjectDef => d.kind === 'object' && d.uirKind === undefined && d.isAbstract !== true)
    .sort(byName);
}

/** Unions, sorted by name. */
export function unionDefs(model: SchemaModel): UnionDef[] {
  return model.defs.filter((d): d is UnionDef => d.kind === 'union').sort(byName);
}

/** Enums, sorted by name. */
export function enumDefs(model: SchemaModel): EnumDef[] {
  return model.defs.filter((d): d is EnumDef => d.kind === 'enum').sort(byName);
}

/** The union a node belongs to, if any. Validated to be at most one. */
export function unionOf(model: SchemaModel, node: ObjectDef): UnionDef | undefined {
  return unionDefs(model).find((u) => u.variants.includes(node.name));
}

function byName(a: Def, b: Def): number {
  return compare(a.name, b.name);
}

/** `UiElement` → `uiElement`. */
export function camel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Renders a schema description as a documentation comment.
 *
 * Documentation is copied verbatim from the schema into both languages: the schema is the single
 * place a UIR node is explained, and a model nobody can read without opening the compiler is a model
 * nobody will use correctly.
 */
export function docComment(doc: string, indent = ''): string {
  return doc
    .trim()
    .split('\n')
    .map((line) => `${indent}/// ${line}`.trimEnd())
    .join('\n');
}
