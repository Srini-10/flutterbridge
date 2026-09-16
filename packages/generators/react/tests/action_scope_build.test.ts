import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { actionScopeRaw, compiledFrom, fileAt, harness, typecheckEmitted } from './support.js';

// M11-C positive proof — real analyzer, real `bridge normalize`, real generator: a local variable
// declared inside a store action's own body, and read by a LATER statement in the same body, resolves
// correctly. Before this milestone, EVERY such read refused honestly via `BRG3006` — a real, live-probed,
// pre-existing gap found while building M11-B's own fixture: `store.ts`'s own `actionScope` never wired
// `localName`, unlike `functions.ts`'s member-helper loop and `component.ts`'s own sibling `actionScope`,
// both of which already correctly do. This is a pure generator-side correction — extraction already
// resolved a real `target` for every one of these reads, confirmed unchanged before and after
// normalization (a fresh M11-C probe, not merely re-trusting M11-B's own report).
describe('M11-C: a local declared inside a store action body resolves correctly by declaration identity, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every local-in-action shape here is fully supported', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R1/R2/R3 — the smallest positive case: a local declared, then read by a LATER statement in the same
  // action body.
  it('a local declared then read by a later statement resolves correctly', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/action-scope-store.ts') ?? '';
    expect(store).toContain(
      "const runLocal = action(() => {\n    const value = 1;\n    const computed = (value + 1);\n    result.set(computed);\n  }, 'runLocal');",
    );
  });

  // R4 — a nested lexical block `{}` inside an action body.
  it('a nested block scope resolves both its own and the enclosing local correctly', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/action-scope-store.ts') ?? '';
    expect(store).toContain(
      "const runNestedBlock = action(() => {\n    const outer = 1;\n    const inner = 2;\n    result.set((outer + inner));\n  }, 'runNestedBlock');",
    );
  });

  // R7 — shadowing: a local named identically to a FIELD-BACKED SIGNAL resolves to the LOCAL, never the
  // signal — and the signal itself remains correctly readable from a DIFFERENT, non-shadowing action.
  it('a local shadowing a field-backed signal resolves to the local, and the signal remains independently readable', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/action-scope-store.ts') ?? '';
    expect(store).toContain(
      "const runShadow = action(() => {\n    const shadowField = 2;\n    result.set(shadowField);\n  }, 'runShadow');",
    );
    expect(store).toContain("const runReadField = action(() => {\n    result.set(shadowField.get());\n  }, 'runReadField');");
  });

  // R8 — sibling scope isolation: two DIFFERENT actions on the SAME store, each declaring a local of the
  // IDENTICAL name, must never collide.
  it('sibling actions declaring a local of the identical name never collide', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/action-scope-store.ts') ?? '';
    expect(store).toContain("const runSiblingA = action(() => {\n    const value = 10;\n    result.set(value);\n  }, 'runSiblingA');");
    expect(store).toContain("const runSiblingB = action(() => {\n    const value = 20;\n    result.set(value);\n  }, 'runSiblingB');");
  });

  // R10 — a MUTABLE local (reassigned after its own declaration) — the fix is unconditional on
  // mutability, never a separate primitive.
  it('a mutable (reassigned) local resolves correctly, emitted as `let`', () => {
    const normalized = compiledFrom(actionScopeRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const store = fileAt(files, 'src/stores/action-scope-store.ts') ?? '';
    expect(store).toContain(
      "const runMutable = action(() => {\n    let count = 0;\n    count = (count + 1);\n    result.set(count);\n  }, 'runMutable');",
    );
  });
});
