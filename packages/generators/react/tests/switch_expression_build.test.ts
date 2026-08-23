import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, switchExpressionRaw, typecheckEmitted } from './support.js';

// The M8-Y build-proof — a `return switch (subject) { EnumConstant => literal, ... }` in direct-return
// position, the narrow, evidence-bounded subset this generator admits.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(switchExpressionRaw());

describe('M8-Y build-proof: Dart 3 switch-expression extraction, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('an unguarded, exhaustive, enum-constant-pattern switch expression lowers to a correct switch, case order preserved', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    // An explicit return type — not TS-inferred `string | undefined` — is what makes the switch's own
    // lack of a `default` case sound: Dart already proved every case is covered, and this makes `tsc`
    // check that same claim instead of silently widening the type at every call site.
    expect(source).toContain('export function describeFailureReason(reason: unknown): string {');
    expect(source).toContain("case 'permissionDenied': {\n      return 'failed: permission denied';\n    }");
    expect(source).toContain("case 'hashMismatch': {\n      return 'failed: checksum mismatch';\n    }");
    expect(source).toContain("case 'ioError': {\n      return 'failed: storage error';\n    }");
    expect(source).toContain("case 'none': {\n      return 'failed';\n    }");
    // No `break;` after a `return` — the leaves() check already covers this, asserted directly here.
    expect(source).not.toContain("return 'failed';\n    }\n    break;");
  });

  it('a null pattern lowers to `case null:`, ordered first, matching source order', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    const idx = source.indexOf('export function describeStage');
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = source.slice(idx);
    expect(body.indexOf('case null:')).toBeLessThan(body.indexOf("case 'idle':"));
  });

  it('a case result that calls a function lowers to that call, not a literal', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(source).toContain("case 'left': {\n      return _label('left');\n    }");
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
