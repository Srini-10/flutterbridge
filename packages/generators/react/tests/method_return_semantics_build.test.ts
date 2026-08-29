import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, methodReturnSemanticsRaw, typecheckEmitted } from './support.js';

// M10-D positive proof (ADR-0042) — real analyzer, real `bridge normalize`, real generator: a bounded
// instance method's own RETURN VALUE may be consumed by arithmetic, a further property read, a further
// eligible getter, or a further eligible method call — same class or a different one, same file or a
// different one — composing to real helper nesting, never a runtime-prototype-method call on the emitted
// structural object.
//
// This milestone required zero new UIR representation: every one of these consumption shapes is emitted
// by the identical `logic.MethodCall`/helper/receiver architecture M10-A/M10-B/M10-C already shipped. The
// two real, in-scope bugs this reduction ladder exposed and fixed are (1) a missing return-type
// eligibility gate (a method returning `dynamic`/a generic instantiation reached a real, un-refused
// helper with an `unknown` return type) and (2) a cross-class method-helper emission-ordering gap (see
// the `CrossClassChainDemo` test below) — see ADR-0042 §4/§5.
describe('M10-D: bounded instance-method return values may be chained, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every consumption shape is fully supported', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1/R2/R3 — a primitive result, standalone, in arithmetic, and combined from multiple calls, in
  // left-to-right order (ADR-0041's own evaluation-order contract, unaffected by return-value chaining).
  it('a primitive method result is usable as an ordinary value, standalone or in arithmetic', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const primitive = files.find((f) => f.path.endsWith('primitive-result-demo.tsx'));
    expect(primitive).toBeDefined();
    expect(primitive!.contents).toContain('Model_multiply({ count: 7 }, 3)');
    const inExpr = files.find((f) => f.path.endsWith('primitive-result-in-expression-demo.tsx'));
    expect(inExpr).toBeDefined();
    expect(inExpr!.contents).toContain('(Model_multiply({ count: 7 }, 3) + 2)');
    const multiple = files.find((f) => f.path.endsWith('multiple-results-demo.tsx'));
    expect(multiple).toBeDefined();
    expect(multiple!.contents).toContain('(Model_multiply({ count: 7 }, 2) + Model_multiply({ count: 7 }, 3))');
  });

  // R4 — a getter call on a method's own result composes to a real helper call, never `.doubled` property
  // syntax on the call's own result.
  it('a getter call on a method result composes to a nested helper call', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('getter-after-method-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_doubled(Model_next({ count: 7 }))');
    expect(component!.contents).not.toContain('.doubled');
  });

  // R5 — an immutable field read on a method's own result — the M9-N bounded field-read subset applies
  // identically to a chained receiver as it does to any other.
  it('a field read on a method result reads the returned object\'s own field directly', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('field-after-method-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_next({ count: 7 }).count');
  });

  // R6 (same class) — the critical chaining case: a method call on a method's own result, never
  // `Model_next(self).multiply(...)` (there is no such runtime method on the emitted structural object).
  it('a method call on a same-class method result composes to nested helper calls, never a runtime method', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('method-after-method-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply(Model_next({ count: 7 }), 3)');
    expect(component!.contents).not.toContain('.multiply(');
  });

  // R6 (cross-class) — the identical chaining case, but the method called on the result belongs to a
  // DIFFERENT class than the one the chain started on. `Leader`'s own id is confirmed, by real generation,
  // to sort BEFORE `Follower`'s in the class-emission order, so this is a genuine regression proof for the
  // cross-class method-helper emission-ordering fix (ADR-0042 §5) — not merely a same-order coincidence.
  it('a method call chained across TWO DIFFERENT classes composes correctly regardless of class emission order', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Leader_chain(self: Leader): number {\n  return Follower_terminal(Leader_toFollower(self));\n}',
    );
    const component = files.find((f) => f.path.endsWith('cross-class-chain-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Leader_chain({ count: 7 })');
  });

  // R7 — a receiver constructed inline, immediately followed by a method call whose own result is
  // immediately the receiver of a further field read — no intermediate local at any step.
  it('a fully inline constructed-receiver-then-method-result chain lowers without an intermediate local', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('local-construction-result-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_transform({ count: 7 }, 2).count');
  });

  // R8 — the sibling positive case to the local-receiver demos above: `model` arrives as a real widget
  // constructor parameter, not a value this build method constructs. Method-result chaining must hold
  // identically for an external receiver.
  it('an external (prop) receiver preserves method-result chaining identically to a local one', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('external-receiver-result-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply(props.model, 3)');
    expect(component!.contents).toContain('Model_doubled(Model_next(props.model))');
  });

  // R9 — a project-class return declared in a SEPARATE Dart file, chained with a further getter call —
  // proving the cross-file import wiring and the transitive class-type-reachability fixed point (ADR-0041
  // §3) both already extend to a method's own RETURN type, never rendering `unknown`.
  it('a cross-file project-class return carries its real type and composes with a further getter call', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_toOther(self: Model): OtherModel {');
    expect(model!.contents).not.toContain('unknown');
    const otherModel = files.find((f) => f.path.endsWith('lib/other-model.ts'));
    expect(otherModel).toBeDefined();
    expect(otherModel!.contents).toContain('export function OtherModel_doubled(self: OtherModel): number {');
    const component = files.find((f) => f.path.endsWith('cross-file-return-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_toOther({ count: 7 }).value');
    expect(component!.contents).toContain('OtherModel_doubled(Model_toOther({ count: 7 }))');
  });

  // R9 (field-only) — `Wrapped` has no getter or method of its own, reachable EXCLUSIVELY through
  // `Model.wrap()`'s own return type. Isolates the transitive class-type-reachability fixed point
  // (ADR-0041 §3) from `OtherModel`'s own sibling test above, where the returned class is ALSO
  // independently reachable as a getter owner and would enter `classIdsNeedingTypes` regardless of the
  // transitive walk — a real, live-probed gap found while mutation-testing this exact fixed point (§7
  // below), the coverage gap Phase 12 of the governing brief explicitly asks to close rather than paper
  // over with an uncaught mutation.
  it('a return type reachable ONLY through the transitive class-type walk still carries its real type', () => {
    const normalized = compiledFrom(methodReturnSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_wrap(self: Model): Wrapped {');
    expect(model!.contents).not.toContain('unknown');
    const otherModel = files.find((f) => f.path.endsWith('lib/other-model.ts'));
    expect(otherModel).toBeDefined();
    expect(otherModel!.contents).toContain('export interface Wrapped {\n  readonly value: number;\n}');
    const component = files.find((f) => f.path.endsWith('wrapped-field-only-return-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_wrap({ count: 7 }).value');
  });
});
