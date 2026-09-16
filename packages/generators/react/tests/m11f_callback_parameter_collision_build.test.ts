import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { callbackParameterCollisionRaw, compiledFrom, harness } from './support.js';

// M11-F negative proof — real analyzer, real `bridge normalize`, real generator: a real, cataloged,
// parameterized callback's own parameter (`Checkbox.onChanged: (value) { ... }`), SHADOWED by a
// same-named local declared inside a nested, spliced-open `setState` call, refuses honestly as
// `BRG3019` rather than emitting invalid TypeScript. A store action's own parameter, shadowed the same
// way inside a nested bare block, refuses through the identical mechanism.
//
// Before this milestone, this construct compiled cleanly all the way to `(value) => { const value =
// true; ... }` — `TS2300: Duplicate identifier 'value'`, live-probed against the real TypeScript
// compiler — with zero diagnostics anywhere in the pipeline. Declaration identity was never in
// question (the read already targeted the correct, inner declaration); `emitStatements`'s own
// `BRG3019` check (M11-D) only ever compared a `logic.VarDecl` against its OWN siblings in the same
// flat list, never against the enclosing callback's own parameter names — the identical failure class,
// from the other direction.
describe('M11-F: a callback parameter shadowed by a nested local refuses as BRG3019, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(callbackParameterCollisionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses the component-callback, validator, and store-action collisions with BRG3019 — never a silent, invalid emission', () => {
    const normalized = compiledFrom(callbackParameterCollisionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3019');
    expect(errors.length).toBe(3);
    for (const error of errors) {
      expect(error.message).toContain('value');
      expect(error.message).toContain("enclosing callback's own parameter");
    }
    // No partial output — the generator's own all-or-nothing emission policy (`BRG3005`).
    expect(files).toEqual([]);
  });
});
