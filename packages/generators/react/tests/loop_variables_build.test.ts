import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, loopVariablesRaw, typecheckEmitted } from './support.js';

// The M9-A build-proof — a `for`-loop's own declared variable(s) gain declaration-tier identity (ADR-28,
// amended M9-A): a for-in loop's own loop variable, a C-style loop's own declared variable (read from its
// own test, update, and body), nested loops, same-name shadowing, cross-action collisions, and an
// ordinary local sharing a name with a loop variable — all proven to resolve each read to the exact
// declaration in scope at that point, never by name.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified — N5's own closure-capture check,
// generalised for ADR-28, already covers this case with zero further changes), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other
// build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(loopVariablesRaw());

describe('M9-A build-proof: a for-loop’s own declared variable(s), real analyzer to real tsc', () => {
  it('the generator reports no error — no loop-variable read is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('a for-in loop variable lowers to `for (const x of xs)`, every read resolved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain("for (const item of items) {\n      out = out + item;\n    }");
  });

  it('a C-style loop’s own declared variable resolves in its test, update, and body alike', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0; (i < 3); i = i + 1) {');
  });

  it('nested loops with distinct names never conflate the inner and outer declarations', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      'for (const outer of outers) {\n      for (const inner of inners) {\n        out = out + outer;\n        out = out + inner;\n      }\n    }',
    );
  });

  it('same-name nested shadowing resolves the inner read to the inner declaration, and the read after the inner loop back to the outer one', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    // JS block scoping shadows exactly the way the two Dart declarations did — nothing here needs a
    // disambiguating suffix (ADR-28 §12) — so the emitted text is unchanged for both `value`s; the proof
    // that they are two distinct *declarations* lives in the extraction-level test
    // (`extraction_test.dart`), the same division of labour every other identity build-proof in this
    // suite uses.
    expect(source).toContain(
      'for (const value of first) {\n      for (const value of second) {\n        out = out + value;\n      }\n      out = out + value;\n    }',
    );
  });

  it('a body-local’s own initializer reads the loop variable correctly', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('const itemCopy = item;');
  });

  it('two unrelated actions declaring a loop variable under the identical name `item` never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain("_log.set(`A:${out}`)");
    expect(source).toContain("_log.set(`B:${out}`)");
  });

  it('a loop variable and an ordinary local sharing a name never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      "for (const item of items) {\n      out = out + item;\n    }\n    const item = 'after';\n    out = out + item;",
    );
  });

  it('Flutter → analyzer → compiler (N1–N11, N5 unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
