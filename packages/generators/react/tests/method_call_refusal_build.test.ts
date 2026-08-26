import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, methodCallRefusalRaw } from './support.js';

// M9-R closure proof — real analyzer, real `bridge normalize`, real generator: an instance method call
// on a LOCALLY-CONSTRUCTED (M9-O) project-class receiver refuses honestly as `BRG3013`, never silently
// lowering to a call on a nonexistent property of the emitted structural object.
//
// This is the real-fixture counterpart of the fix documented in `unmodelled_class_member_refusal.test.ts`
// — found via a live probe during M9-R's own closure audit: before the fix, `model.multiply(3)` (a valid
// Dart method call on a `final model = Model(7);` local) silently lowered to
// `{ count: 7 }.multiply(3)`, which is not a real property/method of that object — a `tsc` error would
// have been the first honest signal, not this compiler's own `BRG3013`. `isParameterReceiver`'s own
// receiver-shape check never recognized a local; `isKnownProjectClassReceiver` (keyed on `TypeRef.target`,
// ADR-0034) now does, for exactly the receivers where `tsc`'s own inference could never have legitimately
// differed from this generator's own type text in the first place.
describe('M9-R closure: a method call on a locally-constructed receiver refuses as BRG3013, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(methodCallRefusalRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses the method call as BRG3013 — never a silent, wrong lowering', () => {
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
});
