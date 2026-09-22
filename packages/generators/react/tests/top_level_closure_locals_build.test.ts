import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, topLevelClosureLocalsRaw, typecheckEmitted } from './support.js';

// A general (non-Riverpod) compiler bug, found and fixed during the M14 Riverpod StateNotifier work, and a
// regression test for it — real analyzer output in, real `bridge normalize`, real generator, real `tsc`.
//
// **The bug**: a local variable declared inside a *statement*-bodied closure that is a top-level `final`/
// `const`'s own initializer got no declaration-tier symbol of its own — the enclosing scope passed to
// `expressions.extract` for a `TopLevelVariableDeclaration`'s own initializer had `owner == null` (nothing
// ever wrapped it in `Scope.forBody`, unlike every other body this compiler extracts: a method, an action, a
// component's own `build`). Every read of such a local reached the generator as an untargeted `logic.Ref`,
// indistinguishable from a genuinely unresolvable name (`BRG3006` — "`base` is not declared in this
// program"). Root-caused directly: `_localSymbol` (`statement_extractor.dart`) returns `null` without an
// `owner`, so the local's own `logic.VarDecl` minted no symbol and no id a later read could target — proven
// by comparing the identical closure declared as a *local inside a widget's own `build`* (`Scope.forBody`
// already runs there), where the read correctly carries a `target`.
//
// **The fix**: `declaration_extractor.dart`'s `TopLevelVariableDeclaration` case now extracts the
// initializer in `Scope.forBody(scope, owner: <the constant's own symbol>, body: initializer)`, the same
// mechanism every other body already gets.
//
// `fixtures/apps/top_level_closure_locals`: `doubler` (`const`, a single read) and `greeting` (`let`, a
// reassignment after a read) — both keywords, both referenced from a *second* component (`HomeScreen`, not
// `App`), matching the shape real evidence (a Riverpod provider's own create closure) hit this through.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(topLevelClosureLocalsRaw());

describe('regression: a local inside a top-level constant’s own statement-bodied closure', () => {
  it('generates with no error', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('a single `const` local, read once, is declared and read as itself — never an unresolved reference', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/export const doubler: \(\) => number = \(\) => \{\s*const base = 3;\s*return intMul\(base, 2\);\s*\};/);
  });

  it('a reassigned local (`let`) is declared, read, then written — the write is not lost either', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toMatch(/let greeting = 'Hello';/);
    expect(main).toMatch(/const loud = greeting\.toUpperCase\(\);/);
    expect(main).toMatch(/greeting = `\$\{loud\}, \$\{name\}!`;/);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  });
});
