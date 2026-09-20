import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { asyncMethodAwaitRaw, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// M11-B positive proof (ADR-0046) — real analyzer, real `bridge normalize`, real generator: a call to a
// project-defined class's own `async` method — instance or static — resolves a real target and lowers to
// a real, `Promise`-returning, callable function ONLY when the Dart call is the direct operand of an
// explicit `await`. Before this milestone, EVERY async method call refused honestly via `BRG3013`, whether
// awaited or not — this proves the awaited subset now works end to end, without weakening that refusal for
// the un-awaited shape (see `method_call_refusal_build.test.ts`'s own `AsyncModel`, unaffected).
describe('M11-B: an explicitly awaited call to a project-defined async method lowers to a real Promise-returning function, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every awaited shape here is fully supported', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1/R2 — the smallest positive case: an instance method, awaited, no arguments.
  it('a bare, awaited instance method call lowers to a real async, Promise-returning function call', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain(
      'export async function Model_load(self: Model): Promise<number> {\n  return intMul(self.count, 2);\n}',
    );
    const store = fileAt(files, 'src/stores/demo-store.ts') ?? '';
    expect(store).toContain('loadResult.set((await Model_load({ count: 7 })));');
  });

  // R5 — arguments, including an optional-with-default one (M10-C/M10-E), composed unchanged.
  it('an awaited call with an optional-default argument composes unchanged', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain(
      'export async function Model_scale(self: Model, factor: number, bonus: number = 0): Promise<number> {\n' +
        '  return intAdd(intMul(self.count, factor), bonus);\n}',
    );
    const store = fileAt(files, 'src/stores/demo-store.ts') ?? '';
    expect(store).toContain('scaleResult.set((await Model_scale({ count: 7 }, 3, 1)));');
  });

  // R4 — a static async method (M11-A composed with M11-B for the first time): no `self` parameter, still
  // correctly async and Promise-wrapped.
  it('an awaited static async method call composes with M11-A, no self parameter', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain(
      'export async function Model_loadStatic(x: number): Promise<number> {\n  return intMul(x, 3);\n}',
    );
    const store = fileAt(files, 'src/stores/demo-store.ts') ?? '';
    expect(store).toContain('staticResult.set((await Model_loadStatic(5)));');
  });

  // R6 — scalar return-type coverage beyond `int`.
  it('an awaited method returning a double lowers with the correct scalar return type', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain('export async function Model_loadDouble(self: Model): Promise<number> {');
  });

  // R7a — return-value composition: an awaited `Future<ProjectClass>`, its own further member read
  // (M10-D return-value chaining, composed with `async`/`await` for the first time). Cross-file (R3).
  // Also the exact-string regression proof for the real bug found and fixed building this milestone
  // (ADR-0046 §12/§9): `logic.Await` now self-parenthesizes, so `.count` reads the AWAITED value, never
  // the `Promise` object `Model_createOther(...)` itself returns.
  it('an awaited Future<ProjectClass> composes correctly with a further member read, correctly parenthesized', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain(
      'export async function Model_createOther(self: Model): Promise<OtherModel> {\n' +
        '  return { count: self.count };\n}',
    );
    const store = fileAt(files, 'src/stores/demo-store.ts') ?? '';
    expect(store).toContain('otherResult.set((await Model_createOther({ count: 7 })).count);');
    expect(store).not.toContain('await Model_createOther({ count: 7 }).count');
    expect(model).not.toContain('unknown');
  });

  // R7b — composition: an `async` method's own body awaits ANOTHER `async` method of the SAME class,
  // unqualified (M10-B internal composition), then composes the awaited value with ordinary arithmetic —
  // proves the awaited VALUE, not the `Future`, is what arithmetic sees.
  it('an async method composes with another async method of the same class via internal composition', () => {
    const normalized = compiledFrom(asyncMethodAwaitRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain(
      'export async function Model_useSelf(self: Model): Promise<number> {\n' +
        '  return intAdd((await Model_load(self)), 1);\n}',
    );
  });
});
