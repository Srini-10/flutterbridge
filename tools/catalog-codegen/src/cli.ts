#!/usr/bin/env node
// Generates the framework widget catalogs for both language domains from one JSON source (ADR-18).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateDart } from './dart.js';
import { generateTypeScript } from './typescript.js';
import { parseCatalog } from './model.js';

const ROOT = resolve(import.meta.dirname, '../../..');

const TARGETS = [
  {
    source: 'catalog/widgets/material.json',
    dart: 'dart/bridge_analyzer/lib/src/session/adapters/widget/generated/material_catalog.dart',
    typescript: 'packages/adapters/widgets-material/src/generated/material_catalog.ts',
  },
];

/**
 * `--check` verifies the generated files match the catalog, and fails if they do not.
 *
 * A generated file somebody hand-edited is a fact stated twice again — quietly, and with the JSON no
 * longer the source of truth (ADR-18). CI fails on it, exactly as it does for the UIR schema.
 */
const check = process.argv.includes('--check');
let drift = false;

for (const target of TARGETS) {
  const path = resolve(ROOT, target.source);
  const catalog = parseCatalog(JSON.parse(readFileSync(path, 'utf8')), target.source);

  for (const [out, code] of [
    [target.dart, generateDart(catalog)],
    [target.typescript, generateTypeScript(catalog)],
  ] as const) {
    const file = resolve(ROOT, out);

    if (check) {
      const actual = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (actual !== code) {
        drift = true;
        process.stderr.write(
          `catalog-codegen: ${out} has drifted from ${target.source}. Run \`pnpm run codegen\`.\n`,
        );
      }
      continue;
    }

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, code);
    process.stdout.write(`catalog-codegen: wrote ${file}\n`);
  }
}

if (drift) process.exit(1);
if (check) process.stdout.write('catalog-codegen: generated catalogs match the source.\n');
