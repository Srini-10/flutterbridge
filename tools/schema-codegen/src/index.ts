/**
 * `@bridge/schema-codegen` — the UIR model generator.
 *
 * One schema, two languages. Neither TypeScript nor Dart hand-writes a UIR type (Spec §2.5): the
 * schema is the single source of truth, and a drift check in CI fails the build if a generated file
 * no longer matches it.
 */

export { generateDart } from './generator/dart.js';
export { generateTypeScript } from './generator/typescript.js';
export { parseSchemas, SchemaError } from './parser.js';
export type {
  AliasDef,
  Def,
  EnumDef,
  EnumValue,
  Field,
  ObjectDef,
  SchemaModel,
  TypeRef,
  UnionDef,
} from './parser.js';
export { validate } from './validators.js';
export type { SchemaViolation } from './validators.js';
