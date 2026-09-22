import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, typecheckEmitted, voidExpressionBodiesRaw } from './support.js';

// A general (non-Riverpod) semantic bug, found while building the M14 Riverpod fixtures, and its
// regression test — real analyzer output in, real `bridge normalize`, real generator, real `tsc --strict`.
//
// **The bug**: `void increment() => state = state + 1;` — an expression-bodied (`=>`) method/function
// *declared `void`* — lowered its own arrow body as `logic.Return{value: <the assignment>}`, exactly as an
// expression-bodied *non*-void method already correctly does. The generator then emitted
// `increment(): void { return (this.state = intAdd(this.state, 1), this.state); }` — a `number`-typed
// `return` inside a function whose own signature says `void`, a real `tsc` error, not merely an
// imprecision.
//
// **The root cause**, found by inspecting raw analyzer output directly (not assumed from the generator
// alone): Dart's own rule for `void f() => e;` is that `e` is evaluated *for its effect* and the function
// returns nothing — the language does not even require `e`'s own static type to be assignable to `void`
// (`void log() => print(msg);` is legal though `print` itself returns `void` too; `void f() => 3;` is
// legal though `3` is an `int`). `=> e` therefore means `{ e; }` for a `void`-declared arrow body, never
// `{ return e; }` — a raw-UIR representation choice, not a generator defect: the analyzer's own
// `ExpressionExtractor.bodyOf` (`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`)
// unconditionally wrapped every arrow body in `logic.Return`, regardless of the declared return type.
//
// **The fix**: `bodyOf` gained a `returnType` parameter and its own `isVoidReturn` check — applied *after*
// the pre-existing `setState`/`Navigator.pop` batch-splice/navigate special cases (both already model
// their own shape as an effect, so checking void-ness first would only reach the same answer through a
// different, untested path) — and every declaration-level call site that knows its own construct's
// declared return type now passes it through: a general class's own instance method
// (`declaration_extractor.dart`'s `_methods`), a top-level function (`_function`), an extension member
// (`_extension`), a widget's own lifecycle method (`signal_extractor.dart`'s `sig.Effect` loop) and its own
// action (`sig.Action` loop, `Future`-unwrapped for `async`). Deliberately **not** the `logic.Lambda` path
// (`ExpressionExtractor.lambda`) — that one's own `discard` parameter is already correctly, narrowly wired
// by specific callers that have already resolved which structural shape (`setState`/`Navigator.pop`) a
// lambda is, and generalizing the void check to lambdas too risks bypassing that resolution for a
// void-typed callback that also happens to match one of those shapes; out of this fix's own scope.
//
// `fixtures/apps/void_expression_bodies`: every extraction path the bug could reach, in one fixture —
// `Counter.increment()` (the reported shape: a general class's own method, an assignment),
// `Counter.doubled()` (non-void, must keep returning — the negative case), `Counter.reset()`
// (statement-bodied void — already correct, must stay correct), `Counter.log()` (void, a call rather than
// an assignment — the bug discards *any* value, not only an assignment's), `CounterX.plus1` (an extension
// setter — implicitly void, a different extraction path), `resetAll` (a top-level function), and
// `_HomeScreenState`'s own `dispose()` (a lifecycle method), `logTaps()`/`logAsync()` (a sync and an
// `async` widget action).

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(voidExpressionBodiesRaw());

describe('regression: an expression-bodied `void` method/function discards its own body, never returns it', () => {
  it('generates with no error', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('`Counter.increment()` — the reported shape: void, an assignment — has no `return` at all', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/increment\(\): void \{\s*this\.value = intAdd\(this\.value, 1\);\s*\}/);
    expect(main).not.toMatch(/increment\(\)[^}]*return/s);
  });

  it('`Counter.doubled()` — non-void — is unaffected: it still returns its value', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/doubled\(\): number \{\s*return intMul\(this\.value, 2\);\s*\}/);
  });

  it('`Counter.reset()` — statement-bodied void — is unaffected: still no `return`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/reset\(\): void \{\s*this\.value = 0;\s*\}/);
  });

  it('`Counter.log()` — void, a call rather than an assignment — also has no `return`', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/log\(\): void \{\s*dartDebugPrint\(`value is \$\{this\.value\}`\);\s*\}/);
  });

  it('an extension setter (a different extraction path) discards its own arrow body the same way', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export function CounterX_set_plus1\(\$this: Counter, v: number\) \{\s*\$this\.value = intAdd\(\$this\.value, v\);\s*\}/);
  });

  it('a top-level function (a third extraction path) discards its own arrow body the same way', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export function resetAll\(c: Counter\) \{\s*c\.reset\(\);\s*\}/);
  });

  it('a widget action, sync and `async` (a fourth extraction path), each discard their own arrow body', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/const handle_\w+ = \(\) => \{\s*dartDebugPrint\(`taps: \$\{taps\.get\(\)\}`\);\s*\};/);
    expect(home).toMatch(/const handle_\w+ = async \(\) => \{\s*dartDebugPrint\(`async taps: \$\{taps\.get\(\)\}`\);\s*\};/);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});
