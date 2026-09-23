import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  riverpodAsyncValueWidgetPositionRaw,
  riverpodAsyncValueWidgetWhenUnsupportedRaw,
  typecheckEmitted,
} from './support.js';

// The `AsyncValue.when(loading:, error:, data:)` placed *directly* as widget-tree content build-proof —
// App B's own dominant real `BRG3004` shape ("widget returned by a call", 106 of 252 real occurrences —
// the single largest sub-category; `docs/m14/riverpod-usage-matrix.md` §4j) — real analyzer output in, real
// `bridge normalize`, real generator, real `tsc --strict` against the real kit.
//
// **This was originally out of scope, named and left unfixed**: `docs/m14/riverpod-usage-matrix.md` §4d
// said closing it "needs a new render-tree construct (conceptually `ui.Cond` keyed on three states instead
// of a boolean) — a real UIR addition, and so an ADR, not a generator fix." That conclusion turned out to
// be half right: a real UIR addition, but not a *new* one. `ui.Async` — "the normalized form of
// `FutureBuilder`" (`l2.json`) — already has exactly this shape: `source`, `loading`, `error`, `data`. It
// was built for `FutureBuilder`/`StreamBuilder`, whose own three branches live inside *one* shared closure
// body (`if (snapshot.hasData) …`) that N4 has to recover them from — a normalization, "partial by design,"
// which is why `component.ts`'s own `ui.Async` case unconditionally refused: nothing had ever populated
// `loading`/`error` at extraction time, only `source`/`data`.
//
// `AsyncValue.when(...)` needs no such recovery. Dart's own syntax already separates the three branches as
// three distinct, named closures — `widget_extractor.dart`'s own `_asyncValueWhen` (recognized structurally,
// by the receiver's own resolved type being `AsyncValue<T>` from `package:riverpod/src/common.dart`, the
// identical library `package_kit.ts`'s own non-widget-position registration already uses — never by name)
// populates `loading`/`error`/`data` directly, the same way `_async` already populates `data` alone for
// `FutureBuilder`. `component.ts`'s own `ui.Async` case now renders when all three are present — calling
// the runtime's own, already oracle-verified `AsyncValue.when(...)` method, each branch now producing JSX
// instead of an arbitrary value — and keeps refusing, exactly as before, when they are not (a
// `FutureBuilder`/`StreamBuilder` node whose branches N4 never recovered).
//
// Two schema fields were added to carry this, not a new node kind: `errorParam`/`stackTraceParam` — the
// error callback's own two parameter names (`error: R Function(Object error, StackTrace stackTrace)` is a
// *required*, exactly-two-positional-parameter function type, so real code assigning a closure to it always
// names both) — the identical role `dataParam` already had for the data callback's own single parameter.
//
// `fixtures/apps/riverpod_async_value_widget_position` was the milestone's own original *negative* fixture
// for this exact gap; it is a *positive* one now (its own `pubspec.yaml` has the full account). Real App B's
// own shapes are not all this simple, though: many branches read through a `final` local or perform a side
// effect first. `_asyncValueWhen` extracts each branch through the identical `_widgetOfBody`
// `FutureBuilder`'s own `data` branch already goes through. When this phase landed that only inlined a block
// of *exactly one* statement; a later phase made it accept leading `final` locals before the `return`
// (`builder_body_locals_build.test.ts`), so a branch that reads through a local now works too. A branch that
// performs a *side effect* first — `error: (e, _) { debugPrint(...); return Widget(...); }` — still refuses,
// precisely and narrowly (`fixtures/apps/riverpod_async_value_widget_when_unsupported`, the paired negative
// fixture here): a statement with no representation in a `ui.*` node, and dropping it would drop the side
// effect. Unlike before this fix, the refusal names the *one* affected branch, not the whole `.when(...)` call.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodAsyncValueWidgetPositionRaw());

describe('M14 build-proof: `AsyncValue.when(...)` placed directly as widget-tree content, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('lowers to a call on the runtime\'s own `.when(...)` method, each branch now producing real JSX', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain(
      'body={w$0.when({ data: (items) => <Center child={<Text>{`items: ${items.length}`}</Text>} />, ' +
        'error: (e, st) => <Center child={<Text>{`error: ${e}`}</Text>} />, ' +
        'loading: () => <Center child={<CircularProgressIndicator />} /> })}',
    );
  });

  it('`ref.watch` producing the `AsyncValue` still hoists to `useWatch` at the top of the component, unaffected by where its result is consumed', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toContain('const w$0 = useWatch(itemsProvider);');
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});

describe('negative fixture: a block-bodied branch with a side-effect statement still refuses precisely, narrowly, not silently', () => {
  it('reports BRG3004 ("builder body with statements") on the one affected branch, not "widget returned by a call" on the whole `.when(...)` call', () => {
    const unsupported = compiledFrom(riverpodAsyncValueWidgetWhenUnsupportedRaw());
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    const opaque = errors.filter((d) => d.code === 'BRG3004');
    expect(opaque).toHaveLength(1);
    expect(opaque[0]?.message).toContain('builder body with statements');
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3004', 'BRG3005']);
    expect(files).toHaveLength(0);
  });
});
