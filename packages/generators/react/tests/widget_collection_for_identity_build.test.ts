import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  typecheckEmitted,
  widgetCollectionForIdentityRaw,
} from './support.js';

// The M9-F build-proof — a widget-tree collection-for's own declared item (`for (final item in items)
// Widget(item)`) now carries the same declaration-tier identity a statement-level for-in loop's own
// variable already has (M9-A): `ui.List.itemDecl`, a real `logic.VarDecl`, and `bind.Param.target`
// resolving to it.
//
// Also proves a real, pre-existing, independently-discovered generator defect stays fixed: before this
// milestone, `bind.Param` unconditionally emitted `props.${name}` — correct for an ordinary widget/
// component constructor parameter, silently wrong for a collection-for item, whose own component takes no
// such prop at all (`<Text>{props.item}</Text>`, referencing a name that does not exist). `target` is what
// lets the generator tell the two apart without guessing.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every other
// build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(widgetCollectionForIdentityRaw());

describe('M9-F build-proof: widget-tree collection-for item declaration identity, real analyzer to real tsc', () => {
  it('the generator reports no error', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('a repeated read of the same item resolves to the local .map() parameter, never props', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('.map((item, index) =>');
    expect(source).toContain('<Text>{`Item: ${item}`}</Text>');
    expect(source).toContain('<Text>{item}</Text>');
    // The pre-existing defect this milestone found and fixed: never `props.item`.
    expect(source).not.toContain('props.item');
  });

  it('an inline callback (closure capture) reads the same per-iteration item as the template', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('_selected.set(item);');
  });

  it('a nested collection-for with the same variable name shadows correctly — no generator-level disambiguation needed', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    // The outer and inner `.map()` calls each have their own JavaScript function scope, so ordinary
    // lexical shadowing already gives the correct answer with the identical source spelling.
    expect(source).toContain('item.map((item, index) => <Fragment key={index}><Text>{item}</Text></Fragment>)');
  });

  it('two sibling collection-fors with the same variable name never collide in the generated output', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('<Text>{`sibling-a ${item}`}</Text>');
    expect(source).toContain('<Text>{`sibling-b ${item}`}</Text>');
  });

  it("an inner template reads its own item AND the outer loop's own item correctly — not a global current-item binding", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('group.map((entry, index) =>');
    expect(source).toContain('<Text>{`${group}: ${entry}`}</Text>');
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
