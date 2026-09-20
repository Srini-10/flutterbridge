import { describe, expect, it } from 'vitest';

import { doubleToString } from '../src/index.js';

// Every expectation below is the output of real Dart (`'$x'` over the same values), observed by running
// `dart run` — not recalled. JavaScript's own `String(x)` is the *wrong* answer for exactly the cases the first
// three groups name, which is the reason `doubleToString` exists.
describe('doubleToString matches Dart’s double.toString()', () => {
  it('appends .0 to an integral value — the difference from JavaScript', () => {
    expect(doubleToString(1)).toBe('1.0');
    expect(doubleToString(100)).toBe('100.0');
    expect(doubleToString(-3)).toBe('-3.0');
    expect(doubleToString(0)).toBe('0.0');
    expect(doubleToString(100000000000000000000)).toBe('100000000000000000000.0');
    expect(doubleToString(123456789012345680000)).toBe('123456789012345680000.0');
    expect(doubleToString(9007199254740993)).toBe('9007199254740992.0');
  });

  it('prints negative zero as -0.0 — JavaScript prints 0', () => {
    expect(doubleToString(-0)).toBe('-0.0');
  });

  it('leaves a non-integral value exactly as JavaScript prints it', () => {
    expect(doubleToString(0.5)).toBe('0.5');
    expect(doubleToString(2.5)).toBe('2.5');
    expect(doubleToString(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(doubleToString(1 / 3)).toBe('0.3333333333333333');
    expect(doubleToString(0.000001)).toBe('0.000001');
  });

  it('keeps the exponent form both languages share, without appending .0', () => {
    expect(doubleToString(1e21)).toBe('1e+21');
    expect(doubleToString(1e100)).toBe('1e+100');
    expect(doubleToString(1e-7)).toBe('1e-7');
    expect(doubleToString(1.5e-10)).toBe('1.5e-10');
  });

  it('agrees on NaN and the infinities', () => {
    expect(doubleToString(Number.NaN)).toBe('NaN');
    expect(doubleToString(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(doubleToString(Number.NEGATIVE_INFINITY)).toBe('-Infinity');
  });

  it('prints an absent value as Dart’s interpolation does: "null"', () => {
    expect(doubleToString(null)).toBe('null');
    expect(doubleToString(undefined)).toBe('null');
  });
});
