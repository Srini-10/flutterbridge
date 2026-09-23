import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  stringBufferRefusalRaw,
  stringBufferSemanticsRaw,
  typecheckEmitted,
} from './support.js';

// `dart:core` `StringBuffer` — real analyzer output in, real `bridge normalize`, real generator, real `tsc --strict` against the real kit.
//
// Found by inventorying every `StringBuffer` in the two real applications: App A has none; App B has exactly two — `formatRupees` (initial
// content, `write` under `if`, `toString`) and `buildCsv` (a cascade on construction, `writeln` in a loop). Both were refused: `StringBuffer`
// was treated as one of the *project's own* classes ("this generator does not emit class declarations"), and that one refusal cascaded to
// every caller — 102 of App B's generator errors came from `formatRupees` alone.
//
// The UIR needed nothing new — `logic.New` of a `dart:core` type, `logic.MethodCall`s on it, and the cascade as `logic.Let`/`logic.Sequence` are
// all there already. What was missing is the class. A `StringBuffer` is a mutable object with identity (two references see each other's
// writes), so it is `DartStringBuffer`, a runtime class — the same route `DateTime` (`DartDateTime`) and `Timer` (`DartTimer`) take — not a
// concatenation helper. Dart's `write(Object? obj)` appends `"$obj"`, and what that prints depends on the static type, so the generator converts
// the argument exactly as string interpolation would and the class only ever sees text.
//
// The behaviour is compared with real Dart in `string_buffer_semantics_execution.test.ts` (this file checks the emitted *shape* and the refusals).

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(stringBufferSemanticsRaw());

function generated() {
  const { context, reported } = harness(normalized);
  const { files } = reactGenerator.generate(context);
  return { files, reported, main: fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '' };
}

describe('StringBuffer, real analyzer to real tsc', () => {
  it('generates with no error', () => {
    const { files, reported } = generated();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it("App B's `formatRupees`: initial content, `write` under an `if`, `write` of a `String`, `toString`", () => {
    const { main } = generated();
    expect(main).toContain("const buffer = new DartStringBuffer('₹');");
    expect(main).toMatch(/if \(negative\) \{\s*buffer\.write\('-'\);\s*\}/);
    expect(main).toContain('buffer.write(grouped);');
    expect(main).toContain('buffer.write(`.${parts[1]}`);');
    expect(main).toContain('return buffer.toString();');
  });

  it("App B's `buildCsv`: a cascade on construction keeps its receiver and its order, then `writeln` in a loop", () => {
    const { main } = generated();
    expect(main).toMatch(/const buffer = \(\(\$c\d+\) => \(\$c\d+\.writeln\(listMap\(headers, _escape\)\.join\(','\)\), \$c\d+\)\)\(new DartStringBuffer\(\)\);/);
    expect(main).toContain("buffer.writeln(listMap(row, _escape).join(','));");
  });

  it('a `write` argument is converted by its static type, exactly as interpolation would convert it', () => {
    const { main } = generated();
    // A non-nullable String is its own text; int/bool/`String?`/`int?` go through a template literal; a `double` prints as Dart's does (`1.0`).
    expect(main).toContain('.write(`${doubleToString(');
    expect(main).toMatch(/\.write\(`\$\{[^}]*\}`\)/);
    // And the constructor's initial content is `"$content"` too.
    expect(main).toContain('new DartStringBuffer(`${7}`)');
    expect(main).toContain('new DartStringBuffer(`${doubleToString(1.5)}`)');
  });

  it('a plain enum is written as `Kind.name`, an enhanced enum and a class through their own `toString`', () => {
    const { main } = generated();
    // The target represents a plain enum value as its bare name (`'b'`); Dart prints `Kind.b`, so the enum's name goes in front, as `'$k'` does.
    expect(main).toContain("new DartStringBuffer(`Kind.${'a'}`)");
    expect(main).toContain(".write(`Kind.${'b'}`)");
    expect(main).toMatch(/\.write\(`\$\{Level\.high\}`\)/);
    expect(main).toMatch(/\.write\(`\$\{Tagged\.\$new\$Tagged\(7\)\}`\)/);
    expect(main).toMatch(/toString\(\): string \{\s*return `Tagged#\$\{this\.id\}`;/);
  });

  it('a buffer is typed as the runtime class wherever it is declared, passed or returned — never `unknown`', () => {
    const { main } = generated();
    expect(main).toContain('function fill(target: DartStringBuffer, count: number)');
    expect(main).toContain('function pick(log: DartStringBuffer, target: DartStringBuffer)');
    expect(main).toMatch(/import \{[^}]*\bDartStringBuffer\b[^}]*\} from '@bridge\/runtime-react';/);
  });

  it('nothing is left naming the Dart class: no `new StringBuffer`, no bare `StringBuffer` identifier', () => {
    const { main } = generated();
    expect(main).not.toMatch(/\bnew StringBuffer\b/);
    expect(main).not.toMatch(/(?<![A-Za-z])StringBuffer\b/);
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

describe('negative fixture: the members and argument kinds still refused, each by its own diagnostic', () => {
  const unsupported = compiledFrom(stringBufferRefusalRaw());
  const run = () => {
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.severity === 'error') };
  };

  it('every one of the eleven shapes is refused, by name, and nothing is emitted', () => {
    const { files, errors } = run();
    const messages = errors.filter((d) => d.code === 'BRG3013').map((d) => d.message);
    expect(messages).toHaveLength(11);
    for (const member of ['length', 'isEmpty', 'writeAll', 'writeCharCode', 'clear']) {
      expect(messages.filter((m) => m.includes(`\`StringBuffer.${member}\` has no lowering`)), member).toHaveLength(1);
    }
    expect(messages.filter((m) => m.includes('Interpolating a `num` has no lowering'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('Interpolating a `List` has no lowering'))).toHaveLength(1);
    // A value whose Dart text nothing here checks is refused rather than written as whatever JavaScript prints.
    expect(messages.filter((m) => m.includes('`write` of a `Duration` has no lowering'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('`write` of a `DateTime` has no lowering'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('`write` of a `Kind` has no lowering') && m.includes('test for null first'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes("`write` of a `Plain` has no lowering") && m.includes("Instance of 'Plain'"))).toHaveLength(1);
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3005', ...Array(11).fill('BRG3013')]);
    expect(files).toHaveLength(0);
  });

  it('the refusal says what IS lowered, so it is a diagnosis and not a dead end', () => {
    const { errors } = run();
    const refusal = errors.find((d) => d.message.includes('`StringBuffer.length` has no lowering'));
    expect(refusal?.message).toContain('`write`, `writeln` and `toString`');
  });
});
