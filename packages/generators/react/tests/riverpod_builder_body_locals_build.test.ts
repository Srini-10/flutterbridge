import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  riverpodBuilderBodyLocalsRaw,
  typecheckEmitted,
} from './support.js';

// Statement-bodied builders whose leading local is a `ref.watch(...)` — the real App B shape
// (`customer_form_page.dart`, `discover_page.dart`, `onboarding_page.dart`: `final options =
// ref.watch(p).valueOrNull ?? const []; return …;`) — real analyzer output in, real `bridge normalize`,
// real generator, real `tsc --strict` against the real kit.
//
// This is where inlining a local could cost something that matters: a provider subscription. The two
// invariants proven here are the ones the plain-Dart proof (`builder_body_locals_build.test.ts`) cannot:
//
// 1. **The subscription survives.** A `ref.watch` whose only home is a local's initializer is still
//    hoisted to a `useWatch` at the top of the component, still watch (never read), and still bound to the
//    provider it named. `_bindLeadingLocalsAndReturn` refuses an *unread* local precisely so a
//    `final unused = ref.watch(p);` cannot lose its subscription silently.
// 2. **Each read is the watched value.** The local's reads are the hoisted `useWatch` result, with the
//    `.valueOrNull ?? const []` transform applied at the read, not baked into the subscription.
//
// The repeated `useWatch(countProvider)` (`w$0`…`w$2`, reads use the last) is the existing, deliberate
// behaviour of `Binding.inlineValue`: each read site re-extracts the initializer, and each extraction is a
// hoisted `ref.watch` node. Every one resolves to the same provider and returns the same value, so it is
// redundant, not wrong (the emitted tsconfig sets `strict` but not `noUnusedLocals`, and the whole project is
// typechecked below).

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodBuilderBodyLocalsRaw());

function generated() {
  const { context, reported } = harness(normalized);
  const { files } = reactGenerator.generate(context);
  return {
    files,
    reported,
    home: fileAt(files, 'src/components/home-screen.tsx') ?? '',
    items: fileAt(files, 'src/components/items-view.tsx') ?? '',
  };
}

describe('`Consumer` / `AsyncValue.when` statement bodies with a `ref.watch` local, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning', () => {
    const { files, reported } = generated();
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('every `ref.watch` that lived only in a local initializer is still a hoisted `useWatch` of its own provider', () => {
    const { home } = generated();
    const watches = [...home.matchAll(/const (w\$\d+) = useWatch\((\w+)\);/g)].map((m) => m[2]);
    expect(watches.filter((p) => p === 'countProvider')).toHaveLength(3);
    expect(watches.filter((p) => p === 'itemsProvider')).toHaveLength(1);
    expect(home).not.toMatch(/useProviderContainer\(\)\.read|ref\.read/);
  });

  it('a `ref.watch` local read once, twice, and through a transform: each read is the watched value', () => {
    const { home } = generated();
    expect(home).toContain('<Text>{`count ${w$2}`}</Text>');
    expect(home).toContain('<Text>{`a ${w$2}`}</Text>');
    expect(home).toContain('<Text>{`b ${intAdd(w$2, 1)}`}</Text>');
    expect(home).toContain('<Text>{`options ${(w$3.valueOrNull ?? ([] as string[])).length}`}</Text>');
  });

  it('a local inside `AsyncValue.when`\'s `data:` branch reads through its own callback parameter', () => {
    const { items } = generated();
    expect(items).toContain('data: (items) => <Text>{`${items.length} items`}</Text>');
    expect(items).toContain('const w$0 = useWatch(itemsProvider);');
  });

  it('the `Consumer` wrapper is erased, and no local name survives as a dangling identifier', () => {
    const { home, items } = generated();
    expect(home).not.toContain('Consumer');
    expect(home).not.toMatch(/\$\{(count|options)\b/u);
    expect(items).not.toMatch(/\$\{n\}/u);
  });

  it('is deterministic — two generations are byte-identical, including hook order', () => {
    const a = generated().files.map((f) => `${f.path}\n${f.contents}`);
    const b = generated().files.map((f) => `${f.path}\n${f.contents}`);
    expect(a).toEqual(b);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    typecheckEmitted(generated().files);
  }, 120_000);
});
