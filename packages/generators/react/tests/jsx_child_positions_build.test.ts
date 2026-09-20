import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  jsxChildPositionsRaw,
  typecheckEmitted,
} from './support.js';

// An emitted UI node is an *expression*; only a JSX child position wraps it in braces (`jsxChild`).
//
// Two defects shared one cause. `ui.List` returned its child-position spelling (`{…}`), so a list in a slot,
// a conditional branch or a root was `child={{…}}` — not valid TSX. And `ui.Cond` returned a bare ternary,
// which is right as a slot value and wrong between an element's tags, where it is JSX *text*:
//
//     <Column>
//       _flag$ ? <Text>{'shown'}</Text> : null      ← renders literally; tsc accepts it
//
// The second one is the worse, because nothing downstream complains — the build succeeds and the page shows
// the source of a conditional. So the assertion here is on the emitted text, not on `tsc`.

afterAll(cleanupBuildProofTemporaries);

const emit = () => {
  const { context, reported } = harness(compiledFrom(jsxChildPositionsRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files };
};

describe('a collection-if is a braced JSX child, never bare text between the tags', () => {
  it('emits `{cond ? <Text/> : null}` between the Column’s tags', () => {
    const source = fileAt(emit().files, 'src/components/conditional-child.tsx') ?? '';
    expect(source).toMatch(/\{_flag\$ \? <Text>\{'shown'\}<\/Text> : null\}/);
  });

  it('never leaves a ternary as JSX text', () => {
    for (const path of ['conditional-child', 'conditional-list']) {
      const source = fileAt(emit().files, `src/components/${path}.tsx`) ?? '';
      // A line that *starts* with the condition (not with `<` or `{`) is text between tags.
      expect(source.split('\n').filter((line) => /^\s+\w+\$ \?/.test(line)), path).toEqual([]);
    }
  });

  it('a list inside a conditional branch is valid: the branch is an element holding the list', () => {
    const source = fileAt(emit().files, 'src/components/conditional-list.tsx') ?? '';
    expect(source).toMatch(/\{\w+\$ \? <SizedBox/);
    expect(source).not.toContain('{{');
  });

  it('emits no error and real `tsc --strict` accepts it', () => {
    const { reported, files } = emit();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
