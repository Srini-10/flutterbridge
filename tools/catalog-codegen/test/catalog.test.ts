// The unified widget catalog (M2-T10A, ADR-18).

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateDart, generateTypeScript, parseCatalog } from '../src/index.js';
import { generateRuntime } from '../src/runtime.js';

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

// ── M4-C: positional names, const values, and Material's own numbers ──────────────────────────────

describe('the catalog carries what ADR-0023 and the runtime kit need', () => {
  it('positional argument names are keyed by constructor', () => {
    const dart = generateDart(material);
    // Flutter names them differently per constructor — `Image.asset(String name)` against
    // `Image.network(String src)` — so one list per widget could not have been right for both.
    expect(dart).toContain("'asset': <String>['name']");
    expect(dart).toContain("'src'");
    // `''` keys the unnamed constructor, which is how a constructor with no name has to be spelled.
    expect(dart).toContain("'': <String>['icon']");
  });

  it('the positional names reach the analyzer only — the compiler has no use for them', () => {
    // Each domain is generated the subset it needs (ADR-18). Extraction is where a positional argument is
    // interpreted; by the time the compiler sees the program it is already a named prop.
    expect(generateTypeScript(material)).not.toContain('positionalProps');
  });

  it('a positional name that collides with a slot is refused', () => {
    expect(() =>
      parseCatalog(
        {
          catalog: 'x',
          priority: 1,
          library: 'p',
          widgets: [{ name: 'W', slots: ['child'], positionalProps: { '': ['child'] } }],
        },
        'x.json',
      ),
    ).toThrow(/cannot be reached both positionally and by name/);
  });

  it('two positional arguments cannot share a name', () => {
    expect(() =>
      parseCatalog(
        {
          catalog: 'x',
          priority: 1,
          library: 'p',
          widgets: [{ name: 'W', positionalProps: { '': ['a', 'a'] } }],
        },
        'x.json',
      ),
    ).toThrow(/names two positional/);
  });

  it('constValues names the types whose static consts are extracted by value', () => {
    // `Icons.star` is `IconData(0xe5f9, …)`; carrying the name instead would oblige every runtime kit to
    // ship Flutter's ~2000-entry Icons table.
    expect(generateDart(material)).toContain("'IconData': <String>['codePoint', 'fontFamily', 'fontPackage']");
  });

  it('the runtime kit gets Material’s numbers, and no colours', () => {
    const runtime = generateRuntime(material);
    // Transcribed from the Flutter SDK; the elevation curve is the one ElevationOverlay interpolates.
    expect(runtime).toContain('ELEVATION_STOPS');
    expect(runtime).toContain('{ elevation: 12.0, opacity: 0.14 }');
    expect(runtime).toContain('STATE_LAYER_OPACITY');
    expect(runtime).toContain('"hover": 0.08');
    // A `dragged` opacity is absent because Flutter states none — not because it was forgotten.
    expect(runtime).not.toContain('"dragged"');
    // Colours are the theme's, from app.Token; a hex here would be the INV-20 violation this file prevents.
    expect(runtime).not.toMatch(/#[0-9A-Fa-f]{6}/);
    // A component default names a *role*, never a colour value.
    expect(runtime).toContain('"colorRole": "outlineVariant"');
  });

  it('the runtime metadata is not generated into the other two domains', () => {
    expect(generateDart(material)).not.toContain('ELEVATION_STOPS');
    expect(generateTypeScript(material)).not.toContain('ELEVATION_STOPS');
  });
});
