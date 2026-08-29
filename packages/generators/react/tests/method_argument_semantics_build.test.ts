import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, methodArgumentSemanticsRaw, typecheckEmitted } from './support.js';

// M10-C positive proof (ADR-0041) — real analyzer, real `bridge normalize`, real generator: bounded
// instance-method calls with MULTIPLE arguments and a variety of receiver shapes (locally constructed,
// constructed inline at the call site, function-produced, cross-class getter/method-produced, fully
// nested, external/prop) — proving the receiver is evaluated before any argument, arguments are
// evaluated left-to-right, exactly once, and every helper-composition guarantee already proven in
// isolation (M10-A, ADR-0039) or on the same receiver (M10-B, ADR-0040) still holds unchanged.
//
// This milestone required zero new UIR representation: every one of these call shapes is emitted by the
// identical `logic.MethodCall`/helper/receiver/argument architecture M10-A/M10-B already shipped. The one
// real, in-scope bug this reduction ladder exposed and fixed is a project-type-reachability gap
// (`classIdsNeedingTypes` in `functions.ts`) — see the `ModelHolder`/`CrossClassReceiverDemo` tests below.
describe('M10-C: bounded instance-method calls with multiple arguments and varied receivers, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every call shape is fully supported', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // Three required-positional arguments, pairwise non-commutative and non-associative — a passing
  // left-to-right, receiver-first assertion cannot be an accident of commutativity or associativity.
  it('multiple arguments reach the helper in the program\'s own left-to-right order, receiver first', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_weighted(self: Model, a: number, b: number, c: number): number {',
    );
    expect(model!.contents).toContain('return ((((self.count * 100) + (a * 10)) - (b * 3)) + c);');
    const component = files.find((f) => f.path.endsWith('method-argument-order-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_weighted({ count: 7 }, 1, 2, 3)');
  });

  // A parameter named identically to the field `count` — the bounded body must read the argument that
  // was passed in, never re-target the field of the identical name.
  it('an argument name that shadows a field resolves to the argument, never the field', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_shadowedArg(self: Model, count: number): number {\n  return (count * 2);\n}',
    );
    const component = files.find((f) => f.path.endsWith('method-argument-order-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_shadowedArg({ count: 7 }, 9)');
  });

  // A getter call AND a method call, on the identical receiver, nested inside a THIRD method's own
  // argument list — helper composition inside argument position, the argument-position sibling of
  // M10-B's own bare-return-expression composition proof.
  it('a getter call and a method call compose correctly inside another call\'s own argument list', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_weightedWithSelfArgs(self: Model, a: number): number {\n' +
        '  return Model_weighted(self, a, Model_doubled(self), Model_multiply(self, 2));\n' +
        '}',
    );
  });

  // The receiver is CONSTRUCTED INLINE, at the call site itself — never bound to a local first. The
  // single-argument constructed-receiver shape already proven in M10-A holds unchanged for multiple
  // arguments, with zero new code.
  it('an inline-constructed receiver works identically for single- and multi-argument calls', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('constructed-receiver-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply({ count: 7 }, 3)');
    expect(component!.contents).toContain('Model_weighted({ count: 7 }, 1, 2, 3)');
  });

  // The receiver is produced by a TOP-LEVEL FUNCTION call — a further reduction-ladder receiver shape
  // than a constructor call or a local variable.
  it('a function-produced receiver lowers through the identical helper', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('function-receiver-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply(makeModel(), 4)');
  });

  // The cross-class receiver proof, and the exact shape that exposed a real, pre-existing project-type-
  // reachability gap: `ModelHolder.model` (a field of project-class type `Model`) and `ModelHolder`'s own
  // getter/method (each RETURNING `Model`) were never chased transitively by `classIdsNeedingTypes`, so
  // both the field and the return types resolved to `unknown` and failed `tsc --strict`. Fixed by a
  // fixed-point discovery extension plus a two-pass (reserve-then-build) class-emission split.
  it('a getter-produced and a method-produced receiver of a DIFFERENT project class both resolve correctly', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    // Never `unknown` — the field and both members carry the real `Model` type.
    expect(model!.contents).toContain('export interface ModelHolder {\n  readonly model: Model;\n}');
    expect(model!.contents).toContain('export function ModelHolder_exposedModel(self: ModelHolder): Model {');
    expect(model!.contents).toContain('export function ModelHolder_buildModel(self: ModelHolder): Model {');
    expect(model!.contents).not.toContain('unknown');
    const component = files.find((f) => f.path.endsWith('cross-class-receiver-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain(
      'Model_multiply(ModelHolder_exposedModel({ model: { count: 7 } }), 3)',
    );
    expect(component!.contents).toContain(
      'Model_multiply(ModelHolder_buildModel({ model: { count: 7 } }), 4)',
    );
  });

  // The FULL nested-construction chain, entirely inline: a `ModelHolder` constructed with an inline
  // `Model`, immediately followed by a method call whose own result is immediately the receiver of a
  // further method call — no intermediate local at any step, and each sub-expression appears exactly
  // once in the generated call, in the program's own nesting order.
  it('a fully inline, nested construction-and-call chain lowers without duplicating any sub-expression', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('nested-construction-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain(
      'Model_multiply(ModelHolder_buildModel({ model: { count: 5 } }), 2)',
    );
  });

  // The sibling positive case to the local-receiver tests above: `model` arrives as a real widget
  // constructor parameter (an external receiver, M9-N's own terms). The multi-argument evaluation-order
  // guarantee must hold identically for an external receiver.
  it('an external (prop) receiver preserves multi-argument evaluation order identically to a local one', () => {
    const normalized = compiledFrom(methodArgumentSemanticsRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('external-receiver-arg-order-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_weighted(props.model, 1, 2, 3)');
    expect(component!.contents).toContain('Model_weightedWithSelfArgs(props.model, 4)');
    expect(component!.contents).not.toContain('.weighted(');
    expect(component!.contents).not.toContain('.weightedWithSelfArgs(');
  });
});
