import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, moduleEmissionRaw, typecheckEmitted } from './support.js';

// The ADR-29 (M8-U) build-proof — a project-defined top-level `logic.FunctionDecl`, reachable and
// self-contained, gains a real module-level TypeScript lowering: zero/one/two-parameter functions, a
// local variable, an early-return chain, arithmetic, string interpolation and a property/method call on
// the function's own parameter, a same-file function-to-function call, a cross-file same-package call,
// and two same-named functions declared in two different files (collision-free by construction, ADR-29
// §4/§10).
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified — confirmed byte-identical before
// and after), real generator, real `tsc` against the real, unmocked `@bridge/runtime-react` — no
// hand-authored UIR anywhere, matching every other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(moduleEmissionRaw());

describe('ADR-29 build-proof: top-level function module emission, real analyzer to real tsc', () => {
  it('the generator reports no error — every reachable, self-contained function resolves', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3013')).toBe(false);
  });

  it('emits one generated module per Dart source file, never per declaration or per package', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const generated = files.map((f) => f.path).filter((p) => p.startsWith('src/generated/dart/'));
    expect(generated.sort()).toEqual([
      'src/generated/dart/module-emission-utils/collide-a.ts',
      'src/generated/dart/module-emission-utils/collide-b.ts',
      'src/generated/dart/module-emission-utils/format-utils.ts',
      'src/generated/dart/module-emission-utils/prefix-utils.ts',
    ]);
  });

  it('a same-file function-to-function call needs no import', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/module-emission-utils/format-utils.ts') ?? '';
    expect(source).toContain('export function describeBoth(a: number, b: number) {');
    expect(source).toContain('${classify(a)} and ${classify(b)}');
    expect(source).not.toContain('import');
  });

  it('a cross-file, same-package call imports the callee by its own module', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/module-emission-utils/prefix-utils.ts') ?? '';
    expect(source).toContain("import { shout } from '@/generated/dart/module-emission-utils/format-utils';");
    expect(source).toContain('export function withPrefix(s: string) {');
  });

  it('two same-named functions in two different files never collide — target-based module ownership, not name-based', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const a = fileAt(files, 'src/generated/dart/module-emission-utils/collide-a.ts') ?? '';
    const b = fileAt(files, 'src/generated/dart/module-emission-utils/collide-b.ts') ?? '';
    expect(a).toContain("export function sameName() {\n  return 'A';\n}");
    expect(b).toContain("export function sameName() {\n  return 'B';\n}");

    const consumer = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(consumer).toContain("import { sameName } from '@/generated/dart/module-emission-utils/collide-a';");
    expect(consumer).toContain("import { sameName as sameName2 } from '@/generated/dart/module-emission-utils/collide-b';");
    expect(consumer).toContain('sameName()');
    expect(consumer).toContain('sameName2()');
  });

  it('a local variable inside a function resolves by declaration-tier identity (ADR-28), not by name', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/module-emission-utils/format-utils.ts') ?? '';
    expect(source).toContain('export function describeCount(count: number) {');
    expect(source).toMatch(/const plural = \(count !== 1\);\s*\n\s*const label = \(plural \? 'items' : 'item'\);/);
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
