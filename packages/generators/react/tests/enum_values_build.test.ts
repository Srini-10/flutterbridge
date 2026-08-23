import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, enumValuesRaw, fileAt, harness, typecheckEmitted } from './support.js';

// The M8-Z build-proof — a project enum's own compiler-synthesized `values` getter, recognized by
// resolved element identity and lowered to an array literal, including the exact real Continuum shape of
// `ContinuumFeature` (an enhanced enum with a constructor and a field). Per-element property access
// (`.id`, `.name`) on an individual enum-typed value is a separate, already-known gap (no runtime kit or
// generated declaration models a Dart enum's own *type* today, M8-V's own finding) and is deliberately
// not exercised by this fixture — this build-proof is scoped to `.values` itself.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(enumValuesRaw());

describe('M8-Z build-proof: enum .values recognition, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('.values lowers to an array literal, declaration order preserved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain("export function aSimplest() {\n  return ['idle', 'ready'].join();\n}");
  });

  it('the exact real ContinuumFeature (enhanced enum) shape lowers correctly, declaration order preserved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain(
      "export function featureNames() {\n  return ['notifications', 'clipboard', 'files', 'battery'].join(',');\n}",
    );
  });

  it('two different enums with identical member names never conflate or error while lowering', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    // Both G1 and G2 emit the identical-looking array by coincidence (same member names) — the real
    // identity proof is upstream, in the raw-UIR test (enum_values_recognition.test.ts); this only
    // confirms the generator does not error or conflate the two declarations while lowering each.
    expect(source).toContain("export function gCollision() {\n  return `${['ready', 'waiting'].join()}${['ready', 'waiting'].join()}`;\n}");
  });

  it('.length/indexing/repeated-reads/stored-in-local/returned-from-function all lower correctly', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain("['idle', 'ready'].length");
    expect(source).toContain("['idle', 'ready'][0]");
    expect(source).toContain("const first = ['idle', 'ready'];\n  const second = ['idle', 'ready'];");
    expect(source).toContain("const all = ['idle', 'ready'];\n  return all.join();");
    expect(source).toContain("export function _allStages() {\n  return ['idle', 'ready'];\n}");
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
