// Dart `int` and numeric semantics — M11 (ADR-0050).
//
// A Dart `int` is 64-bit two's complement. A JavaScript number is an IEEE-754 double, exact for integers only up to
// 2^53 − 1, and its bitwise operators are 32-bit. The generator used to emit `+ - * & | ^ << >>` unchanged, so a
// program that stayed in range worked and one that left it produced a wrong number with no signal — every case below
// was observed by running Dart and JavaScript on the same values:
//
//   3037000499 * 3037000499      Dart 9223372030926249001   JavaScript 9223372030926249000
//   1 << 40                      Dart 1099511627776         JavaScript 256
//   0xFFFFFFFF & 0xFFFF0000      Dart 4294901760            JavaScript -65536
//   7 % -3                       Dart 1                     the old emitted formula gave -2
//   5 ~/ 0, 5 % 0                Dart throws                JavaScript Infinity / NaN
//
// ## The supported domain
//
// **Every `int` the program produces is a JavaScript safe integer**, |n| ≤ 2^53 − 1 (ADR-5 D2 already limits
// literals to it). Within the domain each function below is *exact* — bitwise operations and shifts go through
// `BigInt` with Dart's 64-bit wrap — and the moment an operation would leave it, it throws `BRG4011` instead of
// returning a rounded number. That is the whole contract: **exact or loud, never silently inexact**.
//
// Checking the *result* is sound for `+`, `-` and `*` of safe operands: if the true value fits the domain the double
// result is exact, and if it does not the double result is ≥ 2^53 (rounding is monotonic and 2^53 is representable), so
// `Number.isSafeInteger` rejects it.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

const MAX = Number.MAX_SAFE_INTEGER;

/** `2^31` — below it, `Math.trunc(a / b)` cannot round across an integer boundary. */
const SMALL = 2147483648;

function outOfDomain(operation: string): never {
  throw new RuntimeError(
    RuntimeDiagnosticCode.IntegerOutOfDomain,
    `\`${operation}\` produced an int outside the safe range ±${MAX}. A Dart int is 64-bit and this runtime represents ` +
      `an int as a JavaScript number, exact only up to 2^53 − 1, so the result cannot be represented; ` +
      `it is refused rather than rounded.`,
  );
}

function checked(value: number, operation: string): number {
  if (!Number.isSafeInteger(value)) outOfDomain(operation);
  // `+ 0` normalises negative zero, which Dart's `int` does not have.
  return value + 0;
}

function integer(value: number, operation: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RuntimeError(
      RuntimeDiagnosticCode.InvalidIntegerOperand,
      `\`${operation}\` needs an int operand and got ${String(value)}.`,
    );
  }
  return value;
}

/** Dart's `a + b` on two `int`s. */
export function intAdd(a: number, b: number): number {
  return checked(a + b, '+');
}

/** Dart's `a - b` on two `int`s. */
export function intSub(a: number, b: number): number {
  return checked(a - b, '-');
}

/** Dart's `a * b` on two `int`s. */
export function intMul(a: number, b: number): number {
  return checked(a * b, '*');
}

/** Dart's truncating `a ~/ b` on two `int`s. Throws `BRG4012` for a zero divisor, as Dart throws. */
export function intTruncDiv(a: number, b: number): number {
  if (b === 0) {
    throw new RuntimeError(RuntimeDiagnosticCode.IntegerDivisionByZero, 'an int `~/` by zero.');
  }
  if (Math.abs(a) < SMALL && Math.abs(b) < SMALL) return Math.trunc(a / b) + 0;
  // Beyond 2^31 the double quotient can round across an integer boundary, so use exact integer division.
  return checked(Number(BigInt(a) / BigInt(b)), '~/');
}

/**
 * Dart's `a % b` on two `int`s: the result is never negative, `r + |b|` when the remainder is. `7 % -3` is `1`.
 * Throws `BRG4012` for a zero divisor.
 */
export function intMod(a: number, b: number): number {
  if (b === 0) {
    throw new RuntimeError(RuntimeDiagnosticCode.IntegerDivisionByZero, 'an int `%` by zero.');
  }
  const r = a % b;
  return (r < 0 ? r + Math.abs(b) : r) + 0;
}

/**
 * Dart's `%` on `double`s (and on a `num` of unknown kind): non-negative, `NaN` for a zero divisor.
 *
 * The formula the generator emitted before, `((a % b) + b) % b`, is wrong for a negative divisor — `7 % -3` gave `-2`
 * where Dart gives `1` — and for any `b` near 2^53, where `+ b` is inexact.
 */
export function numMod(a: number, b: number): number {
  const r = a % b;
  return r < 0 ? r + Math.abs(b) : r;
}

/** Dart's `a ~/ b` when either operand is a `double`: truncates toward zero; throws for a non-finite quotient. */
export function numTruncDiv(a: number, b: number): number {
  const quotient = a / b;
  if (!Number.isFinite(quotient)) {
    if (b === 0) {
      throw new RuntimeError(RuntimeDiagnosticCode.IntegerDivisionByZero, 'a `~/` by zero.');
    }
    throw new RuntimeError(RuntimeDiagnosticCode.InvalidIntegerOperand, '`~/` of a non-finite value.');
  }
  return checked(Math.trunc(quotient), '~/');
}

