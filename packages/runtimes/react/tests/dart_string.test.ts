import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  strCodeUnitAt,
  strPadLeft,
  strPadRight,
  strRepeat,
  strReplaceAll,
  strReplaceFirst,
  strSubstring,
} from '../src/index.js';

// Every expectation in `str_cases.json` was produced by running the operation in real Dart (`dart run`): its result, or
// the fact that it threw. Regenerate with the script in ADR-0054's evidence section.

interface Case {
  op: string;
  s: string;
  a?: number;
  b?: number;
  p?: string;
  f?: string;
  t?: string;
  r: { v?: unknown; throws?: boolean };
}
const cases = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'str_cases.json'), 'utf8')) as Case[];

const run = (c: Case): unknown => {
  switch (c.op) {
    case 'substring1': return strSubstring(c.s, c.a as number);
    case 'substring2': return strSubstring(c.s, c.a as number, c.b as number);
    case 'codeUnitAt': return strCodeUnitAt(c.s, c.a as number);
    case 'padLeft': return strPadLeft(c.s, c.a as number);
    case 'padRight': return strPadRight(c.s, c.a as number);
    case 'padLeftP': return strPadLeft(c.s, c.a as number, c.p as string);
    case 'padRightP': return strPadRight(c.s, c.a as number, c.p as string);
    case 'repeat': return strRepeat(c.s, c.a as number);
    case 'replaceAll': return strReplaceAll(c.s, c.f as string, c.t as string);
    case 'replaceFirst': return strReplaceFirst(c.s, c.f as string, c.t as string);
    default: throw new Error(`unknown op ${c.op}`);
  }
};

describe('String helpers agree with real Dart', () => {
  it(`all ${cases.length} cases`, () => {
    const failures: string[] = [];
    for (const c of cases) {
      let actual: { v?: unknown; throws?: boolean };
      try {
        actual = { v: run(c) };
      } catch (error) {
        actual = /BRG4015/.test(String((error as Error).message)) ? { throws: true } : { v: `unexpected: ${String(error)}` };
      }
      if (JSON.stringify(actual) !== JSON.stringify(c.r)) failures.push(`${JSON.stringify(c)} → ${JSON.stringify(actual)}`);
    }
    expect(failures.slice(0, 5), `${failures.length} disagree`).toEqual([]);
  });

  it('the cases exercise both results and throws', () => {
    expect(cases.some((c) => c.r.throws === true)).toBe(true);
    expect(cases.some((c) => c.r.v !== undefined)).toBe(true);
  });
});
