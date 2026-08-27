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

  // M10-A §15/§16: `subtract(a, b) => count - a - b` is non-commutative — swapping `5`/`2` changes the
  // result, so a passing left-to-right argument-order assertion cannot be an accident of commutativity.
  it('multiple arguments reach the helper in the program\'s own left-to-right order, never reordered', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_subtract(self: Model, a: number, b: number): number {');
    expect(model!.contents).toContain('return ((self.count - a) - b);');
    const component = files.find((f) => f.path.endsWith('method-call-on-local.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_subtract({ count: 7 }, 5, 2)');
  });

  // M10-A §29: a getter (M9-Q) and a method (ADR-0039) on the identical class, sharing the identical
  // structural receiver — proves both helper kinds coexist without regressing one another.
  it('a getter and a method on the same class coexist with distinct helper identities', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_doubled(self: Model): number {');
    expect(model!.contents).toContain('export function Model_multiply(self: Model, factor: number): number {');
    const component = files.find((f) => f.path.endsWith('method-call-on-local.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_doubled({ count: 7 })');
  });

  // M10-A §6/§26/§57: an EXTERNAL receiver (a real widget constructor parameter, never locally
  // constructed) must lower through the identical helper a locally-constructed receiver does — no hidden
  // "was this constructed here" marker anywhere in the runtime representation or the generated call.
  it('an external (prop) receiver lowers through the identical helper as a locally-constructed one', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const component = files.find((f) => f.path.endsWith('external-receiver-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply(props.model, 3)');
    expect(component!.contents).toContain('Model_subtract(props.model, 5, 2)');
    expect(component!.contents).toContain('Model_doubled(props.model)');
    expect(component!.contents).not.toContain('.multiply(');
  });

  // M10-A §28: `Model.unusedMultiplier` is a real, otherwise-fully-eligible method never called
  // anywhere in this program — reachability must stay selective ("class is known" never implies "every
  // one of its own methods is emitted"), mirroring the identical, already-proven getter-reachability
  // discipline (ADR-0038).
  it('an eligible but unreachable sibling method is never emitted', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).not.toContain('unusedMultiplier');
  });

  // A real, pre-existing bug found while designing M10-B (see `isSelfReceiver`'s own doc comment,
  // `expression.ts`): `other.count`, where `other` is a project-class-typed PARAMETER of the identical
  // class, was silently rewritten to `self.count` — `other.count` and `this.count`/bare `count` resolve
  // to the identical `target` (declaration provenance is receiver-agnostic, ADR-0033), and the member-
  // `self`-rewrite matched on `target` alone, with no check that the receiver was actually `this`.
  it('a project-class-typed parameter reads its OWN field, never the current receiver\'s', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_combineWith(self: Model, other: Model): number {\n  return other.count;\n}');
    const component = files.find((f) => f.path.endsWith('combine-with-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_combineWith(props.a, props.b)');
  });
});
