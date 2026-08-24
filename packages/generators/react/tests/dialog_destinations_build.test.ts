import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, dialogDestinationsRaw, fileAt, harness, typecheckEmitted } from './support.js';

// The M9-D build-proof — a `showDialog(builder: (_) => AlertDialog(...))` push, previously refused
// outright (BRG3013, no destination this generator could resolve), now lowers to a real dialog: a
// `useRef<DialogHostHandle>` declared once per component, a `DialogHost` rendered as a sibling of the
// component's own tree, and the push itself lowered to `dialogRef.current?.show()` rather than a router
// call. Two independent `showDialog` call sites in one component are proven not to collide (`dialogRef0`/
// `dialogRef1`), and a component whose only navigation opens a dialog is proven to declare no unused
// `router` local at all.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(dialogDestinationsRaw());

describe('M9-D build-proof: inline route-overlay destinations, real analyzer to real tsc', () => {
  it('the generator reports no error — both showDialog pushes resolve', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3013')).toBe(false);
  });

  it('declares one ref per inline destination and renders each DialogHost as a sibling of the tree', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('const dialogRef0 = useRef<DialogHostHandle>(null);');
    expect(source).toContain('const dialogRef1 = useRef<DialogHostHandle>(null);');
    expect(source).toContain('<DialogHost ref={dialogRef0}>');
    expect(source).toContain('<DialogHost ref={dialogRef1}>');
  });

  it('a push to an inline destination shows the dialog rather than calling a router', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('dialogRef0.current?.show();');
    expect(source).toContain('dialogRef1.current?.show();');
  });

  it('a component whose only navigation opens a dialog declares no router at all', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).not.toContain('useRouter');
    expect(source).not.toMatch(/\brouter\b/);
  });

  it("each AlertDialog's title/content render in their own slots", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain("<AlertDialog content={<Text>{'This cannot be undone.'}</Text>} title={<Text>{'Delete item?'}</Text>} />");
    expect(source).toContain("<AlertDialog content={<Text>{'You can sign back in at any time.'}</Text>} title={<Text>{'Sign out?'}</Text>} />");
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
