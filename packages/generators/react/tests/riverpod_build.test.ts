import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, riverpodBasicRaw, typecheckEmitted } from './support.js';

// The M14 Riverpod build-proof — the supported v1 subset (`docs/m14/riverpod-usage-matrix.md` §4), real analyzer output in,
// real `bridge normalize`, real generator, real `tsc`, matching `inline_push_build.test.ts`'s own discipline.
//
// `fixtures/apps/riverpod_basic`: `baseProvider` (`Provider`) → `doubledProvider` (reads it via `ref.watch` in its own
// create closure) → `labelProvider` (reads `doubledProvider`, string interpolation); `filterProvider` (`StateProvider`);
// a `ConsumerWidget` (`HomeScreen`) consuming all four via `ref.read`, `.notifier` and `ref.invalidate`.
//
// Every provider closure is **expression-bodied**. A statement-bodied one, referenced transitively from a second
// component's own module, currently loses its own locals — a real, narrow, pre-existing gap in top-level-constant
// lowering this milestone found and named (`docs/m14/riverpod-usage-matrix.md` §"Known gaps") but did not fix; this
// fixture is deliberately shaped to avoid it, matching what it claims to prove.

afterAll(cleanupBuildProofTemporaries);

const normalized = compiledFrom(riverpodBasicRaw());

describe('M14 build-proof: the supported Riverpod subset, real analyzer to real tsc', () => {
  it('generates with no error — only the informational "package used" warning for what remains unsupported', () => {
    const { context, reported } = harness(normalized);
    const { files } = reactGenerator.generate(context);

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(reported.map((d) => d.code)).toContain('BRG3020');
    expect(files.length).toBeGreaterThan(0);
  });

  it('providers.tsx wraps the root in ProviderScope', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toMatch(/import \{[^}]*\bProviderScope\b[^}]*\} from '@bridge\/runtime-react';/);
    expect(providers).toMatch(/<ProviderScope>[\s\S]*<\/ProviderScope>/);
  });

  it('the provider constants lower to the kit\'s own classes, and a provider\'s own ref.watch is a plain call', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const main = fileAt(files, 'src/generated/dart/app/lib/main.ts') ?? '';
    expect(main).toContain('new Provider(');
    expect(main).toContain('new StateProvider(');
    expect(main).toMatch(/ref\.watch\(baseProvider\)/);
    expect(main).toMatch(/ref\.watch\(doubledProvider\)/);
  });

  it('the ConsumerWidget declares one useProviderContainer() and reads/writes through it, with no hooks in a callback', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    const screen = fileAt(files, 'src/components/home-screen.tsx') ?? '';
    expect(screen).toContain('useProviderContainer');
    // Declared exactly once, hoisted to the top of the component — never re-acquired inside the callback.
    expect((screen.match(/useProviderContainer\(\)/g) ?? []).length).toBe(1);
    expect(screen).toMatch(/ref\.read\(labelProvider\)/);
    expect(screen).toMatch(/ref\.read\(filterProvider\)/);
    expect(screen).toMatch(/ref\.read\(filterProvider\.notifier\)\.state = 'b'/);
    expect(screen).toMatch(/ref\.invalidate\(baseProvider\)/);
  });

  it('the whole emitted project typechecks against the real runtime kit', () => {
    const { context } = harness(normalized);
    const { files } = reactGenerator.generate(context);
    typecheckEmitted(files);
  });
});
