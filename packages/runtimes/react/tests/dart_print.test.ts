import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { dartToString, type PrintShape } from '../src/index.js';

// `dart_print_cases.json`: what real Dart prints for `'${x}'` of a List, Set or Map (`dart run`), with the value described
// structurally (`{t: 'list' | 'set' | 'map', v}`) so it can be rebuilt as the JavaScript value the generator emits.
interface Described {
  t: 'list' | 'set' | 'map';
  v: unknown[];
}
const isDescribed = (x: unknown): x is Described => typeof x === 'object' && x !== null && 't' in x;
const build = (x: unknown): unknown => {
  if (!isDescribed(x)) return x;
  if (x.t === 'list') return x.v.map(build);
  if (x.t === 'set') return new Set(x.v.map(build));
  return new Map((x.v as [unknown, unknown][]).map(([k, v]) => [build(k), build(v)]));
};

const cases = JSON.parse(readFileSync(new URL('./dart_print_cases.json', import.meta.url), 'utf8')) as {
  shape: PrintShape;
  value: unknown;
  expected: string;
}[];

describe('collection printing matches real Dart', () => {
  for (const c of cases) {
    it(`${JSON.stringify(c.shape)} → ${c.expected}`, () => {
      expect(dartToString(build(c.value), c.shape)).toBe(c.expected);
    });
  }
  it('an absent collection prints null, as Dart interpolation does', () => {
    expect(dartToString(null, ['list', 'raw'])).toBe('null');
  });
});
