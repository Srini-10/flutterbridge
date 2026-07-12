// The unified widget catalog (M2-T10A, ADR-18).

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateDart, generateTypeScript, parseCatalog } from '../src/index.js';

const material = parseCatalog(
  JSON.parse(readFileSync(new URL('../../../catalog/widgets/material.json', import.meta.url), 'utf8')),
  'material.json',
);

describe('the real catalog', () => {
  it('parses, and describes a real number of widgets', () => {
    expect(material.widgets.length).toBeGreaterThan(40);
    expect(material.library).toBe('package:flutter/');
  });

  it('knows the children properties that are NOT called `children`', () => {
    // The whole reason this migration exists. A hardcoded `children` buried these in props, where the
    // UI structure was simply gone.
    const of = (name: string) => material.widgets.find((w) => w.name === name)?.childrenProp;

    expect(of('CustomScrollView')).toBe('slivers');
    expect(of('AppBar')).toBe('actions');
    expect(of('Column')).toBe('children');
  });

  it('a widget whose identity IS its behaviour is never transparent', () => {
    const of = (name: string) =>
      material.widgets.find((w) => w.name === name)?.transparentWithoutProps;

    expect(of('Center')).toBeUndefined();
    expect(of('Padding')).toBeUndefined();
    expect(of('Container')).toContain('decoration');
    expect(of('RepaintBoundary')).toEqual([]);
  });
});

describe('the catalog is validated, not trusted', () => {
  const base = { catalog: 'x', priority: 1, library: 'p:/', widgets: [] };

  it('rejects a widget declared twice', () => {
    expect(() =>
      parseCatalog({ ...base, widgets: [{ name: 'A' }, { name: 'A' }] }, 'x'),
    ).toThrow(/declared twice/);
  });

  it('rejects a parameter that is both a slot and the children property', () => {
    // One parameter cannot be both a single child and a list of them.
    expect(() =>
      parseCatalog(
        { ...base, widgets: [{ name: 'A', slots: ['child'], childrenProp: 'child' }] },
        'x',
      ),
    ).toThrow(/both a slot and its children/);
  });

  it('rejects a catalog missing a required field', () => {
    expect(() => parseCatalog({ catalog: 'x' }, 'x')).toThrow(/missing/);
  });
});

describe('one source, two languages', () => {
  it('the Dart catalog carries what the ANALYZER needs', () => {
    const dart = generateDart(material);

    // Facts about how a frontend reads source. The compiler never reads source and has no use for them.
    expect(dart).toContain('componentBases');
    expect(dart).toContain('stateBatchCalls');
    expect(dart).toContain('lifecycle');
    expect(dart).toContain("'slivers'");
    expect(dart).toContain('GENERATED CODE — DO NOT EDIT');
  });

  it('the TypeScript catalog carries what the COMPILER needs, and nothing it does not', () => {
    const ts = generateTypeScript(material);

    expect(ts).toContain('childrenProp');
    expect(ts).toContain('transparentWithoutProps');
    expect(ts).toContain('"slivers"');

    // Generating each domain the subset it needs is not a compromise; it is the point.
    expect(ts).not.toContain('componentBases');
    expect(ts).not.toContain('lifecycle');
  });

  it('both languages agree about every widget they both describe', () => {
    const dart = generateDart(material);
    const ts = generateTypeScript(material);

    for (const widget of material.widgets) {
      expect(dart).toContain(`'${widget.name}'`);
      expect(ts).toContain(`"${widget.name}"`);
    }
  });
});
