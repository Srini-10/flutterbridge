import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { numCeil, numClamp, numFloor, numRound, numTruncate } from '../src/index.js';

// `dart_round_cases.json` is real Dart's answer (`dart run`) for `round`, `floor`, `ceil`, `truncate` and `clamp` over
// halves of both signs, negative zero, the 2^53 boundary, NaN and the infinities. `'THROW'` is a Dart error; `'OUT'` is an
// `int` outside JavaScript's safe range, which this runtime throws for rather than round (ADR-0050).

type Row = [string, ...(number | string)[]];
const rows = JSON.parse(readFileSync(new URL('./dart_round_cases.json', import.meta.url), 'utf8')) as Row[];

const revive = (v: number | string): number =>
  v === 'NaN' ? Number.NaN : v === 'Infinity' ? Number.POSITIVE_INFINITY : v === '-Infinity' ? Number.NEGATIVE_INFINITY : (v as number);

const unary: Record<string, (x: number) => number> = { round: numRound, floor: numFloor, ceil: numCeil, truncate: numTruncate };

describe('num rounding and clamping match real Dart', () => {
  for (const row of rows) {
    const [operation] = row;
    if (operation === 'clamp') {
      const [, value, lower, upper, expected] = row as [string, number | string, number | string, number, number | string];
      it(`clamp(${String(value)}, ${String(lower)}, ${upper})`, () => {
        if (expected === 'THROW') {
          expect(() => numClamp(revive(value), revive(lower), upper)).toThrow();
        } else {
          expect(numClamp(revive(value), revive(lower), upper)).toEqual(revive(expected));
        }
      });
      continue;
    }
    const [, input, expected] = row as [string, number | string, number | string];
    it(`${operation}(${String(input)})`, () => {
      const run = (): number => unary[operation as string]!(revive(input));
      if (expected === 'THROW' || expected === 'OUT') expect(run).toThrow();
      else expect(run()).toBe(expected);
    });
  }
});
