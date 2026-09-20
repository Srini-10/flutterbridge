import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  sdkCollectionRefusalRaw,
  sdkLoweringRaw,
  typecheckEmitted,
} from './support.js';

// Plan Phase E — `dart:core` values whose JavaScript spelling looks the same and is not.
//
// Every claim was observed by running Dart and JavaScript on the same values (`docs/m11/m11i-completion-audit.md`
// §E). The generator used to emit `receiver.method(args)` verbatim for any `dart:core` collection, and
// interpolate any value with `${…}`, so:
//
//   `[10, 9, 1].sort()`      compiled, typechecked, ran — and never updated the screen (an in-place change a
//                            signal cannot see), with JavaScript's string ordering besides;
//   `['a','b'].join()`       "a,b" where Dart prints "ab" (the separator defaults differ);
//   `'$_d'` for 3.0          "3" where Dart prints "3.0";
//   `'$_list'`               "10,9,1" where Dart prints "[10, 9, 1]".
//
// The policy is the numeric one (M8-V), extended: checked by the receiver's resolved type, never the bare name;
// lower what is provably the same, refuse the rest by name. Real analyzer output in, real generator, real tsc.

afterAll(cleanupBuildProofTemporaries);

const refuse = () => {
  const { context, reported } = harness(compiledFrom(sdkCollectionRefusalRaw()));
  const { files } = reactGenerator.generate(context);
  return { files, errors: reported.filter((d) => d.code === 'BRG3002' && d.severity === 'error') };
};

describe('a dart:core collection method or interpolation with no faithful lowering is refused by name', () => {
  it('refuses all six shapes and emits nothing', () => {
    const { files, errors } = refuse();
    expect(errors).toHaveLength(6);
    expect(files).toEqual([]);
  });

  it('an in-place mutator says why the screen would not update', () => {
    const messages = refuse().errors.map((d) => d.message);
    for (const method of ['List.sort', 'List.add', 'Map.remove']) {
      const message = messages.find((m) => m.startsWith(`\`${method}\` has no lowering`)) ?? '';
      expect(message, method).toContain('in place');
      expect(message, method).toContain('ADR-20 R3');
      expect(message, method).toContain('ADR-0049');
    }
  });

  it('a method that is not a mutator names what *is* lowered', () => {
    const message = refuse().errors.find((d) => d.message.startsWith('`Set.contains`'))?.message ?? '';
    expect(message).toContain('`join`, `indexOf`, `lastIndexOf`, `forEach`, `every`');
  });

  it('a List or num in an interpolation is refused, with what Dart and JavaScript each print', () => {
    const messages = refuse().errors.map((d) => d.message);
    expect(messages.find((m) => m.startsWith('Interpolating a `List`'))).toContain('[1, 2]');
    expect(messages.find((m) => m.startsWith('Interpolating a `List`'))).toContain('1,2');
    expect(messages.find((m) => m.startsWith('Interpolating a `num`'))).toContain('1.0');
  });
});

describe('the lowerings, and a control that the policy does not over-reach', () => {
  const emit = () => {
    const { context, reported } = harness(compiledFrom(sdkLoweringRaw()));
    const { files } = reactGenerator.generate(context);
    return { reported, files };
  };
  const component = (path: string) => fileAt(emit().files, `src/components/${path}.tsx`) ?? '';

  it('emits no error', () => {
    expect(emit().reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('a double interpolates through doubleToString, so 3.0 keeps its .0', () => {
    const source = component('double-interpolation');
    expect(source).toMatch(/\$\{doubleToString\(_d\$\)\}/);
    expect(source).toMatch(/import \{[^}]*doubleToString[^}]*\} from '@bridge\/runtime-react'/);
  });

  it('join() with no argument is join(\'\') — Dart’s default separator, not JavaScript’s comma', () => {
    expect(component('join-default')).toContain("_w$.join('')");
  });

  it('join(sep) and indexOf pass through unchanged', () => {
    const source = component('join-separator');
    expect(source).toContain("_w$.join(',')");
    expect(source).toContain("_w$.indexOf('a')");
  });

  it('a project class whose methods are named `add` and `join` still lowers to its own helpers (ADR-0039)', () => {
    // A control for *over-reach*: the collection policy must not swallow an eligible project-class call just
    // because its method shares a name with a `List` method. (It does not prove the policy keys on the
    // receiver's type rather than the name — an eligible call returns through the helper branch before the
    // policy is reached, so a name-based mutant is inert here. That property is the code's, by construction:
    // `sdkBaseTypeOf` reads the receiver's `dart:core` type.)
    const source = component('project-class-join');
    expect(source).toContain('Bag_add({ base: 2 }, 3)');
    expect(source).toContain('Bag_join({ base: 2 }, 4)');
    expect(emit().reported.filter((d) => d.message.includes('has no lowering'))).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    typecheckEmitted(emit().files);
  }, 120_000);
});
