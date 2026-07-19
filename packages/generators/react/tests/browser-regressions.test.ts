// Regressions for defects that only a browser found.
//
// Every test here corresponds to a defect in `docs/m5/m5d-browser-validation.md`, and each one was green
// across every gate the project had at the time it shipped: extraction, normalization, generation, `tsc`
// against the real runtime kit, and — for the second one — `next build` as well.
//
// They live at generator level, not in the Playwright suite, because that suite takes ~40 s to build its
// fixtures and these are properties of the emitted text. The browser proves the behaviour once; these keep
// it proven on every `pnpm test`.

import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { counter, harness } from './support.js';
import type { AnyUirNode } from '@bridge/uir';

/** The emitted file at `path`. */
function emitted(nodes: AnyUirNode[], path: string): string {
  const { files } = reactGenerator.generate(harness(nodes).context);
  const file = files.find((f) => f.path === path);
  expect(file, `the generator must emit ${path}`).toBeDefined();
  return file!.contents;
}

describe('emitted module specifiers (B1)', () => {
  // `tsc` accepted `@/components/x.js` under `moduleResolution: "Bundler"` — TypeScript maps it to the
  // `.tsx` beside it — while webpack looked for a file with that literal name and failed:
  //
  //   Module not found: Can't resolve '@/components/counter-screen.js'
  //
  // So the typecheck gate passed and `next build` did not, on every application the generator produced.
  it('carry no file extension, so a bundler can resolve them', () => {
    const { files } = reactGenerator.generate(harness(counter()).context);

    const offenders: string[] = [];
    for (const file of files) {
      if (!file.path.endsWith('.tsx') && !file.path.endsWith('.ts')) continue;
      for (const match of file.contents.matchAll(/from '([^']+)'/g)) {
        const specifier = match[1]!;
        const local = specifier.startsWith('.') || specifier.startsWith('@/');
        if (local && /\.(js|jsx|ts|tsx)$/.test(specifier)) {
          offenders.push(`${file.path}: ${specifier}`);
        }
      }
    }
    expect(offenders, 'local imports with a file extension').toEqual([]);
  });

  it('still resolve through the tsconfig alias the scaffolder writes', () => {
    const tsconfig = JSON.parse(emitted(counter(), 'tsconfig.json')) as {
      compilerOptions: { paths: Record<string, string[]>; moduleResolution: string };
    };
    // `@/x` → `./src/x`, which is what makes the extensionless specifier resolvable at all.
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
    expect(tsconfig.compilerOptions.moduleResolution).toBe('Bundler');
  });
});

describe('signal subscription (B2)', () => {
  // The defect: `_count.set(…)` ran, the signal changed, and the component never re-rendered, because a
  // read reached through an expression emitted `_count.get()` — which reads without subscribing. The
  // browser showed "You have pushed the button 0 times." after any number of clicks, with no console
  // error and no failed request. Only a bare `bind.Signal` subscribed, and interpolation is not one.
  it('subscribes the component to every local signal, at the top level', () => {
    const source = emitted(counter(), 'src/components/counter-screen.tsx');

    expect(source).toContain('const _count$ = useSignal(_count);');

    // Unconditional, and before the return: a hook inside a conditional — a `ui.Cond` branch, a list
    // template — corrupts React's hook order on a later render, far from the cause.
    const subscription = source.indexOf('useSignal(_count)');
    const returned = source.indexOf('return ');
    expect(subscription, 'the subscription must be emitted').toBeGreaterThan(-1);
    expect(subscription, 'the subscription must precede the render').toBeLessThan(returned);
  });

  it('reads the subscribed value in render position', () => {
    const source = emitted(counter(), 'src/components/counter-screen.tsx');
    const render = source.slice(source.indexOf('return '));

    expect(render, 'render must read the subscribed local').toContain('_count$');
    // A bare `.get()` in render is the defect itself: correct value, no subscription.
    expect(render, 'render must not read the signal without subscribing').not.toContain('_count.get()');
  });

  it('reads the live signal inside a handler, never the subscribed value', () => {
    const source = emitted(counter(), 'src/components/counter-screen.tsx');
    const handler = source.slice(source.indexOf('const handle'), source.indexOf('return '));

    // A handler runs after the render that created it. Reading `_count$` would close over that render's
    // value — the stale-closure bug — so it must go through the signal object.
    //
    // `.get()` rather than `.peek()` is right here and worth stating, because the difference looks like it
    // should matter: `get` only records a dependency when a tracked computation is running (`activeConsumer`
    // in the kit's graph), and a click handler is not one. Outside `derived`/`effect` the two are the same
    // read, and `get` is what an ordinary value read means.
    expect(handler, 'a handler must read through the signal object').toMatch(/_count\.(get|peek)\(\)/);
    expect(handler, 'a handler must not call a hook').not.toContain('useSignal');
    expect(handler, 'a handler must not read the render-scoped value').not.toContain('_count$');
  });
});
