import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, unmodelledClassMemberRaw } from './support.js';

// The M9-J/M9-N build-proof — a project-defined class receiver (`Model`), read as a field, an explicit
// getter, and a method; two unrelated classes sharing one member name (`Alpha`/`Beta`, never confused); an
// inherited/overridden getter (`Base`/`Child`, never statically bound); and a nested field-chain access
// (`parent.child.name`) — all real, analyzer-resolved parameters of one component, real `bridge normalize`
// (N1–N11, unmodified), real generator.
//
// Before M9-J, this exact source built successfully and silently lowered every one of these receivers to
// TypeScript `unknown`, discovered only later by `tsc` (TS18046) — never by FlutterBridge itself. After
// M9-J, every member access here was refused inside FlutterBridge, honestly, with BRG3013.
//
// After M9-N (ADR-0035), the boundary narrows precisely: `model.count` and `parent.child.name` are both
// bounded, immutable, public field reads on a directly-received parameter, and are now genuinely allowed
// — while `model.doubled` (explicit getter), `model.compute()` (method), `alpha.value`/`beta.value`
// (explicit getters, never confused by name alone), and `base.value` (an inherited/overridden explicit
// getter, never statically bound) all remain exactly as refused as they were before M9-N. This file
// re-proves that exact, narrowed line — not a claim that "project classes now work" wholesale.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(unmodelledClassMemberRaw());

describe('M9-J/M9-N build-proof: bounded field reads allowed, every other project-class member access refused', () => {
  it('the whole program is still refused — the remaining getter/method accesses still stop generation', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(files).toEqual([]);
    expect(reported.some((d) => d.severity === 'error')).toBe(true);
  });

  it('a bounded, immutable final field read is no longer refused — ADR-0035', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(
      reported.some(
        (d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`count`') && d.message.includes('`Model`'),
      ),
    ).toBe(false);
  });

  it('a nested field-chain read (crossing two project classes) is no longer refused at either edge — ADR-0035', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`Parent`'));
    expect(errors).toEqual([]);
  });

  it('an explicit getter read on a project-defined class receiver is refused as BRG3013', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(
      reported.some(
        (d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`doubled`') && d.message.includes('`Model`'),
      ),
    ).toBe(true);
  });

  it('a method call on a project-defined class receiver is refused as BRG3013', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(
      reported.some(
        (d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`compute`') && d.message.includes('`Model`'),
      ),
    ).toBe(true);
  });

  it('two unrelated classes sharing one member name are each refused against their own real receiver type, never confused', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013');
    expect(errors.some((d) => d.message.includes('`Alpha`'))).toBe(true);
    expect(errors.some((d) => d.message.includes('`Beta`'))).toBe(true);
  });

  it('an inherited/overridden getter is refused, never statically bound to the base declaration', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    // `base: Base` is constructed `Child()` — Dart dispatches `.value` to `Child.value` (2) at runtime, not
    // `Base.value` (1). This refuses rather than resolving to either — the only sound answer without a
    // dynamic-dispatch model (M9-I §11).
    expect(
      reported.some((d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`Base`')),
    ).toBe(true);
  });

});
