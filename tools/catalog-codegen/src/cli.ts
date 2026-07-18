#!/usr/bin/env node
// Generates the framework widget catalogs for both language domains from one JSON source (ADR-18).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateDart } from './dart.js';
import { generateRuntime } from './runtime.js';
import { generateTypeScript } from './typescript.js';
import { parseCatalog } from './model.js';

const ROOT = resolve(import.meta.dirname, '../../..');

const TARGETS = [
  {
    source: 'catalog/widgets/material.json',
    dart: 'dart/bridge_analyzer/lib/src/session/adapters/widget/generated/material_catalog.dart',
    typescript: 'packages/adapters/widgets-material/src/generated/material_catalog.ts',
    // The kit needs Material's own constants: INV-20 forbids a component holding a literal, so the numbers
    // are authored in the catalog and generated in (ADR-18, "generated into every runtime that needs it").
    runtime: 'packages/runtimes/react/src/internal/generated/material_metadata.ts',
  },
  {
    // The first **package** catalog, and the test of ADR-18's claim that a package costs one line here and
    // one file beside it. `Gap` is the most-used unsupported widget in the M0 corpus — 115 instantiations,
    // more than `Container` — and it belongs to no framework.
    //
    // No `runtime` target: that entry exists for Material's own constants, which INV-20 forbids a kit
    // component from holding. A `Gap` has no constants — its extent is its argument.
    source: 'catalog/widgets/gap.json',
    dart: 'dart/bridge_analyzer/lib/src/session/adapters/widget/generated/gap_catalog.dart',
    typescript: 'packages/adapters/widgets-material/src/generated/gap_catalog.ts',
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
    ...(target.runtime === undefined
      ? []
      : ([[target.runtime, generateRuntime(catalog)]] as [string, string][])),
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
