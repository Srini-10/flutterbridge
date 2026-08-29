import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, memberHelperCompositionRaw, typecheckEmitted } from './support.js';

// M10-B positive proof (ADR-0040) — real analyzer, real `bridge normalize`, real generator: one bounded
// executable project-class member (a getter or a method) calling ANOTHER bounded executable member on the
// SAME receiver lowers to a real function call over the identical `self`, never `self.doubled` (there is
// no such property) and never a second, freshly-evaluated receiver.
//
// Generalizes M9-Q's own bounded getter-execution architecture and ADR-0039's own bounded method-
// execution architecture from isolated leaves to a same-class dependency graph.
describe('M10-B: one member helper calling another on the same receiver, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every composition form is fully supported', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('method → getter, bare and explicit `this`, both call the identical getter helper with the same self', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_doubled(self: Model): number {');
    expect(model!.contents).toContain('export function Model_quadrupled(self: Model): number {\n  return (Model_doubled(self) * 2);\n}');
    expect(model!.contents).toContain(
      'export function Model_quadrupledExplicit(self: Model): number {\n  return (Model_doubled(self) * 2);\n}',
    );
  });

  it('method → method, bare and explicit `this`, both call the identical method helper with the same self and argument', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_multiply(self: Model, factor: number): number {');
    expect(model!.contents).toContain('export function Model_octupled(self: Model): number {\n  return Model_multiply(self, 8);\n}');
    expect(model!.contents).toContain(
      'export function Model_octupledExplicit(self: Model): number {\n  return Model_multiply(self, 8);\n}',
    );
  });

  it('a method reading both a getter and a method dependency composes both in one body', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_combined(self: Model, factor: number): number {\n  return (Model_doubled(self) + Model_multiply(self, factor));\n}',
    );
  });

  // M10-B §36/§63: a parameter named identically to the getter `doubled` wins — a bare reference stays
  // lexical, never a dependency edge to the getter.
  it('a parameter shadowing a getter name resolves to the parameter, never a dependency edge', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_shadowedByParam(self: Model, doubled: number): number {\n  return doubled;\n}');
  });

  // M10-B §37: the explicit member target wins even under shadowing — the method-composition sibling of
  // ADR-0039's own `this.value + value` proof (M10-A §13/§58).
  it('explicit `this.doubled` under an identically-named parameter still resolves to the getter', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_shadowedByParamExplicit(self: Model, doubled: number): number {\n  return Model_doubled(self);\n}',
    );
  });

  it('the call site passes the receiver by construction, once — never `.doubled`/`.multiply(` as a property/method', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('composition-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_quadrupled({ count: 7 })');
    expect(component!.contents).toContain('Model_combined({ count: 7 }, 3)');
    expect(component!.contents).not.toContain('.doubled');
    expect(component!.contents).not.toContain('.multiply(');
  });

  // M10-B §56 — the positive half: `a` depends on `b`, which depends on `c`; using only `.a()` must make
  // all three reachable, not just `a` itself.
  it('a transitive A→B→C chain, used only via A, makes all three reachable', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function ChainFull_c(self: ChainFull): number {\n  return self.count;\n}');
    expect(model!.contents).toContain('export function ChainFull_b(self: ChainFull): number {\n  return ChainFull_c(self);\n}');
    expect(model!.contents).toContain('export function ChainFull_a(self: ChainFull): number {\n  return ChainFull_b(self);\n}');
  });

  // M10-B §56 — the negative half, on a SEPARATE class with the identical shape: used only via `.b()`
  // (never `.a()` anywhere in the program), `b`/`c` become reachable but `a` must NOT — reachability is
  // directional, never "the whole class is reachable because one of its own members is."
  it('the identical chain shape, used only via B, reaches B and C but never emits A', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function ChainPartial_c(self: ChainPartial): number {\n  return self.count;\n}');
    expect(model!.contents).toContain('export function ChainPartial_b(self: ChainPartial): number {\n  return ChainPartial_c(self);\n}');
    expect(model!.contents).not.toContain('ChainPartial_a');
  });

  // M10-B — the retry loop's own necessity, adversarially proven: mutated to a single pass, this exact
  // case (a method declared BEFORE its own dependency) fails; reverting the mutation restores it. Kept
  // here as a permanent regression, not only a mutation-test artifact — declaration order is not a
  // dependency order (mirroring `reachableFunctions`'s own "Attempts, not a single ordered pass").
  it('a method declared BEFORE its own dependency still succeeds — declaration order is not a dependency order', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Model_lateHelper(self: Model): number {\n  return (self.count + 1);\n}');
    expect(model!.contents).toContain('export function Model_earlyCaller(self: Model): number {\n  return (Model_lateHelper(self) * 3);\n}');
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(memberHelperCompositionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
