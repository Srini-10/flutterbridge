import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, fileAt, harness, mutableCaptureRaw, typecheckEmitted } from './support.js';

// M11-G positive proof — real analyzer, real `bridge normalize`, real generator: a mutable (`var`)
// local declared and mutated ENTIRELY within one callback's own body (including through a nested,
// spliced-open `setState` call, INV-22) already resolves correctly, by the identical declaration-tier
// identity mechanism an immutable local uses (ADR-28, M9-A, M11-D) — no new mechanism was needed. A
// mutable `build()`-level local (carried by `Binding.inlineValue`, M8-B) may be read from any nested
// callback — re-extracting a never-mutated initializer is sound, since `build()` is already required to
// be free of externally observable side effects — but WRITING to one from anywhere is a separate,
// deliberately refused shape (`BRG1311`, a pure Dart-side extraction refusal — no UIR document is ever
// produced for it, so there is nothing for this generator-level test file to exercise; see the Dart
// extraction test group `mutable local write refusal (BRG1311, M11-G)` instead).
describe('M11-G: a mutable local mutated within its own declaring callback resolves correctly, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every rung here is fully supported', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1 — a mutable local, declared, mutated, and read entirely within one callback (no capture).
  it('a mutable local mutated within its own declaring callback produces a real, correctly-mutated let binding', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/same-scope-widget.tsx') ?? '';
    expect(file).toMatch(/let count = 0;\s*\n\s*count = count \+ 1;\s*\n\s*_result\.set\(count\);/);
  });

  // R10 — multiple mutable locals, both mutated within the same callback.
  it('multiple mutable locals, both mutated in the same callback, both resolve independently', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/multiple-locals-widget.tsx') ?? '';
    expect(file).toMatch(/let a = 1;\s*\n\s*let b = 2;\s*\n\s*a = a \+ 1;\s*\n\s*b = b \+ 1;\s*\n\s*_result\.set\(\(a \+ b\)\);/);
  });

  // R2/Case C — a mutable build()-level local, captured and READ ONLY (never written).
  it('a mutable build()-level local, read-only, is inlined at every read site (never mutated, so this is sound)', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/read-only-capture-widget.tsx') ?? '';
    expect(file).toContain('_result.set(7);');
    expect(file).toContain('base ${7}');
  });

  // R7 — a build()-level local (read-only), shadowed by an inner, real local that IS mutated. The
  // inner mutation is safe; the never-written outer local is correctly unaffected.
  it('an inner, mutated local shadowing a read-only build()-level local never contaminates the outer one', () => {
    const normalized = compiledFrom(mutableCaptureRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/shadowed-mutation-widget.tsx') ?? '';
    expect(file).toMatch(/let value = 1;\s*\n\s*value = value \+ 1;\s*\n\s*_result\.set\(value\);/);
    expect(file).toContain('outer ${100}');
  });
});
