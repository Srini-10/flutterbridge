import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, localVariablesRaw, typecheckEmitted } from './support.js';

// The M8-N build-proof — ordinary local variables gain declaration-tier identity (ADR-28): two
// unrelated actions declaring textually identical locals, a local read twice in one expression, a
// mutable (`var`) local, and lexical shadowing at two nesting depths.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, including the N5 closure-capture fix ADR-28
// itself requires), real generator, real `tsc` against the real, unmocked `@bridge/runtime-react` — no
// hand-authored UIR anywhere, matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(localVariablesRaw());

describe('M8-N build-proof: ordinary local variables, real analyzer to real tsc', () => {
  it('the generator reports no error — no local read is misclassified as BRG3006', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3006')).toBe(false);
  });

  it('two unrelated actions with textually identical locals never collide', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    // Each handler declares and reads its own `total` — not a shared, deduplicated variable, and not a
    // dangling reference into the other handler's closure.
    const totals = [...source.matchAll(/const total = 1;\s*\n\s*_log\.set\(total\);/g)];
    expect(totals).toHaveLength(2);
  });

  it('a local read twice in one expression is declared once, not re-evaluated', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    expect(source).toContain('const value = 21;');
    expect(source).toContain('_log.set((value + value));');
    // Never inlined as two separate literals — that would silently duplicate a non-trivial initializer.
    expect(source).not.toMatch(/_log\.set\(\(21 \+ 21\)\)/);
  });

  it('a mutable local is `let`, not silently frozen into `const`', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    expect(source).toContain('let count = 0;');
    expect(source).not.toContain('const count = 0;');
    expect(source).toMatch(/count = \(count \+ 1\);\s*\n\s*count = count \+ 1;/);
  });

  it('a shadowed local resolves each read to its own declaration, not by name', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    // The outer `level` (1) and the inner, shadowing `level` (2) must each be read back by the read that
    // is lexically inside their own scope — never both reading the same one.
    expect(source).toMatch(
      /const level = 1;\s*\n\s*if \(\(_log\.get\(\) === 0\)\) \{\s*\n\s*const level = 2;\s*\n\s*_log\.set\(level\);\s*\n\s*\}\s*\n\s*_log\.set\(level\);/,
    );
  });

  it('Flutter → analyzer → compiler (N1–N11, N5 closure-capture-safe) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
