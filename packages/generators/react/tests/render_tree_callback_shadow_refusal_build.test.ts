import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, renderTreeCallbackShadowRefusalRaw } from './support.js';

// M11-D negative proof — real analyzer, real `bridge normalize`, real generator: a local declared in an
// outer render-tree callback, SHADOWED by a same-named local declared inside a NESTED `setState(() {
// ... })` call that reads it, refuses honestly as `BRG3019` rather than emitting invalid TypeScript.
//
// Declaration identity itself is resolved correctly and distinctly here — the read targets the INNER
// declaration, exactly as M11-D's own render_tree_callback_identity fixture proves for every
// non-shadowing shape. What has no faithful lowering is `setState`'s own splice (INV-22,
// `statement_extractor.dart`): its body is concatenated directly into the enclosing block's own statement
// list, with no JS-level `{ ... }` marking where it began, so `const value = 1; const value = 2;` would
// land back to back in the SAME emitted scope — `SyntaxError: Identifier 'value' has already been
// declared`, not merely a different program from the one Dart described. Silently renaming one of the two
// would emit a name the program never wrote; wrapping the splice back in a block would undo the erasure
// INV-22 exists for — so generation reports this and stops (`emitStatements`, `statement.ts`), exactly as
// `BRG3003` does for any other construct with no faithful lowering.
describe('M11-D: a callback local shadowed across a spliced-open setState boundary refuses as BRG3019, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(renderTreeCallbackShadowRefusalRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses with BRG3019, naming the shadowed identifier — never a silent, invalid emission', () => {
    const normalized = compiledFrom(renderTreeCallbackShadowRefusalRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3019' && d.message.includes('value'))).toBe(true);
    // No partial output — the generator's own all-or-nothing emission policy (`BRG3005`).
    expect(files).toEqual([]);
  });
});
