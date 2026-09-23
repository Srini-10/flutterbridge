import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  intToStringRefusalRaw,
  intToStringSemanticsRaw,
  typecheckEmitted,
} from './support.js';

// `int.toString()` and `double.toString()` — real analyzer output in, real `bridge normalize`, real generator, real `tsc --strict`.
//
// App B's `int.toString` refusals (65 of its generator errors, almost all cascading up through the helper that contains one) are four
// shapes and only four: `n.truncate().toString()`, `v.round().toString()`, `v.toInt().toString()` and `time.hour.toString().padLeft(2, '0')`.
// Every receiver is statically an `int`, with no arguments — Dart's `int.toString()` takes none; a radix is the different method `toRadixString`.
//
// An `int` in this compiler is a JavaScript-safe integer (an int beyond 2^53 is refused before it gets here), and `String(n)` of one is Dart's own
// digits: `-5` → `-5`, `0` → `0`, `9007199254740991` unchanged; JavaScript leaves plain digits only from 1e21, far above that, and `String(-0)` is `0`.
// A `double` prints as interpolating it already does — `doubleToString` (`1.0`, `1e+21`, `-0.0`, `NaN`). A `num` is an int or a double at run time
// and a JavaScript number cannot say which, so it stays refused; so does a nullable `double` (no helper prints both `null` and `1.0`-style text).
//
// The values are compared with real Dart in `int_to_string_semantics_execution.test.ts` (this file checks the emitted shape and the refusals).

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(intToStringSemanticsRaw());

function generated() {
  const { context, reported } = harness(normalized);
  const { files } = reactGenerator.generate(context);
  return {
    files,
    reported,
    main: fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '',
    everything: files.map((f) => f.contents).join('\n'),
  };
}

describe('int.toString / double.toString, real analyzer to real tsc', () => {
  it('generates with no error', () => {
    const { files, reported } = generated();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it("App B's shapes: `n.truncate().toString()`, `v.round().toString()`, `v.toInt().toString()`, a `DateTime` field", () => {
    const { main } = generated();
    expect(main).toMatch(/String\(numTruncate\(n\)\)/);
    expect(main).toMatch(/String\(numRound\(v\)\)/);
    expect(main).toMatch(/String\(numTruncate\(v\)\)/);
    expect(main).toMatch(/String\(time\.hour\)\.padStart\(2, '0'\)|strPadLeft\(String\(time\.hour\), 2, '0'\)/);
  });

  it('a `double` goes through `doubleToString`; a nullable `int` through `dartToStringDynamic`', () => {
    const { main, everything } = generated();
    expect(everything).toMatch(/doubleToString\(whole\)|\$\{doubleToString\(/);
    expect(main).toMatch(/function nullable\(n: number \| null\) \{\s*return dartToStringDynamic\(n\);/);
  });

  it('`x?.toString()` stays a null-guarded call — the guard, not the helper, decides whether it runs', () => {
    const { main } = generated();
    expect(main).toMatch(/function nullAware\(n: number \| null\) \{\s*return \(\(\(n !== null\) \? dartToStringDynamic\(n\) : null\) \?\? 'none'\);/);
  });

  it('is deterministic — two generations are byte-identical', () => {
    const a = generated().files.map((f) => `${f.path}\n${f.contents}`);
    const b = generated().files.map((f) => `${f.path}\n${f.contents}`);
    expect(a).toEqual(b);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    typecheckEmitted(generated().files);
  }, 120_000);
});

describe('negative fixture: the `toString` forms still refused, each precisely', () => {
  const unsupported = compiledFrom(intToStringRefusalRaw());
  const run = () => {
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.severity === 'error') };
  };

  it('`num.toString()`, a nullable `double`\'s, and `ceilToDouble` are each refused by name; nothing is emitted', () => {
    const { files, errors } = run();
    const messages = errors.filter((d) => d.code === 'BRG3013').map((d) => d.message);
    expect(messages).toHaveLength(3);
    expect(messages.filter((m) => m.includes('`num.toString` has no lowering'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('`double?.toString()` prints `null`'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('`double.ceilToDouble` has no lowering'))).toHaveLength(1);
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3005', 'BRG3013', 'BRG3013', 'BRG3013']);
    expect(files).toHaveLength(0);
  });

  it('the refusal says `toString` on an `int` or a `double` IS lowered, and why a `num` is not', () => {
    const { errors } = run();
    const refusal = errors.find((d) => d.message.includes('`num.toString` has no lowering'));
    expect(refusal?.message).toContain('`toString` on an `int` or a `double` (not a `num`, which cannot say which it is)');
  });
});
