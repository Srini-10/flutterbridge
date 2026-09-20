import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  intAdd, intAnd, intMod, intMul, intNot, intOr, intShl, intShr, intSub, intTruncDiv, intUshr, intXor, numMod, numTruncDiv,
} from '../src/index.js';

// Dart `int` semantics (ADR-0050). `dart_int_cases.json` is the output of real Dart running the same operations over
// 19 values (zero, ±1, 2^31 and 2^32 boundaries, 2^40, ±(2^53 − 1)) — 3 477 cases — regenerated with `dart run`,
// not written by hand. Each entry is `[operation, a, b, result]`, where `result` is a number, `'OUT'` (Dart's
// 64-bit result is outside the JavaScript safe range) or `'THROW'`.
//
// The contract under test is **exact or loud**: an in-domain Dart result must be reproduced exactly, and anything
// the runtime cannot represent must throw `BRG4011`/`BRG4012`, never return a rounded number.

type Row = [string, number, number, number | 'OUT' | 'THROW'];
const rows = JSON.parse(readFileSync(new URL('./dart_int_cases.json', import.meta.url), 'utf8')) as Row[];

const operations: Record<string, (a: number, b: number) => number> = {
  '+': intAdd, '-': intSub, '*': intMul, '~/': intTruncDiv, '%': intMod,
  '&': intAnd, '|': intOr, '^': intXor, '<<': intShl, '>>': intShr, '>>>': intUshr, '~': (a) => intNot(a),
};

/** The exact (unwrapped) result, for deciding whether a trap was legitimate. */
function exactOutsideDomain(operation: string, a: number, b: number): boolean {
  const x = BigInt(a);
  const y = BigInt(b);
  const exact = operation === '+' ? x + y : operation === '-' ? x - y : operation === '*' ? x * y : undefined;
  return exact !== undefined && (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < -BigInt(Number.MAX_SAFE_INTEGER));
}

const attempt = (operation: string, a: number, b: number): { value?: number; code?: string | undefined } => {
  try {
    return { value: operations[operation]!(a, b) };
  } catch (error) {
    return { code: (error as { code?: string }).code };
  }
};

describe('every int operation matches real Dart, or throws — never a rounded number', () => {
  it('reproduces every in-domain result exactly (or traps for a reason the exact value justifies)', () => {
    const failures: string[] = [];
    for (const [operation, a, b, expected] of rows) {
      const got = attempt(operation, a, b);
      if (typeof expected === 'number') {
        if (got.value !== undefined) {
          if (!Object.is(got.value, expected) && got.value !== expected) failures.push(`${a} ${operation} ${b}: got ${got.value}, Dart ${expected}`);
        } else if (!(got.code === 'BRG4011' && exactOutsideDomain(operation, a, b))) {
          failures.push(`${a} ${operation} ${b}: threw ${got.code} for an in-domain Dart result ${expected}`);
        }
      } else if (expected === 'OUT') {
        if (got.code !== 'BRG4011') failures.push(`${a} ${operation} ${b}: Dart is out of domain, got ${JSON.stringify(got)}`);
      } else if (got.value !== undefined) {
        failures.push(`${a} ${operation} ${b}: Dart throws, got ${got.value}`);
      }
    }
    expect(failures.slice(0, 8)).toEqual([]);
    expect(rows.length).toBeGreaterThan(3000);
  });

  it('never returns a non-safe number', () => {
    for (const [operation, a, b] of rows) {
      const got = attempt(operation, a, b);
      if (got.value !== undefined) expect(Number.isSafeInteger(got.value), `${a} ${operation} ${b}`).toBe(true);
    }
  });

  it('never yields negative zero', () => {
    for (const [operation, a, b] of rows) {
      const got = attempt(operation, a, b);
      if (got.value !== undefined) expect(Object.is(got.value, -0), `${a} ${operation} ${b}`).toBe(false);
    }
  });
});

describe('the specific silent failures the old lowering had', () => {
  it('3037000499 * 3037000499 is refused, not rounded to …000', () => {
    expect(() => intMul(3037000499, 3037000499)).toThrow(/BRG4011/);
  });
  it('1 << 40, 1 << 31 and a 32-bit-wrapping mask are exact', () => {
    expect(intShl(1, 40)).toBe(1099511627776);
    expect(intShl(1, 31)).toBe(2147483648);
    expect(intAnd(4294967295, 4294901760)).toBe(4294901760);
    expect(intOr(4294967296, 1)).toBe(4294967297);
  });
  it('% follows Dart for a negative divisor — 7 % -3 is 1, not the old formula’s -2', () => {
    expect(intMod(7, -3)).toBe(1);
    expect(intMod(-7, 3)).toBe(2);
    expect(intMod(-7, -3)).toBe(2);
    expect(numMod(7, -3)).toBe(1);
    expect(numMod(-7.5, 2)).toBe(0.5);
  });
  it('a zero divisor throws BRG4012 for int, and % gives NaN for double as Dart does', () => {
    expect(() => intTruncDiv(5, 0)).toThrow(/BRG4012/);
    expect(() => intMod(5, 0)).toThrow(/BRG4012/);
    expect(numMod(5, 0)).toBeNaN();
  });
  it('a negative shift count is refused', () => {
    expect(() => intShl(1, -1)).toThrow(/BRG4013/);
  });
  it('a double ~/ truncates toward zero and refuses a non-finite quotient', () => {
    expect(numTruncDiv(7.5, 2)).toBe(3);
    expect(numTruncDiv(-7.5, 2)).toBe(-3);
    expect(() => numTruncDiv(1, 0)).toThrow(/BRG4012/);
  });
  it('~/ is exact where the double quotient would round across an integer', () => {
    // 9007199254740991 / 3 is exactly 3002399751580330.333…; the boundary case is a large dividend and divisor.
    expect(intTruncDiv(9007199254740991, 3)).toBe(3002399751580330);
    expect(intTruncDiv(-9007199254740991, 2)).toBe(-4503599627370495);
  });
});
