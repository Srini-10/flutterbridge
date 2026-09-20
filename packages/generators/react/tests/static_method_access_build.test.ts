import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, staticMethodAccessRaw, typecheckEmitted } from './support.js';

// M11-A positive proof (ADR-0045) — real analyzer, real `bridge normalize`, real generator: a call to a
// project-defined class's own STATIC method — no receiver at all — resolves a real target and lowers to
// a real, callable, module-level TypeScript function.
//
// Before this milestone, EVERY static reference reached the generator as an untargeted, dotted-name
// `logic.Ref`/`logic.Call.callee`, refusing honestly via `BRG3006` ("not declared in this program") — a
// missing capability, never a silent-wrong-code bug (confirmed via a live probe; see ADR-0045 §2).
describe('M11-A: a call to a project-defined class\'s own static method lowers to a real function, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every static-method shape here is fully supported', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1 — the smallest positive case: a static method call, no receiver at all.
  it('a bare static method call lowers to a real, self-less function call', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_compute(x: number): number {\n  return intMul(x, 2);\n}');
    const component = files.find((f) => f.path.endsWith('smallest-positive-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_compute(3)');
  });

  // R2 — multiple static calls, including one with an optional-default argument (M10-C/M10-E) supplied
  // and omitted, in one expression.
  it('multiple static calls, one with an optional-default argument, each lower independently', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_scale(x: number, bonus: number = 0): number {\n  return intAdd(intMul(x, 3), bonus);\n}',
    );
    const component = files.find((f) => f.path.endsWith('multiple-calls-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_compute(3)');
    expect(component!.contents).toContain('Model_scale(3)');
    expect(component!.contents).toContain('Model_scale(3, 1)');
  });

  // R3a — composition: a static method's own body calls ANOTHER static method of the same class.
  it('a static method composes with another static method of the same class', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_doubleCompute(x: number): number {\n  return Model_compute(Model_compute(x));\n}',
    );
  });

  // R3b — composition: a static method's own body calls an INSTANCE getter/method on a parameter
  // (M9-L/M10-A/B), unaffected by this milestone.
  it('a static method composes with an instance getter on its own parameter', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_composeWithInstance(m: Model): number {\n' +
        '  return intAdd(Model_doubled(m), Model_compute(m.count));\n' +
        '}',
    );
  });

  // R4/R6 — cross-file AND identity: `OtherModel.compute` shares a NAME with `Model.compute` but is a
  // DIFFERENT owner — proves target resolution is owner-qualified, never name-based, and that a static
  // method declared in a different file resolves through the ordinary cross-module import mechanism.
  it('a same-named static method on a different, cross-file class resolves independently', () => {
    const normalized = compiledFrom(staticMethodAccessRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const other = files.find((f) => f.path.endsWith('lib/other-model.ts'));
    expect(other).toBeDefined();
    expect(other!.contents).toContain('export function OtherModel_compute(x: number): number {\n  return intMul(x, 5);\n}');
    const component = files.find((f) => f.path.endsWith('cross-file-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_compute(3)');
    expect(component!.contents).toContain('OtherModel_compute(3)');
    expect(component!.contents).not.toContain('unknown');
  });
});
