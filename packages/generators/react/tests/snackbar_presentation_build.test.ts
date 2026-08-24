import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, snackbarPresentationRaw, typecheckEmitted } from './support.js';

// The M9-G build-proof (ADR-0030) — `ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))`,
// previously refused outright (BRG3013, "a messenger overlay... no ADR models it yet"), lowers to the
// runtime kit's own `SnackbarHostProvider`/`useSnackbarHost()`.
//
// Recognized by resolved type only (the receiver's own `ScaffoldMessengerState`, from
// `package:flutter/src/material/scaffold.dart` in the real, installed SDK — not the more guessable
// `package:flutter/widgets.dart` an earlier investigation pass assumed from a hand-written stand-in),
// never by name. `SnackBar.content` is real, catalog-extracted `ui.Text`, embedded as `presentedContent`
// (a real `ui.Element`) rather than the generic, unrendered `logic.New` every other constructor argument
// gets — the one gap that genuinely needed analyzer-side work (ADR-0030 §7). `duration`/`action` reuse
// the ordinary, already-working expression/lambda lowering unmodified. A messenger reached through one
// level of local-variable indirection resolves to the same host, using that variable's own local name —
// never a dead, unread alias. `hideCurrentSnackBar`/`removeCurrentSnackBar`/`clearSnackBars` all lower to
// the host's own queue operations.
//
// Real analyzer output in, real `bridge normalize` (N1–N11, unmodified), real generator, real `tsc`
// against the real, unmocked `@bridge/runtime-react` — no hand-authored UIR anywhere, matching every
// other build-proof in this suite.

afterAll(cleanupBuildProofTemporaries);

const after = compiledFrom(snackbarPresentationRaw());

describe('M9-G build-proof: ScaffoldMessenger/SnackBar presentation (ADR-0030), real analyzer to real tsc', () => {
  it('the generator reports no error — every recognized call resolves', () => {
    const { context, reported } = harness(after);
    reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.some((d) => d.code === 'BRG3013')).toBe(false);
  });

  it('hoists one useSnackbarHost() and declares SnackbarHostProvider at the application root', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const component = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(component).toContain('const snackbarHost = useSnackbarHost();');
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toContain('<SnackbarHostProvider>');
    expect(providers).toContain('</SnackbarHostProvider>');
    // Nested inside ThemeProvider (SnackbarView reads the theme), outside nothing else depends on it.
    expect(providers.indexOf('<ThemeProvider')).toBeLessThan(providers.indexOf('<SnackbarHostProvider>'));
  });

  it('a direct call presents real widget content, never the generic unrendered constructor', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain("snackbarHost.show(<Text>{'Saved'}</Text>);");
    expect(source).not.toContain('SnackBar(');
  });

  it('variable content reads the live signal, not a stale captured value', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('snackbarHost.show(<Text>{signal_335ea397.get()}</Text>);');
  });

  it('duration reuses the existing Duration representation, and the action auto-dismisses with no explicit call', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('duration: new Duration({ seconds: 2 })');
    // The action's own callback body is exactly the `setState` write Flutter's source wrote — nothing
    // here calls anything to dismiss the snack bar; the host does that automatically (ADR-0030 §11).
    expect(source).toContain(
      "action: { label: 'Undo', onPress: () => {\n  _undoCount.set((_undoCount.get() + 1));\n} }",
    );
  });

  it('a messenger reached through one local-variable indirection resolves to that variable, never a dead alias', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('const messenger = snackbarHost;');
    expect(source).toContain("messenger.show(<Text>{'Via a local reference'}</Text>);");
  });

  it('hideCurrentSnackBar/removeCurrentSnackBar/clearSnackBars lower to the host’s own queue operations', () => {
    const { context } = harness(after);
    const { files } = reactGenerator.generate(context);
    const source = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(source).toContain('snackbarHost.hide();');
    expect(source).toContain('snackbarHost.remove();');
    expect(source).toContain('snackbarHost.clear();');
  });

  it('Flutter → analyzer → compiler (N1–N11, unmodified) → generator → tsc', () => {
    const { context, reported } = harness(after);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(files);
  }, 120_000);
});
