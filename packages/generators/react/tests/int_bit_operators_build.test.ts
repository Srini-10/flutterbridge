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
// A 64-bit lowering would be exact only while results stay within 2^53, so a runtime `int` is refused by name.
// What *can* be proved is lowered: two integer literals fold to Dart's exact 64-bit result at compile time (flag
// constants like `1 << 20`), and `bool & | ^` becomes `Boolean(Number(a) & Number(b))` — valid strict TypeScript, both operands still evaluated.

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

describe('what is not provable is refused by name', () => {
  const refuse = () => {
    const { context, reported } = harness(compiledFrom(intBitRefusalRaw()));
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.code === 'BRG3002' && d.severity === 'error') };
  };

  it('refuses a runtime shift, a runtime mask, a runtime ~, and a constant that is not a safe integer', () => {
    const { files, errors } = refuse();
    expect(errors).toHaveLength(4);
    expect(files).toEqual([]);
  });

  it('explains the 32-bit / 64-bit difference with a concrete example', () => {
    const messages = refuse().errors.map((d) => d.message);
    expect(messages.some((m) => m.startsWith('`<<`') && m.includes('1099511627776'))).toBe(true);
    expect(messages.some((m) => m.startsWith('`&`'))).toBe(true);
    expect(messages.some((m) => m.startsWith('`~` on an `int`'))).toBe(true);
  });
});
