import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  intBitOperatorsRaw,
  intBitRefusalRaw,
  typecheckEmitted,
} from './support.js';

// Plan Phase E — `& | ^ << >> ~` on Dart values whose JavaScript spelling is not the same operation.
//
// `SAFE_BINARY` listed `& | ^ << >>` as "meaning the same thing in both languages". Observed against real Dart:
//
//   1 << 40                  Dart 1099511627776   JavaScript 256          (JS shifts are 32-bit)
//   0xFFFFFFFF & 0xFFFF0000  Dart 4294901760      JavaScript -65536
//   1 << 31                  Dart 2147483648      JavaScript -2147483648
//   true & false             Dart false           JavaScript 0            (bool & is logic, not arithmetic)
//
// ADR-0050 replaces the earlier refusal of a runtime `int` with an exact lowering: the checked helpers of the runtime
// kit (`intShl`, `intAnd`, … — BigInt-exact within the safe-integer domain, `BRG4011` beyond it). Two integer
// literals fold to Dart's exact 64-bit result at compile time (`1 << 20` flags), a constant that leaves the domain is
// refused at build time, and `bool & | ^` becomes `Boolean(Number(a) op Number(b))`.

afterAll(cleanupBuildProofTemporaries);

const emit = () => {
  const { context, reported } = harness(compiledFrom(intBitOperatorsRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files };
};
const component = (name: string) => fileAt(emit().files, `src/components/${name}.tsx`) ?? '';

describe('what is provable is lowered', () => {
  it('emits no error, and real `tsc --strict` accepts it', () => {
    const { reported, files } = emit();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  it('a constant shift folds to Dart’s exact 64-bit value — 1 << 40 is 1099511627776, not 256', () => {
    const source = component('folded-shift');
    expect(source).toContain('_n.set(1099511627776)');
    expect(source).not.toContain('<<');
  });

  it('a constant mask folds exactly — 0xFFFFFFFF & 0xFFFF0000 is 4294901760, not -65536', () => {
    const source = component('folded-mask');
    expect(source).toContain('_n.set(4294901760)');
    expect(source).not.toContain('&');
  });

  it('a negative folded result is parenthesised', () => {
    // `-8 >> 1`: whichever way the analyzer spells `-8`, the emitted TypeScript must be valid and exact.
    const source = component('folded-negative');
    expect(source).toMatch(/_n\.set\(\(?-4\)?\)|_n\.set\(\(-8 >> 1\)\)/);
  });

  it('bool & and ^ are Boolean(Number(…) op Number(…)), not a JavaScript number', () => {
    expect(component('bool-and')).toMatch(/Boolean\(Number\(\w+\$?\) & Number\(\w+\$?\)\)/);
    expect(component('bool-xor')).toMatch(/Boolean\(Number\(\w+\$?\) \^ Number\(\w+\$?\)\)/);
  });
});

describe('a runtime int goes through the checked, exact helpers (ADR-0050)', () => {
  it('a runtime shift is intShl, not a 32-bit JavaScript shift', () => {
    const source = component('runtime-shift');
    expect(source).toMatch(/intShl\(_n\.get\(\), 40\)/);
    expect(source).not.toContain('<<');
  });

  it('a compound mask is intAnd', () => {
    expect(component('runtime-mask')).toMatch(/_n\.set\(intAnd\(_n\.(get|peek)\(\), 4278190080\)\)/);
  });

  it('~ is intNot', () => {
    expect(component('runtime-not')).toContain('intNot(_n.get())');
  });

  it('a product, a compound add and an increment are each checked', () => {
    const source = component('runtime-arithmetic');
    expect(source).toContain('intMul(');
    expect(source).toMatch(/intAdd\(/);
    expect(source).not.toMatch(/\* 7|\+ 1\b/);
  });

  it('% and ~/ use the Dart-correct helpers, not the old formula', () => {
    const source = component('runtime-modulo');
    expect(source).toContain('intMod(');
    expect(source).toContain('intTruncDiv(');
    expect(source).not.toContain('Math.trunc');
  });

  it('an overflowing product is intMul — which throws BRG4011 at runtime instead of rounding', () => {
    expect(component('runtime-overflow')).toMatch(/intMul\(_n\.(get|peek)\(\), _n\.(get|peek)\(\)\)/);
  });

  it('% and ~/ on a double use numMod and numTruncDiv — the old formula was wrong for a negative divisor', () => {
    const source = component('double-modulo');
    expect(source).toContain('numMod(');
    expect(source).toContain('numTruncDiv(');
    expect(source).not.toContain('Math.trunc');
  });

  it('the helpers are imported from the runtime kit', () => {
    expect(component('runtime-shift')).toMatch(/import \{[^}]*intShl[^}]*\} from '@bridge\/runtime-react'/);
  });
});

describe('a constant the domain cannot hold is refused at build time, before any code is emitted', () => {
  const refuse = () => {
    const { context, reported } = harness(compiledFrom(intBitRefusalRaw()));
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.code === 'BRG3002' && d.severity === 'error') };
  };

  it('refuses 1 << 62, an overflowing product, a division by zero and a negative shift, and emits nothing', () => {
    const { files, errors } = refuse();
    expect(errors).toHaveLength(4);
    expect(files).toEqual([]);
  });

  it('each message names the constant and the reason', () => {
    const messages = refuse().errors.map((d) => d.message);
    expect(messages.some((m) => m.includes('1 << 62') && m.includes('safe-integer domain'))).toBe(true);
    expect(messages.some((m) => m.includes('3037000499 * 3037000499') && m.includes('safe-integer domain'))).toBe(true);
    expect(messages.some((m) => m.includes('5 ~/ 0') && m.includes('divides by zero'))).toBe(true);
    expect(messages.some((m) => m.includes('1 << -1') && m.includes('negative count'))).toBe(true);
    expect(messages.every((m) => m.includes('ADR-0050'))).toBe(true);
  });
});
