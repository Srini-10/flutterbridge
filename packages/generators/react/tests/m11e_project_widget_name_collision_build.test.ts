import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness, projectWidgetNameCollisionRaw } from './support.js';

// M11-E negative proof — real analyzer, real `bridge normalize`, real generator: two DIFFERENT
// project-defined widget classes that happen to share a class name (declared in different files —
// legal Dart; nothing requires class names to be unique across files) refuse honestly as `BRG3009`
// rather than silently colliding on the same output file (`src/components/<name>.tsx`).
//
// Found while building `m11e_project_widget_composition_build.test.ts`'s own R5 rung (ADR-0047): before
// the guard, `fileNameOf` keyed purely on the class name, so whichever component's own file write
// happened last silently overwrote the other — BOTH source references still typechecked and still
// rendered *something*, just not the something either one of them named. Not `BRG3001` (that is "no
// mapping exists at all") and not a declaration-identity gap (extraction already resolves each
// `Label`'s own `target` correctly and distinctly) — this is the one place a `ui.Component`'s own
// emitted identity (file path plus exported name) is decided, and it had no collision guard at all.
describe('M11-E: two project widgets sharing a class name across files refuse as BRG3009, real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(projectWidgetNameCollisionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('refuses with BRG3009, naming the colliding path — never a silent overwrite', () => {
    const normalized = compiledFrom(projectWidgetNameCollisionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'BRG3009' && d.message.includes('src/components/label.tsx'))).toBe(true);
    // No partial output — the generator's own all-or-nothing emission policy (`BRG3005`).
    expect(files).toEqual([]);
  });
});
