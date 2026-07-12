/**
 * Schema validation. Runs before generation, always.
 *
 * A code generator that accepts a broken schema produces broken models in two languages, and the
 * failure surfaces somewhere else entirely — in a Dart compile error, or worse, at runtime in a
 * user's converted app. Every rejection here is a failure the schema author sees immediately, with a
 * location.
 */

import type { ObjectDef, SchemaModel, TypeRef, UnionDef } from './parser.js';
import { compare } from './order.js';

/** One reason the schema is not fit to generate from. */
export interface SchemaViolation {
  /** A stable identifier for the rule, e.g. `duplicate-kind`. */
  readonly rule: string;
  /** The definition (and field, where relevant) at fault. */
  readonly where: string;
  /** What is wrong, addressed to whoever wrote the schema. */
  readonly message: string;
}

/**
 * Validates [model]. Returns every violation, sorted — never throws, and never stops at the first
 * problem: a schema author fixing ten things wants to see ten things.
 */
export function validate(model: SchemaModel): SchemaViolation[] {
  const violations: SchemaViolation[] = [
    ...checkDuplicateNames(model),
    ...checkDuplicateKinds(model),
    ...checkReferences(model),
    ...checkUnions(model),
    ...checkEnums(model),
    ...checkDocumentation(model),
    ...checkNodeContract(model),
    ...checkReservedNames(model),
    ...checkCycles(model),
  ];

  violations.sort(
    (a, b) => compare(a.where, b.where) || compare(a.rule, b.rule) || compare(a.message, b.message),
  );
  return violations;
}

/** Two definitions may not share a name: the generated type would collide. */
function checkDuplicateNames(model: SchemaModel): SchemaViolation[] {
  const seen = new Map<string, number>();
  for (const def of model.defs) {
    seen.set(def.name, (seen.get(def.name) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => ({
      rule: 'duplicate-name',
      where: name,
      message: `definition "${name}" is declared more than once`,
    }));
}

/**
 * Two nodes may not share a `kind`.
 *
 * `kind` is the discriminant every union dispatches on and every deserializer switches on. A
 * duplicate makes deserialization ambiguous — the node you get back depends on definition order.
 */
function checkDuplicateKinds(model: SchemaModel): SchemaViolation[] {
  const byKind = new Map<string, string[]>();
  for (const def of nodes(model)) {
    const list = byKind.get(def.uirKind!) ?? [];
    list.push(def.name);
    byKind.set(def.uirKind!, list);
  }
  return [...byKind.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([kind, owners]) => ({
      rule: 'duplicate-kind',
      where: [...owners].sort().join(', '),
      message: `kind "${kind}" is claimed by more than one node`,
    }));
}

/** Every `$ref` must resolve. */
function checkReferences(model: SchemaModel): SchemaViolation[] {
  const known = new Set(model.defs.map((d) => d.name));
  const violations: SchemaViolation[] = [];

  const walk = (type: TypeRef, where: string): void => {
    switch (type.kind) {
      case 'ref':
        if (!known.has(type.name)) {
          violations.push({
            rule: 'missing-reference',
            where,
            message: `references unknown definition "${type.name}"`,
          });
        }
        return;
      case 'list':
        walk(type.item, where);
        return;
      case 'map':
        walk(type.value, where);
        return;
      case 'primitive':
        return;
    }
  };

  for (const def of model.defs) {
    if (def.kind === 'object') {
      for (const field of def.fields) walk(field.type, `${def.name}.${field.name}`);
    } else if (def.kind === 'alias') {
      walk(def.type, def.name);
    } else if (def.kind === 'union') {
      for (const variant of def.variants) {
        if (!known.has(variant)) {
          violations.push({
            rule: 'missing-reference',
            where: def.name,
            message: `union variant "${variant}" is not defined`,
          });
        }
      }
    }
  }
  return violations;
}

/** A union may only contain nodes: dispatch is on `kind`, and a plain value object has none. */
function checkUnions(model: SchemaModel): SchemaViolation[] {
  const byName = new Map(model.defs.map((d) => [d.name, d]));
  const violations: SchemaViolation[] = [];

  for (const union of model.defs.filter((d): d is UnionDef => d.kind === 'union')) {
    if (union.variants.length === 0) {
      violations.push({ rule: 'empty-union', where: union.name, message: 'union has no variants' });
    }
    for (const variantName of union.variants) {
      const variant = byName.get(variantName);
      if (variant === undefined) continue; // reported by checkReferences
      if (variant.kind !== 'object' || variant.uirKind === undefined) {
        violations.push({
          rule: 'unknown-node-kind',
          where: `${union.name} -> ${variantName}`,
          message: `union variants must be nodes (declare "x-uir-kind"); "${variantName}" is not`,
        });
      }
    }
  }

  // A node may belong to at most one union: generated Dart uses sealed classes, and a class has one
  // supertype. A node in two unions is unrepresentable, not merely inconvenient.
  const membership = new Map<string, string[]>();
  for (const union of model.defs.filter((d): d is UnionDef => d.kind === 'union')) {
    for (const variant of union.variants) {
      membership.set(variant, [...(membership.get(variant) ?? []), union.name]);
    }
  }
  for (const [variant, unions] of membership) {
    if (unions.length > 1) {
      violations.push({
        rule: 'multiple-union-membership',
        where: variant,
        message: `node belongs to more than one union (${[...unions].sort().join(', ')}); Dart sealed classes permit one supertype`,
      });
    }
  }

  return violations;
}

/** Enum values must be unique and non-empty. */
function checkEnums(model: SchemaModel): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  for (const def of model.defs) {
    if (def.kind !== 'enum') continue;
    if (def.values.length === 0) {
      violations.push({ rule: 'invalid-enum', where: def.name, message: 'enum has no values' });
    }
    const seen = new Set<string>();
    for (const { value } of def.values) {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value)) {
        violations.push({
          rule: 'invalid-enum',
          where: `${def.name}.${value}`,
          message: `enum value "${value}" is not a valid identifier in both target languages`,
        });
      }
      if (seen.has(value)) {
        violations.push({
          rule: 'invalid-enum',
          where: `${def.name}.${value}`,
          message: `duplicate enum value "${value}"`,
        });
      }
      seen.add(value);
    }
  }
  return violations;
}

