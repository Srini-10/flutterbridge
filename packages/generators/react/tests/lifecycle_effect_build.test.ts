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

// ADR-0052 — what is still refused, and the control that erasable bodies are not.
//
// `initState`, `didUpdateWidget` and `dispose` are lowered (`lifecycle_execution.test.ts` runs them against real Flutter).
// Two things are not, and each is refused **by name**, never silently absent from the output:
//
//   `didChangeDependencies`  fires when an *inherited* dependency changes, and once after `initState`; a function
//                            component has no per-instance hook for either.
//   `deactivate`             runs when the element leaves the tree, which is not `dispose` and has no React event.
//   a store's `dispose`      belongs to no component (`ui.Component.effects` names none).
//
// What is *not* refused is a body that says nothing this output needs — a `super.` call, a framework controller
// disposing itself — so this is not the blanket that would reject every app with a `TextEditingController`. Real
// analyzer output in, real generator, real tsc.

afterAll(cleanupBuildProofTemporaries);

const refuse = () => {
  const { context, reported } = harness(compiledFrom(lifecycleRefusalRaw()));
  const { files } = reactGenerator.generate(context);
  return { files, errors: reported.filter((d) => d.code === 'BRG3013' && d.severity === 'error') };
};

describe('a lifecycle body with no lowering is refused, not silently dropped', () => {
  it('refuses didChangeDependencies, deactivate and a store’s dispose, and emits nothing', () => {
    const { files, errors } = refuse();
    expect(errors).toHaveLength(3);
    expect(files).toEqual([]);
  });

  it('names the Dart method and where it is', () => {
    const messages = refuse().errors.map((d) => d.message);
    expect(messages.filter((m) => m.startsWith('`didChangeDependencies`'))).toHaveLength(1);
    expect(messages.filter((m) => m.startsWith('`deactivate`'))).toHaveLength(1);
    expect(messages.filter((m) => m.startsWith('`dispose`') && m.includes('belongs to no component'))).toHaveLength(1);
    expect(messages.every((m) => m.includes('lib/main.dart'))).toBe(true);
  });

  it('says what is missing and what to do instead', () => {
    const message = refuse().errors.find((d) => d.message.startsWith('`didChangeDependencies`'))?.message ?? '';
    expect(message).toContain('silently');
    expect(message).toContain('ADR-0052');
    expect(message).toContain('oldWidget');
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
