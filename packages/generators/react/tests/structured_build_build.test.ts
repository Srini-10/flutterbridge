import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, structuredBuildRaw, typecheckEmitted } from './support.js';

// The M8-B build-proof — a `build()` body M8-A's real Continuum measurement found extraction collapsing
// wholesale to `ui.Opaque`: a local (`final greeting = _greeted ? '...' : '...';`) used inside the
// returned tree, an early return on a signal-driven condition (`if (_loading) { return ...; }`), then
// the final return (`docs/m8/m8a-real-application-baseline.md` §5, §15).
//
// Real analyzer output in, real `bridge normalize` (N1–N11), real generator, real `tsc` against the real,
// unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other build-proof in
// this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(structuredBuildRaw());

describe('M8-B build-proof: a structured build() body, real analyzer to real tsc', () => {
  it('the generator reports no error and the body is not left opaque', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('the early return is a real ternary on the signal, not a literal `undefined`', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/greeting-screen.tsx') ?? '';

    // The regression this build-proof exists to catch: `ui.Cond` read the wrong schema field
    // (`condition` instead of `test`), so every signal-driven early return silently always rendered
    // its `otherwise` branch. `tsc` alone could not have caught this — the emitted `undefined ? A : B`
    // was perfectly valid TypeScript.
    expect(source).not.toContain('undefined ?');
    expect(source).toMatch(/_loading\$\s*\?/);
  });

  it('the local used inside the returned tree substitutes correctly, not by declaration order', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/greeting-screen.tsx') ?? '';

    expect(source).toContain("_greeted$ ? 'Hello again!' : 'Welcome'");
  });

  it('both the loading branch and the loaded branch keep their own content', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/greeting-screen.tsx') ?? '';

    expect(source).toContain('CircularProgressIndicator');
    expect(source).toContain('AppBar');
    expect(source).toMatch(/'Structured Build'/);
  });

  it('typechecks against the real runtime kit', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(() => typecheckEmitted(files)).not.toThrow();
  });
});
