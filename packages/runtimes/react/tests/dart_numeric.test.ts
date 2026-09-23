import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { intToRadixString, numFloorToDouble, numRoundToDouble, numTruncateToDouble } from '../src/index.js';

// `dart_numeric_cases.json` is real Dart's answer (`dart run tests/dart_numeric_cases.gen.dart`) for `roundToDouble`, `floorToDouble`,
// `truncateToDouble` and `int.toRadixString`: halves of both signs, negative zero (whose sign a zero result must keep), the 2^52/2^53 boundaries,
// subnormals, `1e21`, NaN and the infinities; and radixes 2, 8, 10, 16, 36 over positive and negative ints, plus the out-of-range radixes, which throw.

type Row = ['roundToDouble' | 'floorToDouble' | 'truncateToDouble', string, string] | ['toRadixString', number, number, string];
const rows = JSON.parse(readFileSync(new URL('./dart_numeric_cases.json', import.meta.url), 'utf8')) as Row[];

const revive = (v: string): number =>
  v === 'NaN' ? Number.NaN : v === 'Infinity' ? Number.POSITIVE_INFINITY : v === '-Infinity' ? Number.NEGATIVE_INFINITY : Number(v);

const unary: Record<string, (x: number) => number> = {
  roundToDouble: numRoundToDouble,
  floorToDouble: numFloorToDouble,
  truncateToDouble: numTruncateToDouble,
};

describe('roundToDouble / floorToDouble / truncateToDouble match real Dart', () => {
  for (const row of rows) {
    if (row[0] === 'toRadixString') continue;
    const [operation, input, expected] = row;
    it(`${input}.${operation}() is ${expected}`, () => {
      // `toEqual` distinguishes -0 from 0 (it uses Object.is), which is the point for the zero results.
      expect(unary[operation]?.(revive(input))).toEqual(revive(expected));
    });
  }
});

describe('int.toRadixString matches real Dart', () => {
  for (const row of rows) {
    if (row[0] !== 'toRadixString') continue;
    const [, value, radix, expected] = row;
    it(`${value}.toRadixString(${radix}) is ${expected}`, () => {
      if (expected === 'THROW') expect(() => intToRadixString(value, radix)).toThrow(RangeError);
      else expect(intToRadixString(value, radix)).toBe(expected);
    });
  }

  it('refuses a non-int receiver rather than formatting it', () => {
    expect(() => intToRadixString(1.5, 16)).toThrow();
    expect(() => intToRadixString(Number.NaN, 16)).toThrow();
  });
});