function finite(value: number, operation: string): number {
  if (!Number.isFinite(value)) {
    throw new RuntimeError(
      RuntimeDiagnosticCode.InvalidIntegerOperand,
      `\`${operation}\` of a non-finite value (${String(value)}) — Dart throws an UnsupportedError.`,
    );
  }
  return value;
}

/** Dart's `num.round()`: to the nearest `int`, halves **away from zero** (JavaScript's `Math.round` rounds them up). */
export function numRound(value: number): number {
  const x = finite(value, 'round');
  return checked(x < 0 ? -Math.round(-x) : Math.round(x), 'round');
}

/** Dart's `num.floor()`: the greatest `int` not above the value; throws for a non-finite one. */
export function numFloor(value: number): number {
  return checked(Math.floor(finite(value, 'floor')), 'floor');
}

/** Dart's `num.ceil()`: the least `int` not below the value; throws for a non-finite one. */
export function numCeil(value: number): number {
  return checked(Math.ceil(finite(value, 'ceil')), 'ceil');
}

/** Dart's `num.truncate()` and `num.toInt()`: toward zero; throws for a non-finite value. */
export function numTruncate(value: number): number {
  return checked(Math.trunc(finite(value, 'truncate')), 'truncate');
}

/** Dart's `num.compareTo` for doubles: a total order in which `-0.0 < 0.0` and NaN is greater than everything. */
function compareTotal(a: number, b: number): number {
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
  if (Number.isNaN(b)) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  if (a === 0 && b === 0) return Object.is(a, -0) ? (Object.is(b, -0) ? 0 : -1) : Object.is(b, -0) ? 1 : 0;
  return 0;
}

/**
 * Dart's `num.clamp(lower, upper)`, which orders with `compareTo`: it throws when `lower` is above `upper`, and a NaN
 * receiver is above every limit, so it clamps to `upper`; `-0.0` is below `0.0`.
 */
export function numClamp(value: number, lower: number, upper: number): number {
  if (compareTotal(lower, upper) > 0) {
    throw new RuntimeError(
      RuntimeDiagnosticCode.InvalidIntegerOperand,
      `\`clamp\` with bounds ${String(lower)}..${String(upper)} — Dart throws an ArgumentError.`,
    );
  }
  if (compareTotal(value, lower) < 0) return lower;
  if (compareTotal(value, upper) > 0) return upper;
  return value;
}

function wrap(value: bigint, operation: string): number {
  const wrapped = BigInt.asIntN(64, value);
  const number = Number(wrapped);
  if (!Number.isSafeInteger(number)) outOfDomain(operation);
  return number + 0;
}

/** Dart's `a & b` on two `int`s, 64-bit. */
export function intAnd(a: number, b: number): number {
  return wrap(BigInt(integer(a, '&')) & BigInt(integer(b, '&')), '&');
}

/** Dart's `a | b` on two `int`s, 64-bit. */
export function intOr(a: number, b: number): number {
  return wrap(BigInt(integer(a, '|')) | BigInt(integer(b, '|')), '|');
}

/** Dart's `a ^ b` on two `int`s, 64-bit. */
export function intXor(a: number, b: number): number {
  return wrap(BigInt(integer(a, '^')) ^ BigInt(integer(b, '^')), '^');
}

function shiftCount(count: number, operation: string): number {
  integer(count, operation);
  if (count < 0) {
    throw new RuntimeError(RuntimeDiagnosticCode.InvalidIntegerOperand, `a negative shift count (${count}) in \`${operation}\`.`);
  }
  return count;
}

/** Dart's `a << b` on two `int`s, 64-bit wrap. A count of 64 or more gives `0`, as in Dart. */
export function intShl(a: number, b: number): number {
  const count = shiftCount(b, '<<');
  if (count >= 64) return 0;
  return wrap(BigInt(integer(a, '<<')) << BigInt(count), '<<');
}

/** Dart's arithmetic `a >> b` on two `int`s. A count of 64 or more gives `0` or `-1`, as in Dart. */
export function intShr(a: number, b: number): number {
  const count = shiftCount(b, '>>');
  integer(a, '>>');
  if (count >= 64) return a < 0 ? -1 : 0;
  return wrap(BigInt(a) >> BigInt(count), '>>');
}

/** Dart's logical `a >>> b` on two `int`s (64-bit). */
export function intUshr(a: number, b: number): number {
  const count = shiftCount(b, '>>>');
  integer(a, '>>>');
  if (count >= 64) return 0;
  return wrap(BigInt.asUintN(64, BigInt(a)) >> BigInt(count), '>>>');
}

/** Dart's `~a` on an `int`. */
export function intNot(a: number): number {
  return checked(-integer(a, '~') - 1, '~');
}
