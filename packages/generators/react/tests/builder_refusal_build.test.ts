import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  builderExpansionRaw,
  builderRefusalRaw,
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  typecheckEmitted,
} from './support.js';

// Plan Phase D1 — a builder the frontend cannot expand into `ui.List` is refused, never rendered as an empty
// list.
//
// The defect (found by M11-H as "a block-bodied `itemBuilder` emits `<ListView />`" — the attribution was
// wrong: `{ return Text(_items[i]); }` expands fine, `(c, i) => Text('$i')` does not, and the difference is
// whether the index walks one collection, not the form of the body): an unexpanded `ListView.builder`
// reaches the generator as an ordinary element carrying its closure as a prop. The refusal that should have
// caught it — a constructor-qualified entry in `MISSING_CAPABILITIES` — was never consulted, because the
// lookup ran only for a widget with no mapping, and `ListView` has one. The closure was then dropped as an
// "unmapped prop", a *warning*, and the build succeeded with `<ListView />`.
//
// Real analyzer output in, real `bridge normalize`, real generator. `builder_refusal` is one component per
// shape the M4-H expansion proof rejects; `builder_expansion` is the positive control, so the refusal is not
// over-broad.

afterAll(cleanupBuildProofTemporaries);

const refuse = () => {
  const { context, reported } = harness(compiledFrom(builderRefusalRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files, refusals: reported.filter((d) => d.code === 'BRG3010' || d.message.includes('needs')) };
};

describe('an unexpanded builder is refused, not rendered empty', () => {
  it('emits an error for every unexpanded builder shape, and no files', () => {
    const { reported, files } = refuse();
    const capabilityErrors = reported.filter(
      (d) => d.severity === 'error' && /needs a builder over an index range|needs a separator between items/.test(d.message),
    );
    // 5 ListView.builder/GridView.builder shapes + 1 ListView.separated.
    expect(capabilityErrors).toHaveLength(6);
    expect(files).toEqual([]);
  });

  it('names each constructor precisely', () => {
    const messages = refuse().reported.filter((d) => d.severity === 'error').map((d) => d.message);
    expect(messages.filter((m) => m.startsWith('`ListView.builder`'))).toHaveLength(4);
    expect(messages.filter((m) => m.startsWith('`GridView.builder`'))).toHaveLength(1);
    expect(messages.filter((m) => m.startsWith('`ListView.separated`'))).toHaveLength(1);
  });

  it('tells the author what to do instead', () => {
    const message = refuse().reported.find((d) => d.message.startsWith('`ListView.builder`'))?.message ?? '';
    expect(message).toContain('indexes `items`');
    expect(message).toContain('a placeholder would be an application that looks nearly right and is wrong');
  });

  it('never falls through to the "dropped prop" warning that hid the loss', () => {
    const dropped = refuse().reported.filter((d) => /has no equivalent on the runtime/.test(d.message));
    expect(dropped.filter((d) => /itemBuilder|itemCount|separatorBuilder/.test(d.message))).toEqual([]);
  });
});

describe('a builder that expands is unaffected (positive control)', () => {
  const expanded = () => {
    const { context, reported } = harness(compiledFrom(builderExpansionRaw()));
    const { files } = reactGenerator.generate(context);
    return { reported, files };
  };

  it('emits no error and no dropped-prop warning', () => {
    const { reported, files } = expanded();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.filter((d) => /has no equivalent on the runtime/.test(d.message))).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('renders the items, expression- and block-bodied alike', () => {
    const { files } = expanded();
    for (const path of ['expression-indexed', 'block-indexed', 'grid-indexed']) {
      const source = fileAt(files, `src/components/${path}.tsx`) ?? '';
      expect(source, path).toMatch(/\.map\(/);
    }
  });

  it('keeps the container: an expanded builder is still a ListView / GridView, not a bare array', () => {
    const { files } = expanded();
    expect(fileAt(files, 'src/components/expression-indexed.tsx')).toMatch(/<ListView>\s*\{_items\$\.map\(/);
    expect(fileAt(files, 'src/components/grid-indexed.tsx')).toMatch(/<GridView[^>]*>\s*\{_items\$\.map\(/);
  });

  it('keeps the container’s props — direction, padding, shrinkWrap, reverse are not silently dropped', () => {
    const source = fileAt(expanded().files, 'src/components/props-preserved.tsx') ?? '';
    expect(source).toContain('scrollDirection={Axis.horizontal}');
    expect(source).toContain('padding={EdgeInsets.all(16)}');
    expect(source).toContain('shrinkWrap={true}');
    expect(source).toContain('reverse={true}');
  });

  it('a list in a slot is valid TSX — `child={<ListView>…}`, never `child={{…}}`', () => {
    const { files } = expanded();
    const source = fileAt(files, 'src/components/expression-indexed.tsx') ?? '';
    expect(source).toMatch(/child=\{<ListView>/);
    expect(source).not.toContain('{{');
  });

  it('real `tsc --strict` accepts the generated output', () => {
    typecheckEmitted(expanded().files);
  }, 120_000);
});
