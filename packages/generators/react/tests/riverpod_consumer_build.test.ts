import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  riverpodConsumerRaw,
  riverpodConsumerUnsupportedBodyRaw,
  typecheckEmitted,
} from './support.js';

// The M14 `Consumer(builder: (context, ref, child) => …)` build-proof — real analyzer output in, real
// `bridge normalize`, real generator, real `tsc --strict` against the real kit, matching this phase's own
// discipline.
//
// Real-corpus inventory, done before any implementation: exactly 5 `Consumer` declarations in all of App A
// + App B combined, all App B, all the identical shape — a plain `StatelessWidget` (never
// `ConsumerWidget`/`ConsumerState`, which is the whole point of using `Consumer`) with the wrapper directly
// in its own render tree or reached from an item-builder callback, the `child` parameter always discarded,
// no site anywhere passing an explicit `child:` argument to `Consumer` itself.
//
// The architecture: `Consumer` is a **rebuild-scoping wrapper** — INV-22's own text names it explicitly
// alongside `setState`/`context.watch` (docs/m4/m4i-widget-surface-and-packages.md §3) — so it is erased,
// not rendered, by the same mechanism `Builder`/`ListenableBuilder`/`ValueListenableBuilder` already use
// (`catalog/widgets/material.json`'s `rebuildBuilders`, `widget_extractor.dart`'s `_inlineRebuildBuilder`):
// one new catalog row (`"Consumer": { "builderProp": "builder" }`, no `valueProp` — `ref` is not bound from
// an outer listenable the way `ValueListenableBuilder`'s `value` is). Once erased, the builder's own `ref`
// parameter is an ordinary `WidgetRef`-typed local — `expression.ts`'s own `ref`-resolution
// (`name === 'ref' && isWidgetRefType(...)`) and `component.ts`'s own watch/listen hoisting
// (`declareRiverpodWatches`/`declareRiverpodListens`, `collectRiverpodRefCalls`) are both already
// structural (keyed on the value's own resolved type, never on which class declared it), so a `Consumer`
// used by a *plain* `StatelessWidget` — one with no `ref` of its own — is picked up by exactly the same,
// unchanged code a `ConsumerWidget.build`'s own `ref` parameter already uses. No new generator or runtime
// code beyond the one catalog row.
//
// `fixtures/apps/riverpod_consumer_unsupported_body` is the paired **negative** fixture, proving the two
// ways a real `Consumer` site still fails today, each with its own precise diagnostic:
//
// 1. `_widgetOfBody`'s own `BlockFunctionBody` case only inlines a block of *exactly one* statement (a
//    bare `return`) — App B's own dominant real shape (every one of its 5 sites reads a `final` local,
//    usually `.valueOrNull` off an `AsyncValue`, before returning) has a second statement, so the whole
//    body stays `ui.Opaque('builder body with statements')` (`BRG3004`). A pre-existing, general
//    limitation shared identically by `Builder`/`ListenableBuilder`/`ValueListenableBuilder`'s own inlined
//    bodies and by `ListView.builder`/`GridView.builder`'s own `itemBuilder`
//    (`fixtures/apps/builder_expansion`'s own `BlockIndexed` is the single-statement case that *does*
//    work) — not introduced by this milestone's own `Consumer` work, and not something it is scoped to
//    close.
// 2. `search_page.dart`'s own `_Results` shape: `Consumer` reached only from inside a `GridView.builder`'s
//    own `itemBuilder` — a position a hook cannot run from unconditionally, refused by
//    `declareRiverpodWatches` (ADR-0048) exactly as a bare `ref.watch` in the same position already is
//    (`BRG3013`).
//
// Both are named, real, and precise — neither is a silent drop, and neither is Riverpod-specific.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodConsumerRaw());

describe('M14 build-proof: `Consumer(builder: ...)`, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('the `Consumer` wrapper is fully erased — no trace of it anywhere in the emitted component', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    const footer = fileAt(files, 'src/components/footer.tsx') ?? '';
    expect(home).not.toContain('Consumer');
    expect(footer).not.toContain('Consumer');
  });

  it("`ref.watch` inside a plain `StatelessWidget`'s inlined `Consumer` hoists to `useWatch` at the top of that component, exactly as a `ConsumerWidget`'s own `ref` would", () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const home = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(home).toMatch(/const ref = useProviderContainer\(\);\s*\n\s*const w\$0 = useWatch\(countProvider\);/);
    expect(home).toContain('<Text>{`${w$0}`}</Text>');
  });

  it('a second, independent `Consumer` site in a different plain `StatelessWidget` gets its own hoisted watch — not only the first one reached', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const footer = fileAt(files, 'src/components/footer.tsx') ?? '';
    expect(footer).toMatch(/const ref = useProviderContainer\(\);\s*\n\s*const w\$0 = useWatch\(countProvider\);/);
    expect(footer).toContain('return <Text>{`footer ${w$0}`}</Text>;');
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  }, 120_000);
});

describe('negative fixture: the two ways a real `Consumer` site still fails, each precisely, neither silently', () => {
  it('a block body with a `final` local before its `return` (App B\'s own dominant real shape) stays opaque — BRG3004, "builder body with statements"', () => {
    const unsupported = compiledFrom(riverpodConsumerUnsupportedBodyRaw());
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    const opaque = errors.filter((d) => d.code === 'BRG3004');
    expect(opaque).toHaveLength(1);
    expect(opaque[0]?.message).toContain('builder body with statements');
    expect(files).toHaveLength(0);
  });

  it('`Consumer` reached only from a `GridView.builder`\'s own `itemBuilder` refuses its `ref.watch` — BRG3013, the same hoisting refusal a bare `ref.watch` there already gets', () => {
    const unsupported = compiledFrom(riverpodConsumerUnsupportedBodyRaw());
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    const hoistRefusal = errors.filter((d) => d.code === 'BRG3013' && d.message.includes('list item template'));
    expect(hoistRefusal).toHaveLength(1);
    expect(files).toHaveLength(0);
  });

  it('both refusals fire together, precisely — no third, unrelated construct silently failed alongside them', () => {
    const unsupported = compiledFrom(riverpodConsumerUnsupportedBodyRaw());
    const { context, reported } = harness(unsupported);
    reactGenerator.generate(context);
    const errors = reported.filter((d) => d.severity === 'error');
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3004', 'BRG3005', 'BRG3013']);
  });
});
