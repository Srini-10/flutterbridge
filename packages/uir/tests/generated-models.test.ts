import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** The version the schema declares — the one and only source of truth (§A16). */
const SCHEMA_VERSION = (
  JSON.parse(readFileSync(new URL('../schema/shared.json', import.meta.url), 'utf8')) as {
    'x-uir-version': string;
  }
)['x-uir-version'];

import {
  canonicalEncode,
  canonicalNumber,
  MAX_SAFE_INTEGER,
  canonicalJson,
  copyWithUiText,
  equalsUiText,
  hashUir,
  parseUiElement,
  parseUiNode,
  parseUiText,
  serializeUiText,
  UirParseError,
  UIR_VERSION,
  type UiElement,
  type UiNode,
  type UiText,
} from '../src/index.js';

const span = { file: 'lib/main.dart', line: 10, column: 3 } as const;

const text = (id: string, value: string): UiText => ({
  id,
  kind: 'ui.Text',
  span,
  value: { id: `${id}-b`, kind: 'bind.Const', span, value },
});

describe('canonical numbers (Spec v2.3 §A15)', () => {
  it('an integral double is written as an integer — no trailing .0', () => {
    // Dart writes the double 100.0 as `100.0`; JavaScript writes it as `100`. Two byte-forms of one
    // node means two ids for one node (§A16), and the moment N5 mints a node in TypeScript the two
    // domains would disagree about what it is called.
    expect(canonicalNumber(100.0)).toBe('100');
    expect(canonicalNumber(1e20)).toBe('100000000000000000000');
  });

  it('zero is unsigned', () => {
    expect(canonicalNumber(-0)).toBe('0');
    expect(canonicalNumber(0)).toBe('0');
  });

  it('a non-integral double keeps its shortest round-trip form', () => {
    expect(canonicalNumber(0.1)).toBe('0.1');
    expect(canonicalNumber(3.141592653589793)).toBe('3.141592653589793');
    expect(canonicalNumber(-0.5)).toBe('-0.5');
  });

  it('exponent form only where the shortest representation needs it', () => {
    expect(canonicalNumber(1e21)).toBe('1e+21');
    expect(canonicalNumber(1e-7)).toBe('1e-7');
    expect(canonicalNumber(0.000001)).toBe('0.000001');
    expect(canonicalNumber(5e-324)).toBe('5e-324');
  });

  it('NaN and infinities have no canonical form', () => {
    expect(() => canonicalNumber(NaN)).toThrow();
    expect(() => canonicalNumber(Infinity)).toThrow();
  });

  it('a double of any magnitude is fine — JavaScript has no other kind of number', () => {
    // The §A15 prohibition is on *integer-typed* values beyond 2^53, which only Dart has. Rejecting
    // 1e21 here would reject a value Dart is allowed to emit.
    expect(canonicalNumber(1e21)).toBe('1e+21');
    expect(canonicalNumber(MAX_SAFE_INTEGER)).toBe('9007199254740991');
  });

  it('canonicalEncode writes the whole node, numbers included', () => {
    expect(canonicalEncode({ b: 100.0, a: [1.0, -0], z: undefined })).toBe('{"a":[1,0],"b":100}');
  });
});

describe('generated TypeScript models', () => {
  it('declares the schema version it came from', () => {
    // Read from the schema, not pinned to a literal. A literal here fails on every amendment, which
    // teaches whoever is holding the amendment to edit the assertion — and an assertion that gets
    // edited whenever it fires is not an assertion. What is actually worth checking is that the
    // *generated* constant has not drifted from the schema that generated it.
    expect(UIR_VERSION).toBe(SCHEMA_VERSION);
  });

  describe('round-trip', () => {
    it('a node survives serialize -> parse', () => {
      const node = text('n1', 'Sign in');
      expect(parseUiText(serializeUiText(node))).toEqual(node);
    });

    it('a nested tree survives, with child order preserved', () => {
      const element: UiElement = {
        id: 'root',
        kind: 'ui.Element',
        span,
        component: { name: 'Column' },
        children: [text('a', 'first'), text('b', 'second'), text('c', 'third')],
      };

      const back = parseUiElement(canonicalJson(element));

      expect(back.children?.map((c) => c.id)).toEqual(['a', 'b', 'c']);
      expect(back).toEqual(element);
    });

    it('a union parses through its base, dispatching on kind', () => {
      const node: UiNode = text('n1', 'hello');
      expect(parseUiNode(canonicalJson(node)).kind).toBe('ui.Text');
    });
  });

  describe('parsing validates', () => {
    it('rejects a missing required field, with a path', () => {
      expect(() => parseUiText({ kind: 'ui.Text', id: 'n1', span })).toThrow(UirParseError);
    });

    it('rejects a wrong kind', () => {
      expect(() => parseUiText({ kind: 'ui.Element', id: 'n1', span })).toThrow(/expected "ui.Text"/);
    });

    it('rejects an unknown kind on a union', () => {
      expect(() => parseUiNode({ kind: 'ui.Nonsense', id: 'n1', span })).toThrow(/unknown UiNode kind/);
    });
  });

  describe('value semantics', () => {
    it('equality is structural, and list order is part of it', () => {
      expect(equalsUiText(text('n1', 'x'), text('n1', 'x'))).toBe(true);
      expect(equalsUiText(text('n1', 'x'), text('n1', 'y'))).toBe(false);
    });

    it('equal values hash equally, whatever order their keys were built in', () => {
      const a = { kind: 'ui.Text', id: 'n1', span };
      const b = { span, id: 'n1', kind: 'ui.Text' };
      expect(hashUir(a)).toBe(hashUir(b));
    });

    it('copyWith replaces only the named field and never mutates the original', () => {
      const original = text('n1', 'before');
      const copy = copyWithUiText(original, { id: 'n2' });

      expect(copy.id).toBe('n2');
      expect(copy.value).toEqual(original.value);
      expect(original.id).toBe('n1');
    });
  });

  it('canonical JSON sorts keys recursively and drops undefined', () => {
    expect(JSON.stringify(canonicalJson({ b: { z: 1, a: 2 }, a: undefined, c: [{ y: 1, x: 2 }] }))).toBe(
      '{"b":{"a":2,"z":1},"c":[{"x":2,"y":1}]}',
    );
  });
});
