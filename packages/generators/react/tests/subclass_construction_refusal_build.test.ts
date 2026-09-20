import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, subclassConstructionRefusalRaw } from './support.js';

// The premise the statically bound getter helper depends on.
//
// `Show.base` is typed `Base`, and `Base.value` lowers to the helper `Base_value` — bound to `Base`, with no
// dispatch. In Dart, `Show(base: Child())` reads `2` (`Child` overrides `value`); that helper would return `1`.
// ADR-0038 §10 argues this cannot happen because a `Child`-typed receiver never passes eligibility — which is
// true and beside the point, since the hazard is a `Base`-typed receiver holding a `Child`.
//
// What actually keeps it from happening is upstream: a generated program cannot *construct* a class with an
// explicit superclass. `new Child(…)` is refused. So no `Child` can reach a `Base`-typed value, and the helper is
// sound — for as long as that refusal holds. This test is the tripwire: if subclass construction is ever
// supported, it fails, and ADR-0038 §10 has to be revisited rather than quietly outgrown.
//
// Real analyzer output in, real generator.

afterAll(cleanupBuildProofTemporaries);

describe('a generated program cannot construct a subclass, so a Base-typed receiver never holds one', () => {
  const generate = () => {
    const { context, reported } = harness(compiledFrom(subclassConstructionRefusalRaw()));
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.severity === 'error') };
  };

  it('refuses the construction of `Child`, by name, and emits nothing', () => {
    const { files, errors } = generate();
    expect(files).toEqual([]);
    const refusal = errors.find((d) => d.code === 'BRG3002' && d.message.includes('`Child`'));
    expect(refusal?.message).toContain('does not emit class declarations');
  });
});
