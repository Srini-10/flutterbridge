import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  typecheckEmitted,
  unmodelledClassMemberRaw,
} from './support.js';

// The M9-J/M9-N build-proof, brought up to date (M11-I) — a project-defined class receiver (`Model`), read as a
// field, an explicit getter, and a method; two unrelated classes sharing one member name (`Alpha`/`Beta`, never
// confused); a getter on a class with a subclass (`Base`/`Child`); and a nested field-chain access
// (`parent.child.name`) — all real, analyzer-resolved parameters of one component, real `bridge normalize`
// (N1–N11, unmodified), real generator.
//
// The history this file used to tell: before M9-J the source built and silently lowered every receiver to
// `unknown` (found later by `tsc`, TS18046); M9-J refused every member access with `BRG3013`; M9-N (ADR-0035)
// allowed bounded field reads; and this file then asserted that the getter and method accesses "remain exactly
// as refused". They did not remain refused: M9-Q (ADR-0038, getters) and M10-A (ADR-0039, methods) made them
// executable on purpose. These assertions kept passing anyway, for a reason worth recording — the committed
// golden predated the analyzer fields (`isGetter`, `constructibleConstructors`) that eligibility reads, so the
// stale document *looked* ineligible. Refreshing the golden from source (M11-I, plan Phase J) exposed it; five
// tests were asserting refusals the compiler no longer makes.
//
// What they assert now is the design as it stands: field reads, getters and methods on a project-class
// parameter lower to structural helpers (never a prototype call — there is no runtime class), two classes
// sharing a member name get two different helpers, and the output passes real `tsc --strict`.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(unmodelledClassMemberRaw());

const emit = () => {
  const { context, reported } = harness(after);
  const { files } = reactGenerator.generate(context);
  return { reported, files, home: fileAt(files, 'src/components/home.tsx') ?? '' };
};

describe('M9-J/M9-N build-proof, current design: field reads, getters and methods on a project-class parameter', () => {
  it('the whole program generates — nothing in it is refused any more', () => {
    const { files, reported } = emit();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('a bounded, immutable final field read stays a plain property read — ADR-0035', () => {
    expect(emit().home).toContain('props.model.count');
  });

  it('a nested field-chain read (crossing two project classes) stays a plain property chain — ADR-0035', () => {
    expect(emit().home).toContain('props.parent.child.name');
  });

  it('an explicit getter is a structural helper over the receiver, never a prototype getter — ADR-0038', () => {
    const { home } = emit();
    expect(home).toContain('Model_doubled(props.model)');
    expect(home).not.toMatch(/props\.model\.doubled/);
  });

  it('a method call is a structural helper over the receiver — ADR-0039', () => {
    const { home } = emit();
    expect(home).toContain('Model_compute(props.model)');
    expect(home).not.toMatch(/props\.model\.compute\(/);
  });

  it('two unrelated classes sharing one member name get two different helpers, never confused', () => {
    const { home } = emit();
    expect(home).toContain('Alpha_value(props.alpha)');
    expect(home).toContain('Beta_value(props.beta)');
  });

  it('a getter read off a `Base`-typed receiver is a helper bound to Base — sound only because no subclass can be built (see subclass_construction_refusal)', () => {
    // ADR-0038 §10 argues dispatch-safety from the *receiver's own* eligibility; a `Base`-typed value holding a
    // `Child` is the case that argument does not cover. What actually makes this safe is that a program which
    // constructs a `Child` is refused (`subclass_construction_refusal_build.test.ts`), so none can reach here.
    expect(emit().home).toContain('Base_value(props.base)');
  });

  it('real `tsc --strict` accepts the generated output', () => {
    typecheckEmitted(emit().files);
  }, 120_000);
});
