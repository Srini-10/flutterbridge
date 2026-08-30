import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, optionalMethodParametersRaw, typecheckEmitted } from './support.js';

// M10-E positive proof (ADR-0043) — real analyzer, real `bridge normalize`, real generator: a bounded
// instance method may carry a trailing OPTIONAL POSITIONAL parameter with an explicit default value
// (`[int bonus = N]`) — omitted at the call site, the generated helper's own real TypeScript default
// clause supplies the declared value, exactly matching Dart's own semantics.
//
// This milestone required zero new UIR schema: `ParamDecl.required`/`defaultValue` already existed,
// already populated for `sig.Action` parameters — the extractor's own class-method/top-level-function
// param builder (`declaration_extractor.dart`) and the generator's own shared `paramListOf` (`types.ts`)
// simply never finished consuming them (ADR-0043 §3/§4). Fixing the ONE shared `paramListOf` function
// also, necessarily and correctly, repairs a real, pre-existing, previously-undetected bug in the
// UNRELATED store/action subsystem — see `optional_action_default_build.test.ts`.
describe('M10-E: bounded instance methods may carry an optional positional parameter with a default value, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every call shape is fully supported', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // A single trailing optional parameter renders a genuine TypeScript default clause, never a plain `?`
  // marker (which would make the omitted value `undefined`, not Dart's own declared default).
  it('a single trailing optional parameter renders a real TypeScript default clause', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_multiply(self: Model, factor: number, bonus: number = 10): number {',
    );
    expect(model!.contents).not.toContain('bonus?:');
    const component = files.find((f) => f.path.endsWith('default-argument-demo.tsx'));
    expect(component).toBeDefined();
    // Omitted at the call site — the helper's own default supplies it.
    expect(component!.contents).toContain('Model_multiply({ count: 7 }, 3)');
    // Explicitly supplied — overrides the default.
    expect(component!.contents).toContain('Model_multiply({ count: 7 }, 3, 1)');
  });

  // Multiple trailing optional parameters, each independently omittable.
  it('multiple trailing optional parameters each render their own default clause', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_combine(self: Model, a: number, b: number = 1, c: number = 2): number {',
    );
    const component = files.find((f) => f.path.endsWith('multiple-defaults-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_combine({ count: 7 }, 1)');
    expect(component!.contents).toContain('Model_combine({ count: 7 }, 1, 5)');
    expect(component!.contents).toContain('Model_combine({ count: 7 }, 1, 5, 6)');
  });

  // An optional-parameter method composed with ANOTHER bounded member on the same receiver (M10-B) —
  // proves this milestone's own new capability composes, unchanged, with the existing composition
  // architecture: the outer method's own optional parameter is passed straight through as the inner
  // method's own (otherwise-omittable) argument.
  it('an optional-parameter method composes correctly with member-helper composition (M10-B)', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const model = files.find((f) => f.path.endsWith('lib/model.ts'));
    expect(model).toBeDefined();
    expect(model!.contents).toContain(
      'export function Model_scaledAndDoubled(self: Model, factor: number, bonus: number = 1): number {\n' +
        '  return (Model_multiply(self, factor, bonus) + Model_doubled(self));\n' +
        '}',
    );
  });

  // The sibling positive case to the local-receiver demos above: `model` arrives as a real widget
  // constructor parameter, not a value this build method constructs. Optional-argument omission must
  // hold identically for an external receiver.
  it('an external (prop) receiver preserves optional-argument omission identically to a local one', () => {
    const normalized = compiledFrom(optionalMethodParametersRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const component = files.find((f) => f.path.endsWith('external-receiver-default-demo.tsx'));
    expect(component).toBeDefined();
    expect(component!.contents).toContain('Model_multiply(props.model, 3)');
    expect(component!.contents).toContain('Model_multiply(props.model, 3, 1)');
  });
});
