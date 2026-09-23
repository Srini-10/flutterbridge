import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  builderBodyLocalsRaw,
  builderBodyLocalsUnsupportedRaw,
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  typecheckEmitted,
} from './support.js';

// The statement-bodied builder build-proof — "N leading local declarations, then one `return`" — real
// analyzer output in, real `bridge normalize`, real generator, real `tsc --strict` against the real kit.
//
// App B's own `BRG3004` "builder body with statements" (18 of 252 real occurrences before this change, 54
// after the AsyncValue.when change reached more of them — `docs/m14/riverpod-usage-matrix.md` §4k) came
// from one function, `_widgetOfBody`, which inlined a block body only when it was *exactly one* `return`.
// The dominant real block shape is `final p = products[i]; return ProductCard(product: p);`.
//
// The representation already exists — no new UIR node, no schema change, no generator change:
// `Binding.inlineValue` (M8-B) binds a name to its initializer and re-extracts it lazily at every read
// site, which is what `_inlineHelper` has always done for a *method's* block body. It is sound for the same
// reason it is there: Flutter's `build` must be pure, so an initializer read twice may be evaluated twice.
// `_bindLeadingLocalsAndReturn` is the one shared implementation `_inlineHelper` and `_widgetOfBody` now both
// use, so the shape is accepted in exactly one place.
//
// The one thing inlining could do silently that the old refusal never did: an **unread** local has no read
// site to re-extract at, so its initializer — `final unused = ref.watch(p);` — would simply vanish along
// with its side effect (a provider subscription). `_bindLeadingLocalsAndReturn` therefore refuses a block
// in which any local is never read (by resolved `Element`, not name — a shadowing parameter of the same name
// does not count as a read), so the loss is a precise `BRG3004`, not a dropped subscription.
//
// `fixtures/apps/builder_body_locals_unsupported` is the paired negative fixture: an unread local, an `if`
// deciding the return, a side-effect statement, a local function declaration — four distinct shapes, four
// precise `BRG3004`s, no files.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(builderBodyLocalsRaw());

function generated() {
  const { context, reported } = harness(normalized);
  const { files } = reactGenerator.generate(context);
  return { files, reported, home: fileAt(files, 'src/components/home-screen.tsx') ?? '' };
}

describe('statement-bodied builder, real analyzer to real tsc', () => {
  it('generates with no error at all — every one of the four builder bodies was reached', () => {
    const { files, reported } = generated();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('a local read once: the initializer lands where the local was read, and the `Builder` wrapper is erased', () => {
    const { home } = generated();
    expect(home).toContain("<Text>{'hello'}</Text>");
    expect(home).not.toContain('Builder');
    expect(home).not.toContain('greeting');
  });

  it('a local read twice: both reads are emitted, neither collapsed to one', () => {
    const { home } = generated();
    expect(home.match(/<Text>\{'twice'\}<\/Text>/g)).toHaveLength(2);
  });

  it('a chain — the second local\'s own initializer reads the first — resolves through both', () => {
    const { home } = generated();
    expect(home).toContain("<Text>{'chain'.toUpperCase()}</Text>");
  });

  it("an `itemBuilder` reading its item through a local (App B's `final p = products[i];`) keeps the proven `C[i]` template", () => {
    const { home } = generated();
    expect(home).toContain('props.items.map((item, i) => <Fragment key={i}><ListTile title={<Text>{props.items[i]}</Text>} /></Fragment>)');
  });

  it('statement order is preserved in the emitted tree — the four builders appear in source order', () => {
    const { home } = generated();
    const at = ["'hello'", "'twice'", "'chain'", 'props.items.map'].map((needle) => home.indexOf(needle));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('is deterministic — two generations are byte-identical', () => {
    const a = generated().files.map((f) => `${f.path}\n${f.contents}`);
    const b = generated().files.map((f) => `${f.path}\n${f.contents}`);
    expect(a).toEqual(b);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    typecheckEmitted(generated().files);
  }, 120_000);
});

describe('negative fixture: the shapes a block body still cannot be inlined from, each precisely, none silently', () => {
  const unsupported = compiledFrom(builderBodyLocalsUnsupportedRaw());
  const run = () => {
    const { context, reported } = harness(unsupported);
    const { files } = reactGenerator.generate(context);
    return { files, errors: reported.filter((d) => d.severity === 'error') };
  };

  it('emits exactly four BRG3004 — one per unsupported body — all naming "builder body with statements"', () => {
    const { errors } = run();
    const opaque = errors.filter((d) => d.code === 'BRG3004');
    expect(opaque).toHaveLength(4);
    for (const d of opaque) expect(d.message).toContain('builder body with statements');
  });

  it('each of the four distinct shapes is the one reported', () => {
    const messages = run().errors.filter((d) => d.code === 'BRG3004').map((d) => d.message);
    expect(messages.some((m) => m.includes("final unused = 'dropped'"))).toBe(true);
    expect(messages.some((m) => m.includes('if (flag)'))).toBe(true);
    expect(messages.some((m) => m.includes("debugPrint('building')"))).toBe(true);
    expect(messages.some((m) => m.includes('String shout(String s)'))).toBe(true);
  });

  it('no partial project — the whole-program gate fires and nothing is emitted', () => {
    const { files, errors } = run();
    expect(errors.map((d) => d.code).sort()).toEqual(['BRG3004', 'BRG3004', 'BRG3004', 'BRG3004', 'BRG3005']);
    expect(files).toHaveLength(0);
  });
});
