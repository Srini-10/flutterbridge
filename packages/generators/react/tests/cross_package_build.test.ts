import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, crossPackageAppRaw, fileAt, harness, typecheckEmitted } from './support.js';

// The M8-F build-proof — a component (`GreetingCard`) declared in a `path:` dependency
// (`cross_package_ui`), constructed by the application's own `HomeScreen`, with a constant prop
// crossing the package boundary, and its own local state and action inside it
// (`docs/m8/m8f-cross-package-component-assembly.md`).
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` against the
// real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other
// build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(crossPackageAppRaw());

describe('M8-F build-proof: a component from a local path dependency, real analyzer to real tsc', () => {
  it('the generator reports no error and both components are emitted', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(fileAt(files, 'src/components/home-screen.tsx')).toBeDefined();
    expect(fileAt(files, 'src/components/greeting-card.tsx')).toBeDefined();
  });

  it('HomeScreen imports and constructs GreetingCard from its own emitted file', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';

    expect(source).toContain("import { GreetingCard } from '@/components/greeting-card';");
    expect(source).toMatch(/<GreetingCard name=\{'Ada'\} \/>/);
  });

  it('the constant prop crosses the package boundary, and the dependency’s own state and action are its own', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const card = fileAt(files, 'src/components/greeting-card.tsx') ?? '';

    expect(card).toContain('readonly name: string;');
    expect(card).toContain('props.name');
    // GreetingCard's own local signal and action — declared and consumed entirely inside its own file,
    // proving the dependency component is a genuine, independently-functioning component, not a stub
    // that merely accepts a prop.
    expect(card).toMatch(/const \[_count\] = useState\(\(\) => signal\(0\)\);/);
    expect(card).toContain('_count.set((_count.get() + 1));');
  });

  it('typechecks against the real runtime kit', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(() => typecheckEmitted(files)).not.toThrow();
  });
});
