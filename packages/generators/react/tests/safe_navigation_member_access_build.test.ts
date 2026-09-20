import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, safeNavigationMemberAccessRaw, typecheckEmitted } from './support.js';

// M10-F positive proof (ADR-0044) — real analyzer, real `bridge normalize`, real generator: a null-aware
// access (`?.`) on a bare reference receiver — a component prop, a local bound to one, or a method
// parameter — lowers to a real, single-evaluation conditional (`receiver !== null ? <access> : null`),
// matching Dart's own short-circuit semantics exactly.
//
// Before this milestone, `?.` was silently DROPPED — extracted identically to unconditional `.` access —
// reaching real `tsc --strict` as a `possibly null`/argument-type failure, with zero diagnostic from this
// compiler itself. This is the exact silent-wrong-code shape M9-R/ADR-0041/0042/0043 each already found
// and closed once for a different construct — confirmed via a live probe, not a permanent test; see
// ADR-0044 §2 for the recorded before/after evidence.
describe('M10-F: safe-navigation (`?.`) on a bare reference receiver lowers to a real conditional, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every safe-navigation shape here is fully supported', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1 — the smallest positive case: a single field read.
  it('a bare field read on a nullable component prop lowers to a real conditional', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('smallest-positive-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('((props.model !== null) ? props.model.count : null)');
  });

  // R2 — a field, a getter, and a method call (with and without an optional-with-default argument,
  // M10-C/M10-E), each independently guarded.
  it('a field, a getter, and a method call are each independently guarded', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('multiple-access-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('((props.model !== null) ? props.model.count : null)');
    expect(component!.contents).toContain('((props.model !== null) ? Model_doubled(props.model) : null)');
    expect(component!.contents).toContain('((props.model !== null) ? Model_multiply(props.model, 3) : null)');
    expect(component!.contents).toContain('((props.model !== null) ? Model_multiply(props.model, 3, 1) : null)');
  });

  // R3 — safe navigation on a LOCAL VARIABLE bound to a nullable prop, not the prop itself.
  it('a local variable bound to a nullable prop is itself a safe-to-duplicate receiver', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('local-binding-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('((props.model !== null) ? props.model.count : null)');
    expect(component!.contents).toContain('((props.model !== null) ? Model_doubled(props.model) : null)');
    expect(component!.contents).toContain('((props.model !== null) ? Model_multiply(props.model, 3) : null)');
  });

  // R4 — safe navigation at the OUTER call composes, unchanged, with M10-B member composition at the
  // INNER call: `quadrupled`'s own body calls `doubled` internally.
  it('safe navigation composes with existing member-helper composition (M10-B)', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('composition-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('((props.model !== null) ? Model_quadrupled(props.model) : null)');
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_quadrupled(self: Model): number {\n  return intMul(Model_doubled(self), 2);\n}',
    );
  });

  // R5 — safe navigation on a nullable, cross-file-typed component parameter — proves the transitive
  // class-type-reachability fixed point (ADR-0041 §3) and the safe-navigation guard compose correctly.
  it('safe navigation works identically for a nullable cross-file-typed receiver', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const component = files.find((f) => f.path.endsWith('cross-file-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('((props.other !== null) ? props.other.value : null)');
    expect(component!.contents).toContain('((props.other !== null) ? OtherModel_doubled(props.other) : null)');
    expect(component!.contents).not.toContain('unknown');
  });

  // R6 — safe navigation combined with `??`.
  it('safe navigation composes correctly with a `??` fallback', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('fallback-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('(((props.model !== null) ? props.model.count : null) ?? -1)');
  });

  // R7 — shadowing: `Model.describe`'s own parameter is named identically to the class's own `doubled`
  // getter, and its own body safe-navigates on the PARAMETER — proving the guard's own receiver
  // resolution reads the shadowing parameter, never the getter of the identical name, AND that safe
  // navigation works correctly inside a method helper's own body, not only a component's render tree.
  it('a parameter shadowing a getter of the identical name resolves correctly inside a method helper body', () => {
    const normalized = compiledFrom(safeNavigationMemberAccessRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_describe(self: Model, doubled: Model | null): number {\n' +
        '  return (((doubled !== null) ? doubled.count : null) ?? -1);\n' +
        '}',
    );
    const component = files.find((f) => f.path.endsWith('shadowing-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_describe(props.model, props.other)');
  });
});
