import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, m9ClassClosureRaw, typecheckEmitted } from './support.js';

// The M9-R final closure build-proof — one integrated, real end-to-end pipeline run exercising the
// complete bounded project-class subset M9 closes with: a required-named structural constructor
// (M9-P/ADR-0037, in the constructor's own reversed parameter order), two immutable field reads
// (M9-N/ADR-0035), and one bounded derived getter (M9-Q/ADR-0038) — all on one class, all operating on
// the identical structural object. No method call anywhere in this fixture: methods remain refused,
// deferred to M10+ (docs/m9/m9r-final-closure.md).
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(m9ClassClosureRaw());

describe('M9-R final closure build-proof: the complete bounded project-class subset, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('the interface represents only actual runtime structural state — count and name, never doubled', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const model = fileAt(files, 'src/generated/dart/app/lib/model.ts') ?? '';
    expect(model).toContain('export interface Model {');
    expect(model).toContain('readonly count: number;');
    expect(model).toContain('readonly name: string;');
    // The getter is a helper function, never a property on the structural interface itself (§21 of the
    // governing brief — "type-shape honesty": the runtime object does not physically contain `doubled`).
    expect(model).not.toMatch(/readonly doubled/);
    expect(model).toMatch(/export function Model_doubled\(self: Model\): number \{/);
    expect(model).toContain('self.count * 2');
    expect(model).not.toContain('class Model');
    expect(model).not.toMatch(/\.prototype\b/);
    expect(model).not.toMatch(/\bany\b/);
  });

  it("construction is a plain object literal, in the call's own real source label order — not declaration order", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/class-closure-demo.tsx') ?? '';
    // Call site: `Model.named(name: 'A', count: 7)` — the SAME order as the constructor's own declaration
    // here (name, then count) — chosen so this fixture also serves as the honest "declaration order ==
    // call order" positive case; M9-P's own dedicated tests already cover the reversed-order proof.
    expect(home).toMatch(/\{ name: 'A', count: 7 \}/);
    expect(home).not.toContain('new Model');
    expect(home).not.toContain('Model.named');
  });

  it('field reads are direct receiver properties; the getter read calls the generated helper', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/class-closure-demo.tsx') ?? '';
    // `model` is itself the inlined `{ name: 'A', count: 7 }` construction (a pre-existing, documented,
    // out-of-scope component build-method inlining limitation — ADR-0036 §31 — harmless here since every
    // argument is a pure literal); each read below reaches the identical construction value.
    expect(home).toMatch(/\{ name: 'A', count: 7 \}\.count/);
    expect(home).toMatch(/\{ name: 'A', count: 7 \}\.name/);
    expect(home).toMatch(/Model_doubled\(\{ name: 'A', count: 7 \}\)/);
    expect(home).not.toContain('.doubled');
    expect(home).not.toMatch(/\bany\b/);
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
