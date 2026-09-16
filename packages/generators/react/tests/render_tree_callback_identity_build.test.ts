import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, fileAt, harness, renderTreeCallbackIdentityRaw, typecheckEmitted } from './support.js';

// M11-D positive proof — real analyzer, real `bridge normalize`, real generator: an ordinary local
// declared inside an INLINE RENDER-TREE callback (`onPressed: () { ... }`) resolves to a real,
// declaration-tier `target` — never `BRG3006` — whether the read happens directly in the same callback,
// or from a NESTED closure that captures it (`setState`), matching the original M11-C R5 shape.
//
// Before this milestone, `Scope.forWidgetTree` (M9-F) inherited `_owner`/`_ordinals` unchanged from its
// enclosing scope — `null`, all the way from `classState.scope`, because nothing between a component's
// class scope and its render tree ever called `Scope.forBody`. So an ordinary local declared anywhere in
// a component's render tree (`onPressed`, `onTap`, any inline callback) had no declaration-tier symbol,
// REGARDLESS of nesting depth — a fresh M11-D probe proved the direct (non-nested) case fails identically
// to the nested one, which M11-C's own R5 had not distinguished. Two widgets independently declaring a
// structurally-identical local also produced the SAME content-addressed `NodeId` for their own
// `logic.VarDecl` — a real cross-widget collision, proven at the raw extraction layer before this fix.
//
// The fix (`scope.dart`'s `Scope.forWidgetTree`) runs the SAME `_ordinalsOf` pre-pass it already ran for
// its own widget-ordinal pair (M9-F, collection-for items) and starts a REAL `_owner`/`_ordinals` pair
// from it too — the one `statement_extractor.dart`'s own `_localSymbol` reads. No new UIR field, no new
// UIR node, no new mechanism: an existing declaration-tier identity scheme (M9-A, already proven
// collision-free for `for`-loops, and reused by M11-B/M11-C for action-body locals) now also reaches
// render-tree-embedded callback locals. `build()`'s own leading locals (M8-B's `inlineValue`) are
// unaffected — `_structuredBody` never routes those through `_localSymbol` at all, and `_reference`
// checks `inlineValue` first regardless.
//
// A local SHADOWED across a spliced-open `setState` call's own erased boundary (M11-C's own R6-style
// case) is a separate, deliberately refused finding (`BRG3019`) — see
// `fixtures/apps/render_tree_callback_shadow_refusal` and its own build test.
describe('M11-D: an ordinary local declared inside an inline render-tree callback resolves correctly by declaration identity, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every rung here is fully supported', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1 — a local declared and read DIRECTLY in the same callback, no nested closure at all.
  it('a local read directly in the same callback (no nesting) resolves correctly', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/direct-read-widget.tsx') ?? '';
    expect(file).toMatch(/const r = 1;\s*\n\s*_result\.set\(r\);/);
  });

  // R2 — a local declared in the outer callback, read from a NESTED closure (`setState`) — the original
  // M11-C R5 shape.
  it('a local captured by a nested setState closure resolves correctly', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/nested-read-widget.tsx') ?? '';
    expect(file).toMatch(/const value = 5;\s*\n\s*_result\.set\(value\);/);
  });

  // R3 — two sibling outer callbacks, the SAME local name in each, nested read — each must resolve to
  // its own declaration, never its sibling's.
  it('sibling callbacks sharing a local name never resolve to each other', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/sibling-same-name-widget.tsx') ?? '';
    expect(file).toMatch(/const value = 10;\s*\n\s*_resultA\.set\(value\);/);
    expect(file).toMatch(/const value = 20;\s*\n\s*_resultB\.set\(value\);/);
  });

  // R4 — two sibling outer callbacks, different local names, nested read.
  it('sibling callbacks with different local names each resolve correctly', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/sibling-different-name-widget.tsx') ?? '';
    expect(file).toMatch(/const alpha = 10;\s*\n\s*_resultA\.set\(alpha\);/);
    expect(file).toMatch(/const beta = 20;\s*\n\s*_resultB\.set\(beta\);/);
  });

  // R5 — two DIFFERENT WIDGETS independently declaring a structurally-identical local — the M11-C R5
  // cross-widget collision. Both must resolve correctly and independently; the assertion that they are
  // SEPARATE files with SEPARATE, correct bodies is itself the collision-elimination proof (a real
  // collision would have manifested as one widget's helper silently referencing the other's declaration,
  // or as a build-time crash from two nodes sharing one id).
  it('two widgets independently declaring the same local never collide', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const a = fileAt(files, 'src/components/cross-widget-collision-a.tsx') ?? '';
    const b = fileAt(files, 'src/components/cross-widget-collision-b.tsx') ?? '';
    expect(a).toMatch(/const value = 5;\s*\n\s*_result\.set\(value\);/);
    expect(b).toMatch(/const value = 5;\s*\n\s*_result\.set\(value\);/);
    expect(a).not.toBe(b);
  });

  // R8 — a mutable (`var`, reassigned) local captured by a nested closure.
  it('a mutable local captured by a nested closure resolves correctly', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/mutable-capture-widget.tsx') ?? '';
    expect(file).toMatch(/let count = 0;\s*\n\s*count = \(count \+ 1\);\s*\n\s*_result\.set\(count\);/);
  });

  // R9 — multiple reads of the same captured declaration.
  it('multiple reads of the same captured local all resolve to it', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/multiple-reads-widget.tsx') ?? '';
    expect(file).toMatch(/const value = 3;\s*\n\s*_result\.set\(\(value \+ value\)\);/);
  });

  // R10 — multiple captured locals from the same enclosing callback.
  it('multiple captured locals from the same callback both resolve correctly', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/multiple-captures-widget.tsx') ?? '';
    expect(file).toMatch(/const a = 1;\s*\n\s*const b = 2;\s*\n\s*_result\.set\(\(a \+ b\)\);/);
  });

  // R11 — an ordinary captured local sharing a name with a collection-for loop item (M9-F) elsewhere in
  // the same render tree — a deliberately separate identity mechanism. Neither resolves to the other.
  it('a captured local and a collection-for item sharing a name never cross-resolve', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/collection-for-name-clash-widget.tsx') ?? '';
    expect(file).toContain("['a', 'b'].map((value, index) =>");
    expect(file).toMatch(/const value = 1;\s*\n\s*_result\.set\(value\);/);
  });

  // R12 — a captured local sharing a name with a class member (a getter) — the read must resolve to the
  // local, never the member.
  it('a captured local shadowing a member getter by name resolves to the local', () => {
    const normalized = compiledFrom(renderTreeCallbackIdentityRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const file = fileAt(files, 'src/components/member-name-clash-widget.tsx') ?? '';
    expect(file).toMatch(/const helper = 5;\s*\n\s*_result\.set\(helper\);/);
  });
});
