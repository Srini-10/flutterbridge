import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, dialogDestinationsRaw, fileAt, harness, typecheckEmitted } from './support.js';

// The M9-D/M9-E build-proof.
//
// M9-D: a `showDialog(builder: (_) => AlertDialog(...))` push, previously refused outright (BRG3013, no
// destination this generator could resolve), lowers to a real dialog: a `useRef<DialogHostHandle>`
// declared once per component, a `DialogHost` rendered as a sibling of the component's own tree, and the
// push itself lowered to `dialogRef.current?.show()` rather than a router call. Two independent
// `showDialog` call sites in one component are proven not to collide (`dialogRef0`/`dialogRef1`).
//
// M9-E (extends this same fixture, `0025-amendment-dialog-dismissal-scope.md`): each dialog's own
// `actions:` now has one `TextButton` whose `onPressed` calls `Navigator.pop(...)` — one using the
// dialog's own builder parameter, the other deliberately using the *outer* page context — proving
// dismissal is structural (extraction-scope-based), never identity- or name-based. Both lower to
// `dialogRef{n}.current?.close()`. A component whose only navigation opens and dismisses dialogs (never
// pushes/pops a page) is proven to declare no unused `router` local at all, extended from M9-D's own
// push-only version of the same claim.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(dialogDestinationsRaw());

describe('M9-D/M9-E build-proof: inline route-overlay destinations and dialog-local dismissal, real analyzer to real tsc', () => {
  it('the generator reports no error — both showDialog pushes and both dismissals resolve', () => {
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

  it('a pop proved to dismiss a dialog closes that same ref, regardless of which BuildContext was written (M9-E)', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    // dialogRef0's own action uses the builder's own `dialogContext` parameter.
    expect(source).toContain('dialogRef0.current?.close();');
    // dialogRef1's own action deliberately uses the *outer* page context instead — same lowering.
    expect(source).toContain('dialogRef1.current?.close();');
    // Never a router pop for either — both are proven dialog-local, not page-level.
    expect(source).not.toContain('.pop()');
  });

  it('a component whose only navigation opens and dismisses dialogs declares no router at all', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).not.toContain('useRouter');
    expect(source).not.toMatch(/\brouter\b/);
  });

  it("each AlertDialog's title/content render in their own slots, and its own action renders as an ordinary child", () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain("<AlertDialog content={<Text>{'This cannot be undone.'}</Text>} title={<Text>{'Delete item?'}</Text>}>");
    expect(source).toContain("<AlertDialog content={<Text>{'You can sign back in at any time.'}</Text>} title={<Text>{'Sign out?'}</Text>}>");
    expect(source).toContain("child={<Text>{'Cancel'}</Text>}");
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
