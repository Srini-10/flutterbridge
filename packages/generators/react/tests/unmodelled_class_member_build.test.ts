import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, unmodelledClassMemberRaw } from './support.js';

// The M9-J build-proof — a project-defined class receiver (`Model`), read as a field, an explicit getter,
// and a method; two unrelated classes sharing one member name (`Alpha`/`Beta`, never confused); an
// inherited/overridden getter (`Base`/`Child`, never statically bound); and a nested access
// (`parent.child.name`) — all real, analyzer-resolved parameters of one component, real `bridge normalize`
// (N1–N11, unmodified), real generator.
//
// This is the milestone's own critical proof: before M9-J, this exact source built successfully and
// silently lowered every one of these receivers to TypeScript `unknown`, discovered only later by `tsc`
// (TS18046) — never by FlutterBridge itself. After M9-J it must fail *inside FlutterBridge*, honestly,
// with BRG3013 naming the real receiver type and member.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(unmodelledClassMemberRaw());

describe('M9-J build-proof: unsupported project-class member access, real analyzer to real refusal', () => {
  it('the whole program is refused — no files are emitted', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(files).toEqual([]);
    expect(reported.some((d) => d.severity === 'error')).toBe(true);
  });

  it('a plain field read on a project-defined class receiver is refused as BRG3013, naming the receiver type', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(
      reported.some(
        (d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`count`') && d.message.includes('`Model`'),
      ),
    ).toBe(true);
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

  it('a nested access refuses once, at the first unsupported edge, not once per level', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error' && d.code === 'BRG3013' && d.message.includes('`Parent`'));
    // `parent.child.name` — `parent.child` is the first unsupported edge (`Parent` has no member model);
    // `.name` on its result is never independently reached or refused a second time.
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('`child`');
  });
});
