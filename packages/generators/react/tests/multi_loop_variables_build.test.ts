import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, multiLoopVariablesRaw, typecheckEmitted } from './support.js';

// The M9-B build-proof — a C-style loop declaring more than one variable
// (`for (var i = 0, j = 10; i < j; i++, j--)`) gains the same declaration-tier identity a
// single-declaration C-style loop already has (M9-A): two declarations, three declarations,
// byte-identical initializer content, nested loops sharing both variable names, cross-action
// collisions, an ordinary local sharing a name, and omitted condition/update clauses — all proven to
// resolve each read to the exact declaration in scope at that point, never by name.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(multiLoopVariablesRaw());

describe('M9-B build-proof: C-style multi-declaration loop variable identity, real analyzer to real tsc', () => {
  it('the generator reports no error — no multi-declaration loop read is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('two declarations lower to one `let` with a comma-separated declarator list, both resolved throughout', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      'for (let i = 0, j = 10; (i < j); i = i + 1, j = j - 1) {\n      out = out + `${i},${j};`;\n    }',
    );
  });

  it('three declarations all resolve, distinctly', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0, j = 1, k = 2; (i < 3); i = i + 1, j = j + 1, k = k + 1) {');
  });

  it('byte-identical initializer content never collapses to one declaration', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0, j = 0; ((i < j) || (i < 2)); i = i + 1, j = j + 1) {');
  });

  it('nested multi-declaration loops sharing both variable names never conflate the inner and outer declarations', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    // JS block scoping shadows exactly the way the two Dart declarations did (ADR-28 §12) — the outer
    // read after the inner loop ends must read the outer `i`/`j`, not the inner ones that just went out
    // of scope. The proof that they are four distinct *declarations* lives at the extraction level
    // (`extraction_test.dart`), the same division every other identity build-proof in this suite uses.
    expect(source).toContain(
      'for (let i = 0, j = 2; (i < j); i = i + 1, j = j - 1) {\n      for (let i = 0, j = 1; (i < j); i = i + 1, j = j - 1) {\n        out = out + `inner:${i},${j};`;\n      }\n      out = out + `outer:${i},${j};`;\n    }',
    );
  });

  it('two unrelated actions declaring a multi-declaration loop under identical names never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('_log.set(`A:${out}`)');
    expect(source).toContain('_log.set(`B:${out}`)');
  });

  it('an ordinary local sharing a name with a loop declaration never collides', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      'for (let i = 0, j = 5; (i < j); i = i + 1, j = j - 1) {\n      out = out + `${i},${j};`;\n    }\n    const i = 99;\n    out = out + `after:${i}`;',
    );
  });

  it('an omitted condition and update clause lower correctly, the declarator list unchanged', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0, j = 5; ; ) {');
  });

  it('Flutter → analyzer → compiler (N1–N11, N5 unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
