import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, structuralClassConstructionRaw, typecheckEmitted } from './support.js';

// The ADR-0036 (M9-O) build-proof — a bounded, structural project-class construction lowers to a plain
// JS object literal (`{ name: 'A', count: 7 }`), never a runtime class, never a constructor call — with
// the constructor's own parameter order (`name`, then `count`) preserved in the emitted property order
// even though it differs from the field's own declaration order (`count`, then `name`).
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(structuralClassConstructionRaw());

describe('ADR-0036 build-proof: bounded structural project-class construction, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('Model(\'A\', 7) lowers to a plain object literal, property order following the constructor, not the field declaration', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    // Constructor order is `name` then `count` — the opposite of the field's own declaration order.
    expect(home).toContain("{ name: 'A', count: 7 }");
    expect(home).not.toContain('new Model');
    expect(home).not.toContain('class Model');
    expect(home).not.toMatch(/\bany\b/);
  });

  it('never imports Model as a value — no runtime import is needed for an unannotated local', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).not.toMatch(/import\s*\{\s*Model\s*\}/);
    expect(home).not.toMatch(/import\s*\{\s*type Model\s*\}/);
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
