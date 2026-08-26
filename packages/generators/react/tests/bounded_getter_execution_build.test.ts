import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { boundedGetterExecutionRaw, cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// The ADR-0038 (M9-Q) build-proof — a bounded, dispatch-safe explicit instance getter
// (`int get doubled => count * 2;`) executes truthfully as a generated, module-level helper function —
// `Model_doubled(self)` — never a runtime class or prototype getter, identically for an externally-supplied
// `Model` prop and a locally-constructed one (M9-O).
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(boundedGetterExecutionRaw());

describe('ADR-0038 build-proof: bounded structural instance getter execution, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('an externally-supplied Model reads `doubled` through the generated helper, not a prototype property', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const external = fileAt(files, 'src/components/external-reader.tsx') ?? '';
    expect(external).toMatch(/Model_doubled\(props\.model\)/);
    expect(external).not.toContain('.doubled');
    expect(external).not.toContain('new Model');
    expect(external).not.toContain('class Model');
    expect(external).not.toMatch(/\bany\b/);
  });

  it('a locally-constructed Model reads `doubled` through the identical helper', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const constructed = fileAt(files, 'src/components/constructed-reader.tsx') ?? '';
    expect(constructed).toMatch(/Model_doubled\(\{ count: 7 \}\)/);
    expect(constructed).not.toContain('.doubled');
  });

  it('the helper itself is a plain module-level function — no runtime class, no prototype, real self-based field read', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain('export interface Model {');
    expect(model).toContain('readonly count: number;');
    expect(model).toMatch(/export function Model_doubled\(self: Model\): number \{/);
    expect(model).toContain('self.count * 2');
    expect(model).not.toContain('class Model');
    expect(model).not.toMatch(/\.prototype\b/);
    expect(model).not.toMatch(/\bany\b/);
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
