import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  harness,
  lifecycleErasableRaw,
  lifecycleRefusalRaw,
  typecheckEmitted,
} from './support.js';

// Plan Phase E — a lifecycle method with behaviour in it is refused by name, not silently dropped.
//
// The analyzer turns `initState`/`didUpdateWidget`/`dispose` into a `sig.Effect`. Nothing in the generator reads
// one (M8-Q §7: "real, separate, silent"), so `initState() { _n = 5; }` produced a component that started at 0
// with no diagnostic — observed against real Flutter, whose first frame shows 5. `hello_bridge`'s own
// `_itemsFuture = …` initialisation was being dropped the same way.
//
// Refusing is the bounded fix: lowering an effect needs decisions nobody has made (it runs *before* the first
// build in Flutter and after the first render in React; development StrictMode runs it twice; the schema does
// not say which component owns it). What is *not* refused is a body that says nothing this output needs — a
// `super.` call, a framework controller disposing itself — so this is not the blanket that would reject every app
// with a `TextEditingController`. Real analyzer output in, real generator, real tsc.

afterAll(cleanupBuildProofTemporaries);

const refuse = () => {
  const { context, reported } = harness(compiledFrom(lifecycleRefusalRaw()));
  const { files } = reactGenerator.generate(context);
  return { files, errors: reported.filter((d) => d.code === 'BRG3013' && d.severity === 'error') };
};

describe('a lifecycle body with behaviour is refused, not silently dropped', () => {
  it('refuses initState, didUpdateWidget and dispose, and emits nothing', () => {
    const { files, errors } = refuse();
    expect(errors).toHaveLength(3);
    expect(files).toEqual([]);
  });

  it('names the Dart method for each timing', () => {
    const messages = refuse().errors.map((d) => d.message);
    expect(messages.filter((m) => m.startsWith('`initState`'))).toHaveLength(1);
    expect(messages.filter((m) => m.startsWith('`didUpdateWidget`/`didChangeDependencies`'))).toHaveLength(1);
    expect(messages.filter((m) => m.startsWith('`dispose`'))).toHaveLength(1);
  });

  it('says what is missing and what to do instead', () => {
    const message = refuse().errors.find((d) => d.message.startsWith('`initState`'))?.message ?? '';
    expect(message).toContain('silently');
    expect(message).toContain('StrictMode');
    expect(message).toContain('lib/main.dart');
    expect(message).toContain("the field's declaration");
  });
});

describe('a lifecycle body that says nothing the output needs is not refused (positive control)', () => {
  const emit = () => {
    const { context, reported } = harness(compiledFrom(lifecycleErasableRaw()));
    const { files } = reactGenerator.generate(context);
    return { reported, files };
  };

  it('emits no error: a super-only initState and a controller disposing itself', () => {
    const { reported, files } = emit();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    typecheckEmitted(emit().files);
  }, 120_000);
});
