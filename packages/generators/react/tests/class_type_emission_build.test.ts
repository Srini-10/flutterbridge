import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { classTypeEmissionRaw, cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// The ADR-0034 (M9-M) build-proof — a bounded, type-only project-class reference (never constructed,
// never member-accessed) reaches generated TypeScript as a real, named type instead of `unknown`: a
// cross-file reference (`Model`/`OtherModel`, declared in their own Dart files), a repeated reference to
// the identical class (shared, never duplicated), and a nullable form.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(classTypeEmissionRaw());

describe('ADR-0034 build-proof: project-class type emission and reachability, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('emits one generated type module per Dart source file, never per declaration or per package', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const generated = files.map((f) => f.path).filter((p) => p.startsWith('src/generated/dart/'));
    expect(generated.sort()).toEqual(['src/generated/dart/app/lib/model.ts', 'src/generated/dart/app/lib/other-model.ts']);
  });

  it('each module declares a type-only, empty interface — never a runtime class, never a member shape', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    const other = fileAt(files, 'src/generated/dart/app/lib/other-model.ts') ?? '';
    expect(model).toContain('export interface Model {}');
    expect(model).not.toContain('class Model');
    expect(other).toContain('export interface OtherModel {}');
    expect(other).not.toContain('class OtherModel');
  });

  it("a component's own props reference the real class name, imported type-only, never `unknown`", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).toContain("import { type Model } from '@/generated/dart/app/lib/model';");
    expect(home).toContain("import { type OtherModel } from '@/generated/dart/app/lib/other-model';");
    expect(home).not.toContain('unknown');
    // No `any` escape hatch (ADR-0034 §37) — type identity is preserved, never suppressed.
    expect(home).not.toMatch(/\bany\b/);
  });

  it('a repeated reference to the identical class shares one generated type, never duplicated', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).toContain('readonly model: Model | null;');
    expect(home).toContain('readonly repeated: Model | null;');
    // One `Model` type-only import, not two — `ModuleBuilder.use` is idempotent per (from, name).
    expect(home.match(/from '@\/generated\/dart\/app\/lib\/model'/g)).toHaveLength(1);
  });

  it('a nullable project-class type stays distinct from its non-nullable form', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home.tsx') ?? '';
    expect(home).toContain('readonly maybeModel: Model | null;');
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
