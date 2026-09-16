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
// `Model.multiply`'s own SECOND parameter is optional and carries NO default value (`[int? bonus]`) —
// ADR-0043 (M10-E) requires an optional positional parameter to carry an explicit default, so this
// specific method stays outside the supported subset even though its first parameter, and every other
// fact about it, would otherwise qualify. (Before M10-E, `bonus` carried a default — `[int bonus = 0]` —
// and THAT was the excluding fact under ADR-0039's own original, narrower rule; ADR-0043 widened the
// subset to admit exactly that shape, so this fixture's own negative control moved to the one optional-
// parameter shape still unsupported, preserving this test's original intent rather than leaving it
// silently stale.) `fixtures/apps/instance_method_execution` (`instance_method_execution_build.test.ts`)
// and `fixtures/apps/optional_method_parameters` (`optional_method_parameters_build.test.ts`) are the
// sibling positive proofs: the identical shape, minus the one excluding fact, now lowers to a real helper
// call instead of refusing.
describe('M9-R closure: a method call on a locally-constructed receiver refuses as BRG3013, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses the method call as BRG3013 (an optional parameter with no default, ADR-0043) — never a silent, wrong lowering', () => {
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

  // Reversed from its own pre-M11-B assertion (ADR-0039 §5's own original claim: `_externalMethodTarget`
  // does not check `isAsync` at all, so a bare, un-awaited call used to still resolve a `target` at the
  // extraction layer, reaching the "target set but no helper" BRG3013 message with its own "otherwise
  // eligible" wording). M11-B (ADR-0046) moved the "is this genuinely awaited" decision to the SAME
  // extraction layer: `AsyncModel.scale`, called un-awaited (`model.scale(3)`, no `await`), now resolves
  // NO target at all — reaching the EARLIER, generic "calls a member of X, a class this generator has no
  // member model for" refusal instead (the M9-J unmodelled-receiver check) — still an honest `BRG3013`,
  // still zero files emitted, just a different (and, for an un-awaited async call specifically, more
  // precise) message. See `extraction_test.dart`'s own ADR-0046 group for the direct target-resolution
  // proof, and `async_method_await_build.test.ts` for the positive, genuinely-awaited counterpart.
  it('refuses an un-awaited async method call as BRG3013, even though every other ADR-0039 gate is met', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('AsyncModel'))).toBe(true);
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

  // M10-D (ADR-0042 §4): `DynamicReturnModel.getDynamic`'s own return type is `dynamic` — the source
  // itself declined to state a type. Before the return-type eligibility gate existed, this still resolved
  // a `target` and reached a real, un-refused helper whose own signature rendered the return type
  // `unknown` — a real `tsc --strict` failure waiting to happen the moment a caller chained a further
  // member off the result, never this compiler's own honest `BRG3013`.
  it('refuses a method with a `dynamic` return type as BRG3013, never an un-refused `unknown`-typed helper', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some(
        (d) => d.code === 'BRG3013' && d.message.includes('getDynamic') && d.message.includes('DynamicReturnModel'),
      ),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-D (ADR-0042 §3/§4): `GenericReturnModel.getList`'s own return type is a generic instantiation
  // (`List<int>`) — excluded by the identical `_dispatchSafeReceiverClass` check a RECEIVER's own type
  // already must pass, reused verbatim for a RETURN type.
  it('refuses a method with a generic-instantiation return type as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some(
        (d) => d.code === 'BRG3013' && d.message.includes('getList') && d.message.includes('GenericReturnModel'),
      ),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-D (ADR-0042 §3/§4): `SubclassReturnModel.getDerived`'s own return type (`Derived`) has an explicit
  // superclass — excluded by the identical dynamic-dispatch safety argument ADR-0038 §10 already
  // established for a subclass-typed RECEIVER, reused verbatim for a RETURN type. The refusal correctly
  // attributes the FIRST unsupported edge (`Derived`, the type of the chained result), not `getDerived`
  // itself — the pre-existing M9-J "refuse once, at the first unsupported edge" discipline, unaffected by
  // this milestone.
  it('refuses a field read on a subclass-typed method result as BRG3013, blaming the unsupported type', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('Derived'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-E (ADR-0043 §7/§14): `NamedParamModel.scale`'s own second parameter is NAMED — out of scope
  // regardless of whether it carries a default (a named argument has no positional call-site equivalent
  // without either an options-object rewrite or call-site-name-threading, materially larger scope than
  // M10-E's own). Called with named-argument syntax (`scale(3, bonus: 2)`), so this exercises the
  // SEPARATE, pre-existing named-ARGUMENT refusal (`refuseNamedArgs`), never the method-eligibility one
  // `Model.multiply`'s own test, above, proves — both refusal paths stay honestly distinct.
  it('refuses a call using named-argument syntax on a method with a named parameter, via the separate named-argument path', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.message.includes('named arguments'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-E, a real coverage gap found by adversarial mutation testing (ADR-0043 §14): the IDENTICAL method
  // as the test above, but called WITHOUT ever using named-argument syntax at all (`bonus` omitted
  // entirely) — `refuseNamedArgs` never fires for a call with zero named arguments, so this call site's
  // own refusal depends entirely on `NamedParamModel.scale`'s own method-eligibility gate excluding a
  // named parameter regardless of how any one particular call happens to spell it. Before this test
  // existed, a mutation that removed ONLY the method-eligibility gate's own named-parameter exclusion
  // (while leaving `refuseNamedArgs` untouched) passed the entire suite undetected — this test closes
  // that gap.
  it('refuses a call that never uses named-argument syntax on a method with a named parameter, via the method-eligibility path', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    // `.includes('NamedParamModel')`, never bare `'scale'` — `AsyncModel.scale` (above) is a DIFFERENT,
    // pre-existing refusal in this same document that also names "scale"; a looser assertion here would
    // pass even if `NamedParamModel.scale`'s own call silently succeeded, a real false positive this test
    // itself was first written with and caught only by re-running the mutation this test exists to catch.
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('NamedParamModel'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-F (ADR-0044 §6): `maybeNavModel()?.count` — the null-aware receiver is a CALL, never a bare
  // reference. Refuses honestly rather than silently duplicating the call.
  it('refuses safe navigation on a constructed/called receiver as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('NavModel'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M10-F (ADR-0044 §6): `NavModel.describeBuilder`'s own body safe-navigates on `builder`, a bare
  // reference resolving to a GENUINE getter, never a field — deliberately excluded (provably pure, but
  // duplicating it would cross this project's own "receiver evaluated exactly once" discipline). The
  // inner refusal (withheld `target` on `.doubled`, reaching the M9-J unmodelled-member check) happens
  // INSIDE `describeBuilder`'s own method-helper attempt, whose own `report` routes every error through
  // this attempt's `hadError` flag rather than a directly-observable diagnostic (the identical, already-
  // established propagation shape the `compute`/`countdown` reachable-unsupported-dependency tests above
  // already prove) — so the OBSERVABLE diagnostic names `describeBuilder` itself, "otherwise eligible",
  // never the inner `doubled` access directly.
  it('refuses safe navigation on a bare reference resolving to a genuine getter as BRG3013, propagating through the method helper', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some(
        (d) => d.code === 'BRG3013' && d.message.includes('describeBuilder') && d.message.includes('otherwise eligible'),
      ),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-A (ADR-0045 §14): `StaticAccessModel.marker` is a static CONST field — a separate, pre-existing,
  // documented M8-P boundary (this generator does not yet lower a `logic.FieldDecl` to a module-level
  // declaration at all), unrelated to this milestone's own static-METHOD targeting work. Unaffected by
  // this milestone's own extraction change — confirmed the identical `BRG3006` refusal fires, unchanged.
  it('refuses a static field/const reference as BRG3006, unaffected by static method access', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3006' && d.message.includes('StaticAccessModel.marker'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-A (ADR-0045 §14): `StaticAccessModel.callHidden`'s own body calls a PRIVATE static sibling method
  // (`_hidden`) — excluded by `_staticMemberTarget`'s own `isPrivate` check. `callHidden` itself is
  // otherwise eligible, but its own body references something unsupported — the identical reachable-
  // unsupported-dependency propagation M10-B/D already established for instance methods (`compute`/
  // `countdown`, above), proven here for static ones: the OBSERVABLE diagnostic names `callHidden` itself,
  // "otherwise eligible", never the inner `_hidden` reference directly (the identical propagation shape
  // the safe-navigation `describeBuilder` test, above, already documents for a different construct).
  it('refuses a static method whose own body references a private static sibling as BRG3013, propagating through the method helper', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(
      errors.some(
        (d) => d.code === 'BRG3013' && d.message.includes('callHidden') && d.message.includes('otherwise eligible'),
      ),
    ).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-A (ADR-0045): a real, live-probed gap found while mutation-testing this milestone's own first
  // implementation — `_staticMemberTarget`'s first cut reused `_instanceMemberTarget` directly without
  // also reusing `_externalMethodTarget`'s own return-type eligibility gate, reproducing the exact
  // `unknown`-return silent-wrong-code shape ADR-0042 already closed once for `DynamicReturnModel`,
  // above (an INSTANCE method). Fixed by sharing `_isEligibleMethodShape` between both gates — this is
  // the permanent regression proof at the generation layer.
  it('refuses a static method with an ineligible (dynamic) return type as BRG3006, unaffected by static method access', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3006' && d.message.includes('StaticAccessModel.getDynamic'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-B (ADR-0046 §6): `AsyncGenericCallOnLocal` calls `AsyncRefusalModel.callIdentity()` un-awaited
  // from a component's own (necessarily synchronous) render tree — real Dart cannot `await` inside
  // `build()`, so a genuinely-awaited-but-still-ineligible-for-a-DIFFERENT-reason case (the inner generic
  // method) is proven at the extraction layer instead (`extraction_test.dart`'s own ADR-0046 group); this
  // test proves the OUTER, un-awaited call itself refuses, exactly as every other async method already
  // does (`AsyncModel`, above), regardless of what its own body goes on to do.
  it('refuses an un-awaited call to a method whose own body would await a generic method as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('callIdentity'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-B (ADR-0046 §6): identical shape, an un-awaited call whose own body would await a `Future<dynamic>`-
  // returning method.
  it('refuses an un-awaited call to a method whose own body would await a Future<dynamic> method as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('callDynamicAsync'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-B (ADR-0046 §6): identical shape, an un-awaited call whose own body would await a PRIVATE method.
  it('refuses an un-awaited call to a method whose own body would await a private method as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('callHiddenAsync'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-B (ADR-0046 §6): a directly self-recursive async method — the identical fixed-point non-
  // convergence refusal (ADR-0040 §10), unaffected by `async`/`await`.
  it('refuses a self-recursive async method as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('countdownAsync'))).toBe(true);
    expect(files).toEqual([]);
  });

  // M11-B (ADR-0046 §6): `AsyncSubclass.useNew`'s own body bare-calls a NEW (non-override) async method it
  // itself declares — the identical subclass-dispatch-safety exclusion M11-A's own mutation testing
  // already established for the synchronous case (ADR-0045's own mutation 1a), unaffected by `async`.
  it('refuses a bare call, awaited, to a new async method a subclass itself declares as BRG3013', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3013' && d.message.includes('useNew'))).toBe(true);
    expect(files).toEqual([]);
  });
});
