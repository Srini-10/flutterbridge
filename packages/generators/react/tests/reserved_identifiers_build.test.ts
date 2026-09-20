import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { identifierOf, isGeneratedName } from '../src/internal/emit/module.js';
import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  reservedIdentifiersRaw,
  typecheckEmitted,
} from './support.js';

// Plan Phase L — a Dart name the generated code also uses must not become the same identifier.
//
// Legal Dart, illegal or self-referential TypeScript: a State field called `signal` emitted
// `const [signal] = useState(() => signal(0))`, a reference to itself before initialisation (TS7022); `useState`
// and `useSignal` likewise; `arguments` and `eval` cannot be bound in a module (TS1215); a field called `props`
// shadowed the component's own parameter. All failed `tsc` and none said which of the author's names was the
// problem — and `bridge build` skips `tsc` when dependencies are not installed. `identifierOf` now renames them
// (`signal_`), as it already did for a reserved word.

afterAll(cleanupBuildProofTemporaries);

const emit = () => {
  const { context, reported } = harness(compiledFrom(reservedIdentifiersRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files };
};

describe('a Dart name the generated code also uses is renamed, not emitted as itself', () => {
  it('renames each of the seven', () => {
    for (const name of ['signal', 'useState', 'delay', 'arguments', 'eval', 'props', 'extent']) {
      expect(identifierOf(name), name).toBe(`${name}_`);
    }
  });

  it('leaves an ordinary name alone', () => {
    for (const name of ['count', '_items', 'label', 'signalStrength', 'Delay', 'isSignal']) {
      expect(identifierOf(name), name).toBe(name);
    }
  });

  it('emits no error, and real `tsc --strict` accepts the component', () => {
    const { reported, files } = emit();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  it('the emitted component binds the renamed identifiers, never the bare ones', () => {
    const source = fileAt(emit().files, 'src/components/reserved-names.tsx') ?? '';
    expect(source).toContain('signal_');
    expect(source).toContain('useState_');
    expect(source).not.toMatch(/const \[signal\]/);
    expect(source).not.toMatch(/const \[useState\]/);
    expect(source).not.toMatch(/const \[props\]/);
    // the component's own `props` parameter is still what reads the widget's `label`
    expect(source).toContain('props.label');
  });
});

// The list is copied because the generator must not import the runtime kit (ADR-19), and a copy drifts. This is
// the guard: it fails when the kit gains a lowercase-initial value export the generator does not reserve — i.e.
// when a future emitter could import a name that a user identifier can still collide with.
describe('the reserved list matches the runtime kit’s actual exports', () => {
  it('reserves every lowercase-initial value export of @bridge/runtime-react', async () => {
    const kitEntry = resolve(__dirname, '../../../runtimes/react/src/index.ts');
    const kit = (await import(/* @vite-ignore */ pathToFileURL(kitEntry).href)) as Record<string, unknown>;
    const missing = Object.keys(kit).filter((name) => /^[a-z]/.test(name) && !isGeneratedName(name));
    expect(missing, `add these to GENERATED_NAMES in emit/module.ts: ${missing.join(', ')}`).toEqual([]);
  });
});
