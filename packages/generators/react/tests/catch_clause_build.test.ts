import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { catchClauseRaw, cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// The M8-S build-proof — a catch clause's own exception binding gains declaration-tier identity (ADR-28,
// amended M8-S): two unrelated actions catching an exception under the identical name `e`, and an
// ordinary local sharing both a name and the same per-owner ordinal sequence as a catch-bound exception.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified — N5's own closure-capture check,
// generalised for ADR-28, already covers this case with zero further changes), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other
// build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(catchClauseRaw());

describe('M8-S build-proof: a catch clause’s own exception binding, real analyzer to real tsc', () => {
  it('the generator reports no error — no caught-exception read is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('two unrelated actions catching under the identical name `e` never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    const firsts = [...source.matchAll(/catch \(e\) \{\s*\n\s*_log\.set\(`first failed: \$\{e\}`\);/g)];
    const seconds = [...source.matchAll(/catch \(e\) \{\s*\n\s*_log\.set\(`second failed: \$\{e\}`\);/g)];
    expect(firsts).toHaveLength(1);
    expect(seconds).toHaveLength(1);
  });

  it('a catch-bound exception correctly shadows an outer local of the identical name', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    // The try body's own read of `total` (before the catch) must read the OUTER, ordinary local; the
    // catch body's own read of `total` must read the INNER, catch-bound exception — real Dart shadowing,
    // reproduced faithfully in the emitted JS, which shadows exactly the same way.
    expect(source).toMatch(
      /const total = 1;\s*\n\s*try \{\s*\n\s*_log\.set\(`total is \$\{total\}`\);\s*\n\s*\} catch \(total\) \{\s*\n\s*_log\.set\(`mixed failed: \$\{total\}`\);/,
    );
  });

  it('Flutter → analyzer → compiler (N1–N11, N5 unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
