import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, instanceMethodExecutionRaw } from './support.js';

// M10-A parameter/field-shadowing proof (§11-14 of the governing brief) — real analyzer, real
// `bridge normalize`, real generator. Freshly proven for a method's own parameter binding, not assumed
// from M9-Q's identical getter-level conclusion (Q59): a method's own parameters are bound by the
// IDENTICAL `Scope.forBody(...).child([Binding...])` mechanism `_function` (a top-level function) already
// uses, so a parameter reference never carries a `target` at all (`_instanceMemberTarget` only resolves an
// `InstanceElement`-owned member, and a parameter's own `enclosingElement` is the executable, not the
// class) — it falls straight through `memberSelf`'s own field-rewrite check to the pre-existing
// `paramInScope` resolution, requiring no new generator-side mechanism.
describe('M10-A: a method parameter or local shadowing a field of the identical name resolves correctly, real analyzer', () => {
  it('a parameter named like a field resolves to the parameter; explicit `this.field` still resolves to the field', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Box_combine(self: Box, value: number): number {');
    // `this.value` (the field) — never confused with the bare `value` parameter reference just below it.
    expect(model!.contents).toContain('const viaField = self.value;');
    expect(model!.contents).toContain('const viaParam = value;');
    expect(model!.contents).toContain('return (viaField + viaParam);');
  });

  // M10-A §13/§58's own literal form: `this.value` and the shadowing parameter `value` combined in ONE
  // expression, not two separate local declarations (`combine`, above) — proving the two identities
  // resolve independently within a single sub-expression too.
  it('the exact single-expression form (`this.value + value`) resolves field and parameter independently', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain('export function Box_exactCombine(self: Box, value: number): number {');
    expect(model!.contents).toContain('return (self.value + value);');
  });

  it('a local variable named like a field, with no parameter of the same name, still resolves `this.field` to the field', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    // Zero parameters — proves a method's own eligibility gate never required a non-empty parameter list.
    expect(model!.contents).toContain('export function Box_doubledViaLocal(self: Box): number {');
    // The local's own initializer reads the FIELD (`self.value`) — the local itself does not yet exist
    // at that point in its own initializer, exactly as Dart's own scoping already requires.
    expect(model!.contents).toContain('const value = (self.value * 2);');
    expect(model!.contents).toContain('return value;');
  });

  it('the call site passes the receiver by construction, in order — never a `.combine(`/`.doubledViaLocal(` property call', () => {
    const normalized = compiledFrom(instanceMethodExecutionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('shadowing-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Box_combine({ value: 4 }, 5)');
    expect(component!.contents).toContain('Box_exactCombine({ value: 4 }, 5)');
    expect(component!.contents).toContain('Box_doubledViaLocal({ value: 4 })');
    expect(component!.contents).not.toContain('.combine(');
    expect(component!.contents).not.toContain('.exactCombine(');
    expect(component!.contents).not.toContain('.doubledViaLocal(');
  });
});
