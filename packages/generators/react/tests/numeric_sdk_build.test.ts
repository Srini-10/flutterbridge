import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, numericSdkRaw, typecheckEmitted } from './support.js';

// The M8-V build-proof — a `dart:core Duration` parameter and its own `inSeconds`/`inMinutes`/`inHours`
// getters, `int.toDouble()`, `int.remainder()`, and `double.toStringAsFixed()`, all recognized by the
// receiver's own resolved type (never by name), including the exact real Continuum shapes of
// `formatUptime` and `formatBytes`.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(numericSdkRaw());

describe('M8-V build-proof: Dart numeric/Duration SDK recognition, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('a Duration parameter is typed Duration, not unknown, and its getters lower to inMilliseconds arithmetic', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function describeDuration(d: Duration) {');
    expect(source).toContain('const s = Math.trunc(d.inMilliseconds / 1000);');
    expect(source).toContain('const m = Math.trunc(d.inMilliseconds / 60000);');
    expect(source).toContain('const h = Math.trunc(d.inMilliseconds / 3600000);');
  });

  it('a nullable Duration parameter is typed Duration | null', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function describeNullableDuration(d: Duration | null) {');
  });

  it('int.toDouble() is a no-op — the receiver text alone, no method call emitted', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function intVarToDouble(n: number) {\n  return n;\n}');
    expect(source).not.toContain('.toDouble()');
  });

  it('double.toStringAsFixed(n) lowers to .toFixed(n)', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function doubleToStringAsFixed(v: number) {\n  return v.toFixed(2);\n}');
    expect(source).not.toContain('.toStringAsFixed(');
  });

  it('the exact real formatUptime shape lowers correctly — getters, remainder, early-return chain', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function formatUptimeLike(d: Duration) {');
    expect(source).toContain('(Math.trunc(d.inMilliseconds / 60000) % 60)');
    expect(source).not.toContain('.remainder(');
  });

  it('the exact real formatBytes shape lowers correctly — locals, loop, toDouble elision, toFixed', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain('export function formatBytesLike(bytes: number) {');
    expect(source).toContain('let value = bytes;');
    expect(source).toMatch(/value\.toFixed\(\(\(unit === 0\) \? 0 : 1\)\)/);
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
