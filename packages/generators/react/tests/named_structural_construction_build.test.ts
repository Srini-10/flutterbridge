import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, namedStructuralConstructionRaw, typecheckEmitted } from './support.js';

// The ADR-0037 (M9-P) build-proof — a bounded, constructor-specific structural project-class
// construction: `Model.named(count: 7, name: 'A')` (a required-named-field-formal constructor, distinct
// from `Model`'s own unnamed positional one) lowers to a plain object literal, `{ count: 7, name: 'A' }`
// — the call's own real source argument order, not the constructor's own declaration order (`name`, then
// `count`) and not the field's own declaration order coincidentally matching it.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(namedStructuralConstructionRaw());

describe('ADR-0037 build-proof: constructor-specific structural construction, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it("Model.named(count: 7, name: 'A') lowers to a plain object literal, in the call's own source argument order", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    // The constructor's own declaration order is `name`, then `count` — the call's own labels were
    // written in the opposite order, and that is the order that must survive.
    expect(home).toContain("{ count: 7, name: 'A' }");
    expect(home).not.toContain('new Model');
    expect(home).not.toContain('class Model');
    expect(home).not.toContain('Model.named');
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
