import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, numericMethodsSemanticsRaw, typecheckEmitted } from './support.js';

// `roundToDouble`, `floorToDouble`, `truncateToDouble` and `int.toRadixString` — real analyzer output in, real `bridge normalize`, real generator,
// real `tsc --strict` against the real kit.
//
// Found by re-measuring App B after `int.toString` was lowered: 65 helpers that had failed on it *still* failed, now on the next numeric method in the
// same body — `roundToDouble` (`formatPct`, `_pct`, `gst_estimate`, `CartItem.roundedLineTotal`: money rounded to the paisa), `truncateToDouble`
// (`adminInr`/`adminCount`, `_compact`), `floorToDouble` (four layout widths) and `int.toRadixString` (the cart's idempotency hash, the hex byte join).
// The first three are not `round`/`floor`/`truncate` (`numRound` and friends return an `int`, range-check it, and throw for NaN and the infinities):
// they return a *double*, unchecked, with `NaN`/`±Infinity` passed through and a zero result keeping its sign, so they are their own runtime helpers,
// compared with real Dart case by case in `dart_numeric.test.ts` (211 cases) and end to end in `numeric_methods_semantics_execution.test.ts`.
// `ceilToDouble` has no caller in either corpus, so it has no lowering and is still refused (`int_to_string_build.test.ts`).

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(numericMethodsSemanticsRaw());

function generated() {
  const { context, reported } = harness(normalized);
  const { files } = reactGenerator.generate(context);
  return { files, reported, main: fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '' };
}

describe('numeric methods, real analyzer to real tsc', () => {
  it('generates with no error', () => {
    const { files, reported } = generated();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it("App B's shapes reach the Dart-exact helpers, not `Math.round`/`Math.floor`/`Math.trunc`/`toString(radix)` directly", () => {
    const { main } = generated();
    expect(main).toContain('numRoundToDouble(v)');
    expect(main).toContain('numTruncateToDouble(v)');
    expect(main).toContain('numTruncateToDouble(n)');
    expect(main).toContain('numFloorToDouble(');
    expect(main).toMatch(/intToRadixString\(b, 16\)/);
    expect(main).toMatch(/intToRadixString\(hash, 16\)/);
    expect(main).not.toMatch(/Math\.(round|floor|trunc)\(/);
    expect(main).not.toMatch(/\.toString\(16\)/);
  });

  it('money rounded to the paisa keeps its order of operations: multiply, round, then divide', () => {
    const { main } = generated();
    expect(main).toMatch(/numRoundToDouble\(\(?[^;]*\* ?100\)?\) \/ 100/);
  });

  it('is deterministic — two generations are byte-identical', () => {
    const a = generated().files.map((f) => `${f.path}\n${f.contents}`);
    const b = generated().files.map((f) => `${f.path}\n${f.contents}`);
    expect(a).toEqual(b);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    typecheckEmitted(generated().files);
  }, 120_000);
});
