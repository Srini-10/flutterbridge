import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materialise } from './support.js';

// Runs a generated project's components in jsdom — the piece the build-proof tests lacked: they check the *text* of the
// emitted code and that it typechecks, never what it *does*. Real `react-dom`, the real runtime kit, the real emitted
// `.tsx`; nothing is stubbed. Bundled with esbuild (the same engine `tsup` and `next` use), in a child process so the emitted `@/…` and
// `@bridge/runtime-react` imports resolve exactly as they do in a build.

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const runtimeEntry = join(packageRoot, '..', '..', 'runtimes', 'react', 'src', 'index.ts');

interface Mounted {
  /** The `<button>` labelled `label` is clicked inside `act`. Throws if there is none. */
  click(label: string): void;
  /** The text of every leaf element beginning with `prefix`, in document order. */
  texts(prefix?: string): string[];
  /** The mounted tree's HTML. */
  html(): string;
  /** Lets `ms` of real time pass inside `act`, so timers and awaited promises settle. */
  wait(ms: number): Promise<void>;
  /** Unmounts. */
  unmount(): void;
}

export interface Harness {
  /** The HTML of a component's **first render** with no effects run — what a server, or the first frame, shows. */
  firstRender(exportName: string, props?: object): string;
  mount(componentFile: string, exportName: string, options?: { strict?: boolean }): Mounted;
}

/**
 * Bundles every emitted component of `files` and returns a harness that mounts one by name.
 *
 * @param files - the generator's output.
 * @param components - `[file under src/components without extension, exported component name]` for each to bundle.
 */
export async function loadGenerated(
  files: readonly { path: string; contents: string }[],
  components: readonly (readonly [string, string])[],
): Promise<Harness> {
  const root = materialise(files);
  const entry = [
    `import { createRoot } from 'react-dom/client';`,
    `import { act, createElement, StrictMode } from 'react';`,
    `import { renderToString } from 'react-dom/server';`,
    ...components.map(([file, name]) => `import { ${name} } from '@/components/${file}';`),
    `export const registry = { ${components.map(([, name]) => name).join(', ')} };`,
    `export { act, createRoot, createElement, StrictMode, renderToString };`,
  ].join('\n');
  mkdirSync(join(root, '.exec'), { recursive: true });
  const outfile = join(root, '.exec', 'bundle.js');
  execFileSync(
    process.execPath,
    [
      join(here, 'bundle-components.mjs'),
      JSON.stringify({ root, entry, outfile, runtimeEntry, nodePath: join(packageRoot, 'node_modules') }),
    ],
    { stdio: 'pipe' },
  );
  // An IIFE evaluated in the test's own realm (jsdom's `document`/`window`), rather than `import()`: the module runner
  // refuses a file outside the package.
  const bundle = new Function(`${readFileSync(outfile, 'utf8')}\nreturn __bundle;`)() as {
    registry: Record<string, (props: object) => unknown>;
    act: (fn: () => void | Promise<void>) => void | Promise<void>;
    StrictMode: unknown;
    renderToString: (node: unknown) => string;
    createRoot: (container: Element) => { render(node: unknown): void; unmount(): void };
    createElement: (type: unknown, props?: object | null, ...children: unknown[]) => unknown;
  };

  return {
    firstRender(exportName, props = {}) {
      const type = bundle.registry[exportName];
      if (type === undefined) throw new Error(`no bundled component named ${exportName}`);
      return bundle.renderToString(bundle.createElement(type, props));
    },
    mount(_file, exportName, options = {}) {
      const type = bundle.registry[exportName];
      if (type === undefined) throw new Error(`no bundled component named ${exportName}`);
      const container = document.createElement('div');
      document.body.appendChild(container);
      const reactRoot = bundle.createRoot(container);
      const element = bundle.createElement(type);
      void bundle.act(() =>
        reactRoot.render(options.strict === true ? bundle.createElement(bundle.StrictMode, null, element) : element),
      );
      return {
        click(label) {
          const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
          if (button === undefined) throw new Error(`no <button> labelled ${label}`);
          void bundle.act(() => button.click());
        },
        texts(prefix = '> ') {
          return [...container.querySelectorAll('*')]
            .filter((e) => e.children.length === 0 && (e.textContent ?? '').startsWith(prefix))
            .map((e) => e.textContent ?? '');
        },
        html: () => container.innerHTML,
        async wait(ms) {
          await bundle.act(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, ms));
          });
        },
        unmount() {
          void bundle.act(() => reactRoot.unmount());
          container.remove();
        },
      };
    },
  };
}
