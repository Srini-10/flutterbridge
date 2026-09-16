import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, fileAt, harness, projectWidgetCompositionRaw, typecheckEmitted } from './support.js';

// M11-E positive proof (ADR-0047) — real analyzer, real `bridge normalize`, real generator: a
// project-defined widget composed as a CHILD of another widget's own render tree
// (`Scaffold(body: ChildWidget())`) resolves to a real, declaration-tier `target` and renders as an
// ordinary imported React component reference — never `BRG3001`.
//
// Before this milestone, `component.ts`'s own `emitElement` reconstructed an anchor string from
// `ui.Element.component.library` alone (`` `${library}#${name}` ``) and looked it up against
// `componentModules` — which is keyed by `ui.Component.anchor`, whose own file segment is
// project-relative (`lib/main.dart#ChildWidget`) for a component the ANALYZED PROJECT itself declares,
// and a `package:` URI only for one declared in a local path dependency. `component.library` is always
// a package URI, so the reconstruction only ever matched the dependency case (M8-F's own
// `cross_package_app` fixture) and silently missed the far more common same-project case. `WidgetRef`
// now carries a `target: NodeId`, resolved at extraction time by the identical `componentSymbolOf`
// mechanism `app.Route`/`app.RouteTransition` targets already use (`route_extractor.dart`,
// `transition_extractor.dart`) — declaration provenance, not string reconstruction, matching every
// other cross-file reference in this compiler (ADR-0033, ADR-0034).
//
// R5 (two DIFFERENT project classes with the SAME NAME, in different files) is deliberately NOT
// exercised positively here — composing them is legal Dart, but this generator has no second name to
// give the colliding output file, and correctly refuses (`BRG3009`, a real, separate bug this
// milestone's own R5 rung found) — see `m11e_project_widget_name_collision_build.test.ts`.
describe('M11-E: a project widget composed as a child resolves by declaration identity (ADR-0047), real analyzer', () => {
  it('produces no BRG1310 — the source itself is valid Dart', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.some((d) => d.code === 'BRG1310')).toBe(false);
  });

  it('emits no error — every composed reference here resolves', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context, reported } = harness(normalized);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('real `tsc --strict` accepts the generated output', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);

  // R2/R3 — a direct child, nested one level inside a Column.
  it('a direct child composition imports and renders the referenced component', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain("import { ChildWidget } from '@/components/child-widget';");
    expect(home).toMatch(/<ChildWidget label=\{'direct'\} \/>/);
  });

  // R4 — cross-file: `ChildWidget` is declared in its own file, composed from `main.dart`.
  it('a cross-file reference resolves to the declaring file, not the referring one', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const child = fileAt(files, 'src/components/child-widget.tsx') ?? '';
    expect(child).toContain('export function ChildWidget(props: ChildWidgetProps)');
  });

  // R9 — a repeated reference, including through an import alias, resolves to the SAME target and a
  // single, deduplicated import.
  it('repeated references (including through an import alias) share one import', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    const importLines = home.split('\n').filter((line) => line.includes("from '@/components/child-widget'"));
    expect(importLines).toHaveLength(1);
    expect(home).toMatch(/<ChildWidget label=\{'direct'\} \/>[\s\S]*<ChildWidget label=\{'again'\} \/>[\s\S]*<ChildWidget label=\{'aliased'\} \/>/);
  });

  // R5 — two DIFFERENT classes (never sharing a name here), declared in different files, composed
  // side by side. Each resolves to its own file.
  it('two different widgets from different files each resolve to their own file', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const labelA = fileAt(files, 'src/components/label-a.tsx') ?? '';
    const labelB = fileAt(files, 'src/components/label-b.tsx') ?? '';
    expect(labelA).toContain("'label a'");
    expect(labelB).toContain("'label b'");
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain("import { LabelA } from '@/components/label-a';");
    expect(home).toContain("import { LabelB } from '@/components/label-b';");
  });

  // Negative control — a framework widget (`Scaffold`, `Column`) is unaffected: still resolved through
  // the existing catalog, never through `target`.
  it('a framework widget reference is unaffected — no target, resolved through the catalog', () => {
    const normalized = compiledFrom(projectWidgetCompositionRaw());
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain("import { Column, Scaffold } from '@bridge/runtime-react';");
  });
});
