import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateDart } from '../src/generator/dart.js';
import { generateTypeScript } from '../src/generator/typescript.js';
import { parseSchemas, SchemaError, type SchemaModel } from '../src/parser.js';
import { validate } from '../src/validators.js';

const REPO = resolve(__dirname, '../../..');
const SCHEMA_DIR = join(REPO, 'packages/uir/schema');

const model: SchemaModel = parseSchemas(SCHEMA_DIR);

/** Writes a throwaway schema directory. Only the file under test differs from the real schema. */
function schemaWith(overrides: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'uir-schema-'));
  for (const file of ['shared.json', 'l0.json', 'l1.json', 'l2.json', 'l3.json']) {
    const source = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')) as Record<string, unknown>;
    const override = overrides[file];
    writeFileSync(join(dir, file), JSON.stringify(override ?? source, null, 2));
  }
  return dir;
}

const minimal = (defs: Record<string, unknown>): Record<string, unknown> => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  'x-uir-layer': 'L0',
  title: 'test',
  description: 'test',
  $defs: defs,
});

describe('the real schema', () => {
  it('parses', () => {
    expect(model.defs.length).toBeGreaterThan(50);
    // From the schema, never a literal: the schema is the single source of truth.
    expect(model.uirVersion).toBe(schemaVersion());
  });

  it('validates with no violations', () => {
    expect(validate(model)).toEqual([]);
  });

  it('carries the v2.1 amendments the compiler depends on', () => {
    const names = model.defs.map((d) => d.name);
    // ADR-11 (N11), ADR-13 (derived Material roles), A3 (layout intent).
    expect(names).toContain('StoreOrigin');
    expect(names).toContain('SignalScope');
    expect(names).toContain('MaterialRole');
    expect(names).toContain('LayoutIntent');
    expect(names).toContain('RouteArgumentTransport');

    const origin = model.defs.find((d) => d.name === 'StoreOrigin');
    expect(origin?.kind === 'enum' && origin.values.map((v) => v.value)).toEqual([
      'declared',
      'promoted',
    ]);

    const roles = model.defs.find((d) => d.name === 'MaterialRole');
    const roleNames = roles?.kind === 'enum' ? roles.values.map((v) => v.value) : [];
    for (const required of [
      'surface',
      'surfaceContainer',
      'surfaceContainerHighest',
      'primary',
      'primaryContainer',
      'secondaryContainer',
      'errorContainer',
      'inverseSurface',
      'inversePrimary',
    ]) {
      expect(roleNames).toContain(required);
    }
  });

  it('reserves the BRG23xx route diagnostics', () => {
    const codes = model.defs.find((d) => d.name === 'DiagnosticCode');
    expect(codes?.kind === 'enum' && codes.values.map((v) => v.value)).toEqual([
      'BRG2301',
      'BRG2302',
      'BRG2303',
    ]);
  });

  it('gives every node a stable id, a kind and a span', () => {
    for (const def of model.defs) {
      if (def.kind !== 'object' || def.uirKind === undefined) continue;
      const fields = def.fields.map((f) => f.name);
      expect(fields, `${def.name} is missing a base field`).toEqual(
        expect.arrayContaining(['id', 'kind', 'span']),
      );
    }
  });
});

