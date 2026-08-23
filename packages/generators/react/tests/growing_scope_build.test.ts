import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, growingScopeRaw, harness, typecheckEmitted } from './support.js';

// The M9-C build-proof — a declaration list's own later member now resolves an earlier one
// (`var a = 1, b = a + 1;`, and a C-style loop's own `for (var i = 0, j = i + 1; ...)`) via sequential,
// growing scope: each declaration's own initializer is extracted against the scope before it, and only
// afterward does that declaration itself enter scope. Two- and three-step chains, a later declaration
// resolving more than one earlier one, outer-scope interaction, an ordinary local sharing a name, and
// cross-action collisions are all proven to resolve each read to the exact declaration in scope at that
// point, never by name, with evaluation order preserved.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(growingScopeRaw());

describe('M9-C build-proof: sequential declaration-list scope, real analyzer to real tsc', () => {
  it('the generator reports no error — no cross-initializer read is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('the second declaration resolves the first inside its own initializer, evaluation order preserved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('let a = 1;\n    let b = (a + 1);\n    _log.set(`${a},${b}`);');
  });

  it('a three-step chain resolves each declaration against the one immediately before it, in order', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('let a = 1;\n    let b = (a + 1);\n    let c = (b + 1);');
  });

  it('a later declaration can resolve more than one earlier declaration, not only its immediate predecessor', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('let a = 1;\n    let b = 2;\n    let c = (a + b);');
  });

  it('an outer local stays visible throughout, and a nested declaration list resolves sequentially, source order preserved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      "let x = 10;\n    let out = '';\n    let a = x;\n    let b = (a + x);\n    out = `${a},${b}`;",
    );
  });

  it('an ordinary local sharing a name with an earlier declaration-list member never collides', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain(
      'let a = 1;\n    let b = (a + 1);\n    let out = `${a},${b}`;\n    const a2 = 99;',
    );
  });

  it('two unrelated actions with byte-identical, resolved declaration lists never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('_log.set(`A:${a},${b}`)');
    expect(source).toContain('_log.set(`B:${a},${b}`)');
  });

  it('a C-style loop’s own second declaration resolves the first inside its own initializer', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0, j = (i + 1); (j < 5); i = i + 1, j = j + 1) {');
  });

  it('a C-style loop’s own third declaration resolves both earlier declarations', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('for (let i = 0, j = 1, k = (i + j); (k < 8); i = i + 1, j = j + 1, k = k + 1) {');
  });

  it('Flutter → analyzer → compiler (N1–N11, N5 unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
