#!/usr/bin/env node
/**
 * The schema-codegen command line.
 *
 *   schema-codegen generate    # validate the schema, then write both generated libraries
 *   schema-codegen validate    # validate only
 *   schema-codegen check       # generate into memory and fail if it differs from what is on disk
 *
 * `check` is the drift gate. Generated code is committed (so a checkout builds without running a
 * generator first), which means a stale generated file is possible — and a stale UIR model is a
 * model that silently disagrees with the schema. CI runs `check`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateDart } from './generator/dart.js';
import { generateTypeScript } from './generator/typescript.js';
import { parseSchemas, SchemaError } from './parser.js';
import { validate, type SchemaViolation } from './validators.js';

/** Where everything lives, relative to the repository root. */
const SCHEMA_DIR = 'packages/uir/schema';
const DART_OUT = 'dart/bridge_uir/lib/generated/uir.dart';
const TS_OUT = 'packages/uir/src/generated/uir.ts';

interface Artifact {
  readonly path: string;
  readonly contents: string;
}

function build(root: string): Artifact[] {
  const model = parseSchemas(resolve(root, SCHEMA_DIR));

  const violations: SchemaViolation[] = validate(model);
  if (violations.length > 0) {
    console.error(`schema-codegen: ${violations.length} schema violation(s):\n`);
    for (const violation of violations) {
      console.error(`  [${violation.rule}] ${violation.where}: ${violation.message}`);
    }
    console.error('\nNothing was generated. A broken schema produces broken models in two languages.');
    process.exit(1);
  }

  return [
    { path: resolve(root, DART_OUT), contents: generateDart(model) },
    { path: resolve(root, TS_OUT), contents: generateTypeScript(model) },
  ];
}

function main(): void {
  const command = process.argv[2] ?? 'generate';
  const root = process.cwd();

  switch (command) {
    case 'validate': {
      const model = parseSchemas(resolve(root, SCHEMA_DIR));
      const violations = validate(model);
      if (violations.length > 0) {
        for (const v of violations) console.error(`  [${v.rule}] ${v.where}: ${v.message}`);
        process.exit(1);
      }
      console.log(`schema-codegen: schema is valid (${model.defs.length} definitions, UIR ${model.uirVersion})`);
      return;
    }

    case 'generate': {
      const artifacts = build(root);
      for (const artifact of artifacts) {
        mkdirSync(dirname(artifact.path), { recursive: true });
        writeFileSync(artifact.path, artifact.contents, 'utf8');
        console.log(`schema-codegen: wrote ${artifact.path}`);
      }
      return;
    }

    case 'check': {
      const artifacts = build(root);
      const stale: string[] = [];
      for (const artifact of artifacts) {
        let onDisk: string;
        try {
          onDisk = readFileSync(artifact.path, 'utf8');
        } catch {
          stale.push(`${artifact.path} (missing)`);
          continue;
        }
        if (onDisk !== artifact.contents) stale.push(artifact.path);
      }
      if (stale.length > 0) {
        console.error('schema-codegen: generated code is stale:\n');
        for (const path of stale) console.error(`  ${path}`);
        console.error('\nRun `pnpm codegen` and commit the result.');
        process.exit(1);
      }
      console.log('schema-codegen: generated code matches the schema');
      return;
    }

    default:
      console.error(`schema-codegen: unknown command "${command}" (expected generate | validate | check)`);
      process.exit(2);
  }
}

try {
  main();
} catch (error) {
  if (error instanceof SchemaError) {
    console.error(`schema-codegen: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