/** Every definition and every field must be documented — the docs are copied into both languages. */
function checkDocumentation(model: SchemaModel): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  for (const def of model.defs) {
    if (def.doc.trim().length === 0) {
      violations.push({ rule: 'missing-documentation', where: def.name, message: 'definition has no description' });
    }
    if (def.kind === 'object') {
      for (const field of def.fields) {
        if (field.doc.trim().length === 0) {
          violations.push({
            rule: 'missing-documentation',
            where: `${def.name}.${field.name}`,
            message: 'field has no description',
          });
        }
      }
    }
  }
  return violations;
}

/** A node must carry the base contract: a stable id, a kind discriminant, and a span. */
function checkNodeContract(model: SchemaModel): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  for (const def of nodes(model)) {
    const fields = new Map(def.fields.map((f) => [f.name, f]));

    for (const required of ['id', 'kind', 'span']) {
      if (!fields.has(required)) {
        violations.push({
          rule: 'node-contract',
          where: def.name,
          message: `node is missing the required base field "${required}" (Spec §2.3: every node has a stable id, a kind, and a span)`,
        });
      }
    }

    const kind = fields.get('kind');
    if (kind !== undefined && kind.constValue !== def.uirKind) {
      violations.push({
        rule: 'node-contract',
        where: `${def.name}.kind`,
        message: `the "kind" field's const (${String(kind.constValue)}) must equal x-uir-kind (${String(def.uirKind)})`,
      });
    }
  }
  return violations;
}

