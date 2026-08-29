import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, methodCallRefusalRaw } from './support.js';

// M9-R closure proof, still exercised post-M10-A — real analyzer, real `bridge normalize`, real
// generator: an instance method call on a LOCALLY-CONSTRUCTED (M9-O) project-class receiver refuses
// honestly as `BRG3013`, never silently lowering to a call on a nonexistent property of the emitted
// structural object.
//
// This is the real-fixture counterpart of the fix documented in `unmodelled_class_member_refusal.test.ts`
// — found via a live probe during M9-R's own closure audit: before the fix, a method call on a
// `final model = Model(7);` local silently lowered to a call on a property the emitted structural object
// never has — a `tsc` error would have been the first honest signal, not this compiler's own `BRG3013`.
// `isParameterReceiver`'s own receiver-shape check never recognized a local; `isKnownProjectClassReceiver`
// (keyed on `TypeRef.target`, ADR-0034) now does, for exactly the receivers where `tsc`'s own inference
// could never have legitimately differed from this generator's own type text in the first place.
//
// `Model.multiply`'s own SECOND parameter is optional (`[int bonus = 0]`) since M10-A — ADR-0039 requires
// every parameter to be uniformly required-positional, so this specific method stays outside the newly-
// supported subset even though its first parameter, and every other fact about it, would otherwise
// qualify. `fixtures/apps/instance_method_execution` (`instance_method_execution_build.test.ts`) is the
// sibling positive proof: the identical shape, minus the one excluding fact, now lowers to a real helper
// call instead of refusing.
describe('M9-R closure: a method call on a locally-constructed receiver refuses as BRG3013, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses the method call as BRG3013 (an optional parameter, ADR-0039) — never a silent, wrong lowering', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('multiply') && d.message.includes('Model'))).toBe(
      true,
    );
    // No partial output — the generator's own all-or-nothing emission policy (`BRG3005`).
    expect(files).toEqual([]);
  });

  // ADR-0039 §5: `AsyncModel.scale` meets every OTHER method-eligibility gate — `_externalMethodTarget`
  // does not check `isAsync`, so this still resolves a `target` at the extraction layer. The generator's
  // own `emitFunctionModules` loop declines to emit a helper for an `async` method, and the `target`-set-
  // but-no-helper branch this ADR added must refuse (`BRG3013`) rather than falling through to the naive
  // `receiver.method(args)` lowering below it — the identical silent-wrong-code shape the M9-R closure fix
  // exists to prevent, reopened for this narrower, method-specific gate if this branch were ever removed.
  it('refuses an async method call as BRG3013, even though every other ADR-0039 gate is met', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some((d) => d.code === 'BRG3013' && d.message.includes('scale') && d.message.includes('otherwise eligible')),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-B §26/§48: `RecursiveModel.countdown` calls itself. The fixed-point retry loop can never make it
  // succeed — its own single unresolved dependency IS itself — so it stays refused, with no special
  // recursion-detection code anywhere in the generator; the existing "target set but no helper" branch
  // handles it for free. Also proves the retry loop TERMINATES (this test itself has a real timeout) —
  // a real risk a fixed-point loop over a self-referential chain could otherwise not have.
  it('refuses a directly self-recursive method as BRG3013, and terminates', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some((d) => d.code === 'BRG3013' && d.message.includes('countdown') && d.message.includes('otherwise eligible')),
    ).toBe(true);
    expect(files).toEqual([]);
  }, 10_000);

  // M10-B §45/§47: `DependentModel.compute` meets every ADR-0039 gate on its own, but its own body calls
  // a SIBLING method (`scaleUnsupported`) that does not (an optional parameter) — the unsupported
  // dependency must propagate: `compute` refuses too, rather than silently shipping a call to a helper
  // that was never emitted.
  it('refuses a method whose own body calls an unsupported sibling method, propagating the refusal', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some((d) => d.code === 'BRG3013' && d.message.includes('compute') && d.message.includes('otherwise eligible')),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-C: `CallbackModel.applyCallback`'s own parameter is required-positional (meeting ADR-0039's own
  // gate) but FUNCTION-TYPED — a real, live-probed gap found while investigating this milestone's own
  // "closures/function-valued method references" non-goal. Before the fix, `target` still resolved (the
  // pre-M10-C gate never checked a parameter's own TYPE, only its required-positional-ness), so the
  // generator emitted a helper whose own body called a parameter typed `unknown` — code that would reach
  // real `tsc` as "not callable", never this compiler's own honest `BRG3013`. Excluded at the identical
  // extraction-layer gate (`_externalMethodTarget`) the generic-method and optional-parameter exclusions
  // already live at, so `target` never resolves at all, and this reaches the pre-existing M9-J unmodelled-
  // member-receiver refusal — the same path a call to a wholly unsupported class's method would.
  it('refuses a method with a function-typed parameter as BRG3013, never a helper that calls `unknown`', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some(
        (d) => d.code === 'BRG3013' && d.message.includes('applyCallback') && d.message.includes('CallbackModel'),
      ),
    ).toBe(true);
    expect(files).toEqual([]);
  });
});
