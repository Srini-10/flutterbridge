import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, immutableFieldReadsRaw, typecheckEmitted } from './support.js';

// The ADR-0035 (M9-N) build-proof — a bounded, immutable instance-field read on a project-defined class
// receiver: a real `readonly` field in the generated type shape, a real receiver-based property read
// (`props.model.count`, `props.model.name`, never a helper function or static dispatch), and a real
// `tsc --strict` proof. `unmodelled_class_member_build.test.ts` carries the complementary negative
// coverage on the identical mechanism (explicit getter/method reads on the same class stay refused).
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(immutableFieldReadsRaw());

describe('ADR-0035 build-proof: bounded immutable field shape and receiver-based reads, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it("the generated Model type carries both fields, readonly, never a runtime class", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain('export interface Model {');
    expect(model).toContain('readonly count: number;');
    expect(model).toContain('readonly name: string;');
    expect(model).not.toContain('class Model');
    expect(model).not.toContain('constructor');
  });

  it('the component reads both fields directly off the receiver — props.model.count, props.model.name', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).toContain('props.model.count');
    expect(home).toContain('props.model.name');
    // No helper/static dispatch, no free variable, no cast-to-any (ADR-0035 §8/§32).
    expect(home).not.toMatch(/\bany\b/);
    expect(home).not.toContain('Model_count');
    expect(home).not.toContain('Model.count');
  });

  it("the field type import is type-only — no runtime import for Model", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).toContain("import { type Model } from '@/generated/dart/app/lib/model';");
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