/**
 * Rejects cycles that cannot be constructed.
 *
 * Recursion is not the problem — an AST *is* recursion. `Binary.left` is an `Expr`, and `Expr`
 * includes `Binary`; that cycle is fine, because `Expr` also includes `Lit`, so a value can bottom
 * out. What is unconstructible is a type none of whose paths terminate: building one value would
 * require having already built it.
 *
 * So this is a constructibility analysis, not a cycle detector:
 *
 * * an **object** is constructible when every one of its required ref fields is constructible
 *   (arrays and optional fields terminate a path: `[]` and `null` are values);
 * * a **union** is constructible when **any** variant is.
 *
 * The least fixed point of that is computed below; anything left over is reported.
 */
function checkCycles(model: SchemaModel): SchemaViolation[] {
  const constructible = new Set<string>();

  // Primitives and aliases of primitives always terminate.
  const isConstructible = (type: TypeRef): boolean => {
    switch (type.kind) {
      case 'primitive':
        return true;
      // An array or a map may be empty, and an optional field may be absent: both terminate a path.
      case 'list':
      case 'map':
        return true;
      case 'ref':
        return constructible.has(type.name);
    }
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const def of model.defs) {
      if (constructible.has(def.name)) continue;

      let ok = false;
      if (def.kind === 'enum') {
        ok = def.values.length > 0;
      } else if (def.kind === 'alias') {
        ok = isConstructible(def.type);
      } else if (def.kind === 'object') {
        ok = def.fields.filter((f) => f.required).every((f) => isConstructible(f.type));
      } else {
        ok = def.variants.some((v) => constructible.has(v));
      }

      if (ok) {
        constructible.add(def.name);
        changed = true;
      }
    }
  }

  return model.defs
    .filter((def) => !constructible.has(def.name))
    .map((def) => ({
      rule: 'cycle',
      where: def.name,
      message:
        'type is unconstructible: every path through its required fields is recursive. ' +
        'Break the cycle with an array, an optional field, or a union variant that bottoms out.',
    }));
}

/**
 * Rejects field names that mean something else in a target language.
 *
 * Both of these were found the expensive way, while generating this very schema:
 *
 * * `override` shadows Dart's `@override` annotation *inside its own class*, so every generated
 *   override in that class silently resolves to the field and fails to compile.
 * * `constructor` is `Object.prototype.constructor` in JavaScript. `o.constructor` is therefore
 *   **never** `undefined`, so an optional field by that name is read as present, and the parser
 *   tries to validate the `Object` function as a string.
 *
 * A name that is merely awkward is a style question. A name that changes the meaning of the code
 * around it is a defect, and it must be impossible to reintroduce.
 */
function checkReservedNames(model: SchemaModel): SchemaViolation[] {
  const reserved = new Set([
    // Dart core annotations that a same-named field would shadow.
    'override',
    'deprecated',
    'pragma',
    // Dart reserved words that cannot be identifiers at all.
    'class', 'const', 'default', 'enum', 'extends', 'final', 'is', 'new', 'null', 'return',
    'super', 'switch', 'this', 'throw', 'true', 'false', 'var', 'void', 'while', 'with',
    // JavaScript prototype members: an object always "has" these, so an optional field by one of
    // these names can never be detected as absent.
    'constructor', 'prototype', '__proto__', 'valueOf', 'hasOwnProperty',
    // Members every generated class already declares.
    'hashCode', 'runtimeType', 'toString', 'toJson', 'copyWith', 'accept',
  ]);

  const violations: SchemaViolation[] = [];
  for (const def of model.defs) {
    if (def.kind !== 'object') continue;
    for (const field of def.fields) {
      if (reserved.has(field.name)) {
        violations.push({
          rule: 'reserved-name',
          where: `${def.name}.${field.name}`,
          message: `"${field.name}" is reserved in a target language (it would shadow an annotation, a keyword, or a generated member). Rename the field in the schema.`,
        });
      }
    }
  }
  return violations;
}

function nodes(model: SchemaModel): ObjectDef[] {
  return model.defs.filter((d): d is ObjectDef => d.kind === 'object' && d.uirKind !== undefined);
}
