import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { callbackParameterIdentityRaw, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// M11-F positive proof — real analyzer, real `bridge normalize`, real generator: a real, cataloged,
// statement-bodied, PARAMETERIZED callback (`Checkbox.onChanged: (value) { ... }`) reads its own
// parameter correctly, directly or from a nested `setState` closure, and never collides with a
// differently-named captured local or a store action's own differently-named parameter.
//
// M11-D and M11-E each left "callback parameter/local collision" explicitly unverified, on the belief
// that "no cataloged widget offers a callback that takes a parameter" (M11-D §23). That belief was
// incomplete: `Checkbox`/`Switch`/`Radio`/`Slider`'s own `onChanged` is exactly such a callback, already
// mapped (`widgets.ts`), already extracted as an ordinary `logic.Lambda` with real `params` — reachable
// today, not hypothetical. This fixture is the positive half of that finding; the negative half (the
// parameter actually SHADOWED by a same-named local) is
// `m11f_callback_parameter_collision_build.test.ts`.
describe('M11-F: a real parameterized callback reads its own parameter correctly, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every rung here is fully supported', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1 — the parameter, read directly in the same callback, no nested closure.
  it('a parameter read directly (no nesting) resolves correctly', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/direct-param-read-widget.tsx') ?? '';
    expect(file).toMatch(/\(value: boolean \| null\) => \{\s*_checked\.set\(\(value \?\? false\)\);/);
  });

  // R2 — the parameter, captured and read from a nested `setState` closure.
  it('a parameter captured by a nested setState closure resolves correctly', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/nested-param-read-widget.tsx') ?? '';
    expect(file).toMatch(/\(value: boolean \| null\) => \{\s*_checked\.set\(\(value \?\? false\)\);/);
  });

  // The parameter and a differently-named captured local, both read from the same nested closure —
  // neither shadows the other.
  it('a parameter and a differently-named captured local never cross-resolve', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/param-and-local-widget.tsx') ?? '';
    expect(file).toMatch(/const fallback = true;\s*\n\s*_checked\.set\(\(value \?\? fallback\)\);/);
  });

  // R8 — an async parameterized callback: the identical guard applies regardless of `isAsync`.
  it('an async parameterized callback resolves its own parameter correctly', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/async-param-widget.tsx') ?? '';
    expect(file).toContain('const handle_');
    expect(file).toMatch(/async \(value: boolean \| null\) => \{/);
    expect(file).toMatch(/_checked\.set\(\(value \?\? false\)\);/);
  });

  // `TextFormField.validator` — a parameterized callback that calls no `setState`, so N5 never
  // promotes it to a `sig.Action`; it stays an ordinary in-place `logic.Lambda`, lowered by
  // `expression.ts` directly — the SECOND, independent emission call site this guard reaches.
  it('a validator parameter and a differently-named nested-block local never cross-resolve', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/validator-widget.tsx') ?? '';
    expect(file).toContain('validator={(value) => {');
    expect(file).toContain('const normalized =');
  });

  // A store action taking a parameter, with a differently-named local inside a nested bare block —
  // the identical guard `store.ts`'s own action-body emission now also carries.
  it('a store action parameter and a differently-named nested-block local never cross-resolve', () => {
    const normalized = compiledFrom(callbackParameterIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/demo-store.ts') ?? '';
    expect(store).toMatch(/const runWith = action\(\(value: number\) => \{\s*const doubled = intMul\(value, 2\);\s*result\.set\(doubled\);/);
  });
});
