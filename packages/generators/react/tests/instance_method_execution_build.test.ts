import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, instanceMethodExecutionRaw, typecheckEmitted } from './support.js';

// M10-A positive proof (ADR-0039) — real analyzer, real `bridge normalize`, real generator: an instance
// method call on a LOCALLY-CONSTRUCTED (M9-O) project-class receiver, whose declaration meets every
// ADR-0039 gate, lowers to a bounded, structural helper call — never a runtime class, prototype, or
// method property on the emitted structural object, and never the naive `receiver.method(args)` a class
// this generator has no member model for would otherwise produce.
//
// This is the sibling positive case of `method_call_refusal_build.test.ts` (M9-R): the identical receiver
// shape, and a method identical in every respect except that every one of its own parameters is
// required-positional.
describe('M10-A: an eligible instance method call on a locally-constructed receiver lowers to a helper call, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — the call is fully supported', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('emits a bounded method helper — never a `multiply` property on the structural interface', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    // The interface carries only the bounded, immutable field shape (ADR-0035) — no method signature.
    const interfaceMatch = model!.contents.match(/export interface Model \{([\s\S]*?)\}/);
    expect(interfaceMatch).not.toBeNull();
    expect(interfaceMatch![1]).toMatch(/^\s*readonly count: number;\s*$/);
    expect(interfaceMatch![1]).not.toContain('multiply');
    // A real, standalone helper function — `self` first, then the method's own parameters, in order.
    expect(model!.contents).toContain('export function Model_multiply(self: Model, factor: number): number {');
    expect(model!.contents).toContain('return (self.count * factor);');
  });

  it('the call site passes the receiver and the argument, in order, to the helper — never a method property', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('method-call-on-local.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply({ count: 7 }, 3)');
    expect(component!.contents).not.toContain('.multiply(');
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