describe('validation rejects broken schemas', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    [
      'a dangling reference',
      minimal({
        Thing: {
          description: 'a thing',
          'x-uir-kind': 'test.Thing',
          allOf: [
            { $ref: 'shared.json#/$defs/UirNodeBase' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind'],
              properties: {
                kind: { type: 'string', const: 'test.Thing', description: 'd' },
                other: { $ref: 'l0.json#/$defs/DoesNotExist', description: 'd' },
              },
            },
          ],
        },
      }),
      'missing-reference',
    ],
    [
      'a node with no span',
      minimal({
        Thing: {
          type: 'object',
          description: 'a thing',
          'x-uir-kind': 'test.Thing',
          additionalProperties: false,
          required: ['kind', 'id'],
          properties: {
            kind: { type: 'string', const: 'test.Thing', description: 'd' },
            id: { type: 'string', description: 'd' },
          },
        },
      }),
      'node-contract',
    ],
    [
      'a field named after a Dart annotation',
      minimal({
        Thing: {
          description: 'a thing',
          'x-uir-kind': 'test.Thing',
          allOf: [
            { $ref: 'shared.json#/$defs/UirNodeBase' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind'],
              properties: {
                kind: { type: 'string', const: 'test.Thing', description: 'd' },
                override: { type: 'string', description: 'shadows @override' },
              },
            },
          ],
        },
      }),
      'reserved-name',
    ],
    [
      'an unconstructible cycle',
      minimal({
        Thing: {
          description: 'a thing that requires itself',
          'x-uir-kind': 'test.Thing',
          allOf: [
            { $ref: 'shared.json#/$defs/UirNodeBase' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'self'],
              properties: {
                kind: { type: 'string', const: 'test.Thing', description: 'd' },
                self: { $ref: 'l0.json#/$defs/Thing', description: 'itself, required' },
              },
            },
          ],
        },
      }),
      'cycle',
    ],
  ];

  for (const [name, l0, expectedRule] of cases) {
    it(`rejects ${name}`, () => {
      const dir = schemaWith({ 'l0.json': l0 });
      try {
        const violations = validate(parseSchemas(dir));
        expect(violations.map((v) => v.rule)).toContain(expectedRule);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it('rejects an undocumented field before anything is generated', () => {
    const dir = schemaWith({
      'l0.json': minimal({
        Thing: {
          description: 'a thing',
          'x-uir-kind': 'test.Thing',
          allOf: [
            { $ref: 'shared.json#/$defs/UirNodeBase' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind'],
              properties: {
                kind: { type: 'string', const: 'test.Thing', description: 'd' },
                undocumented: { type: 'string' },
              },
            },
          ],
        },
      }),
    });
    try {
      // The parser rejects it: a field with no description never even reaches the model.
      expect(() => parseSchemas(dir)).toThrow(SchemaError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recursion is allowed — an AST is recursion, and Expr bottoms out at Lit', () => {
    // The real schema is full of it: Binary.left is an Expr, and Expr includes Binary.
    expect(validate(model).filter((v) => v.rule === 'cycle')).toEqual([]);
  });
});

describe('generation', () => {
  it('is deterministic: generating twice produces byte-identical output', () => {
    expect(generateDart(model)).toBe(generateDart(parseSchemas(SCHEMA_DIR)));
    expect(generateTypeScript(model)).toBe(generateTypeScript(parseSchemas(SCHEMA_DIR)));
  });

  it('stamps both languages as generated', () => {
    expect(generateDart(model)).toContain('// GENERATED CODE — DO NOT EDIT');
    expect(generateTypeScript(model)).toContain('// GENERATED CODE — DO NOT EDIT');
  });

  it('carries no timestamp — a file that changes with the clock is not deterministic', () => {
    const dart = generateDart(model);
    expect(dart).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(generateTypeScript(model)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('copies documentation from the schema into both languages', () => {
    // A sentence that exists only in the schema's description of StoreOrigin.promoted.
    const fragment = 'promotion is never silent';
    expect(generateDart(model)).toContain(fragment);
    expect(generateTypeScript(model)).toContain(fragment);
  });

  it('emits sealed unions in Dart and discriminated unions in TypeScript', () => {
    expect(generateDart(model)).toContain('sealed class UiNode extends UirNode');
    expect(generateTypeScript(model)).toContain('export type UiNode =');
  });

  it('emits visitors for every union', () => {
    expect(generateDart(model)).toContain('abstract interface class UiNodeVisitor<R>');
    expect(generateTypeScript(model)).toContain('export interface UiNodeVisitor<R>');
  });

  it('emits copyWith, equality and hashing', () => {
    const dart = generateDart(model);
    expect(dart).toContain('UiText copyWith({');
    expect(dart).toContain('int get hashCode');
    expect(dart).toContain('bool operator ==(Object other)');

    const ts = generateTypeScript(model);
    expect(ts).toContain('export function copyWithUiText(');
    expect(ts).toContain('export function equalsUiText(');
    expect(ts).toContain('export function hashUir(');
  });

  it('the committed generated files match the schema (drift check)', () => {
    // The same check CI runs. Generated code is committed, so a stale file is possible — and a stale
    // UIR model is one that silently disagrees with the schema.
    execFileSync('node', [join(REPO, 'tools/schema-codegen/dist/cli.js'), 'check'], {
      cwd: REPO,
      stdio: 'pipe',
    });
  });
});

/** The version the real schema declares. */
function schemaVersion(): string {
  const shared = JSON.parse(
    readFileSync(new URL('../../../packages/uir/schema/shared.json', import.meta.url), 'utf8'),
  ) as { 'x-uir-version': string };
  return shared['x-uir-version'];
}
