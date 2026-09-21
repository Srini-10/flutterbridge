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

// jsdom does no layout. A component that *measures* (LayoutBuilder, ADR-0071) is exercised with a shim that resolves the
// handful of inline styles the kit's layout widgets write — `width`/`height` in px or %, `padding`, `display: contents/none`
// — through the containing blocks, against an 800-wide window; and a `ResizeObserver` that reports when a resolved size
// changed. It is deliberately not a layout engine: the real browser is the E2E suite's (`e2e/tests/interaction.spec.ts`).
type Box = { width: number; height: number };
const observed = new Set<{ target: Element; callback: () => void; last: string }>();

function px(value: string): number | undefined {
  return /^-?[\d.]+px$/.test(value) ? Number.parseFloat(value) : undefined;
}
function paddingOf(element: HTMLElement): { horizontal: number } {
  const all = element.style.padding.trim().split(/\s+/).filter(Boolean).map((v) => px(v) ?? 0);
  const [top, right = top, bottom = top, left = right] = all;
  void bottom;
  void top;
  return { horizontal: (element.style.paddingLeft !== '' ? (px(element.style.paddingLeft) ?? 0) : (left ?? 0)) + (element.style.paddingRight !== '' ? (px(element.style.paddingRight) ?? 0) : (right ?? 0)) };
}
function container(element: HTMLElement): HTMLElement | undefined {
  let parent = element.parentElement;
  while (parent !== null && parent.style.display === 'contents') parent = parent.parentElement;
  return parent === null || parent === document.body ? undefined : parent;
}
function widthOf(element: HTMLElement): number {
  const parent = container(element);
  const available = parent === undefined ? 800 : widthOf(parent) - paddingOf(parent).horizontal;
  const declared = element.style.width;
  if (px(declared) !== undefined) return px(declared) as number;
  if (declared.endsWith('%')) return (Number.parseFloat(declared) / 100) * available;
  return available;
}
function definiteHeight(element: HTMLElement): number | undefined {
  const declared = element.style.height;
  if (px(declared) !== undefined) return px(declared);
  if (declared.endsWith('%')) {
    const parent = container(element);
    const above = parent === undefined ? undefined : definiteHeight(parent);
    return above === undefined ? undefined : (Number.parseFloat(declared) / 100) * above;
  }
  return undefined;
}
function boxOf(element: HTMLElement): Box {
  return { width: widthOf(element), height: definiteHeight(element) ?? 0 };
}
function installLayoutShim(): void {
  const proto = HTMLElement.prototype as unknown as { getBoundingClientRect(this: HTMLElement): object };
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const { width, height } = boxOf(this);
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
  };
  class ShimObserver {
    private readonly callback: () => void;
    private readonly entries = new Set<{ target: Element; callback: () => void; last: string }>();
    public constructor(callback: () => void) {
      this.callback = callback;
    }
    public observe(target: Element): void {
      const entry = { target, callback: this.callback, last: JSON.stringify(boxOf(target as HTMLElement)) };
      this.entries.add(entry);
      observed.add(entry);
    }
    public disconnect(): void {
      for (const entry of this.entries) observed.delete(entry);
      this.entries.clear();
    }
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ShimObserver;
}

interface Mounted {
  /** The `<button>` labelled `label` is clicked inside `act`. Throws if there is none. */
  click(label: string): void;
  /** The text of every leaf element beginning with `prefix`, in document order. */
  texts(prefix?: string): string[];
  /** The mounted tree's HTML. */
  html(): string;
  /** Lets `ms` of real time pass inside `act`, so timers and awaited promises settle. */
  wait(ms: number): Promise<void>;
  /**
   * One scripted input step, in the vocabulary `fixtures/apps/gestures/test/scenarios_test.dart` performs in Flutter:
   * `@tap:T`, `@double:T`, `@long:T`, `@down:T`, `@up`, `@cancel`, `@hover:T`, `@unhover`, `@key:tab|enter|space`, where `T` is
   * the text of the element pressed. Real (not fake) time passes where Flutter's clock is advanced.
   */
  input(step: string): Promise<void>;
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
  options: { readonly layout?: boolean } = {},
): Promise<Harness> {
  if (options.layout === true) installLayoutShim();
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
      let held: Element | undefined;
      let hovered: Element | undefined;
      // Reports a size change to every `ResizeObserver` (the layout shim's), inside `act`, until nothing changes.
      const settle = (): void => {
        for (let round = 0; round < 6; round += 1) {
          const due = [...observed].filter((entry) => {
            const now = JSON.stringify(boxOf(entry.target as HTMLElement));
            if (now === entry.last) return false;
            entry.last = now;
            return true;
          });
          if (due.length === 0) return;
          void bundle.act(() => {
            for (const entry of due) entry.callback();
          });
        }
      };
      void bundle.act(() =>
        reactRoot.render(options.strict === true ? bundle.createElement(bundle.StrictMode, null, element) : element),
      );
      settle();
      return {
        click(label) {
          const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label);
          if (button === undefined) throw new Error(`no <button> labelled ${label}`);
          void bundle.act(() => button.click());
          settle();
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
          settle();
        },
        async input(step) {
          const pause = (ms: number): Promise<void> =>
            bundle.act(async () => {
              await new Promise<void>((resolve) => setTimeout(resolve, ms));
            }) as Promise<void>;
          const target = (text: string): Element => {
            const found = [...container.querySelectorAll('*')].find(
              (e) => e.children.length === 0 && e.textContent === text,
            );
            if (found === undefined) throw new Error(`no element with the text ${text}`);
            return found;
          };
          const fire = (element: Element, type: string, init: Record<string, unknown> = {}): void => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            const fields = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10, detail: 0, ...init };
            for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
            void bundle.act(() => {
              element.dispatchEvent(event);
            });
          };
          const [verb, ...rest] = step.split(':');
          const argument = rest.join(':');
          if (verb === '@wait') return pause(Number(argument));
          if (verb === '@tap') {
            fire(target(argument), 'pointerdown');
            fire(target(argument), 'pointerup');
          } else if (verb === '@double') {
            fire(target(argument), 'pointerdown');
            fire(target(argument), 'pointerup');
            await pause(50);
            fire(target(argument), 'pointerdown');
            fire(target(argument), 'pointerup');
          } else if (verb === '@long') {
            fire(target(argument), 'pointerdown');
            await pause(600);
            fire(target(argument), 'pointerup');
          } else if (verb === '@down') {
            held = target(argument);
            fire(held, 'pointerdown');
          } else if (verb === '@up' || verb === '@cancel') {
            if (held === undefined) throw new Error(`${verb} with no pointer held`);
            fire(held, verb === '@up' ? 'pointerup' : 'pointercancel');
            held = undefined;
          } else if (verb === '@hover') {
            const element = target(argument);
            fire(element, 'pointerover', { relatedTarget: null });
            hovered = element;
          } else if (verb === '@unhover') {
            if (hovered === undefined) throw new Error('@unhover with nothing hovered');
            fire(hovered, 'pointerout', { relatedTarget: document.body });
            hovered = undefined;
          } else if (verb === '@key') {
            if (argument === 'tab') {
              const order = [...container.querySelectorAll<HTMLElement>('[tabindex="0"], button:not([disabled]), input')];
              const at = order.indexOf(document.activeElement as HTMLElement);
              const next = order[(at + 1) % order.length];
              void bundle.act(() => next?.focus());
            } else {
              const active = document.activeElement ?? document.body;
              const key = argument === 'enter' ? 'Enter' : ' ';
              const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
              void bundle.act(() => {
                active.dispatchEvent(event);
              });
            }
          } else {
            throw new Error(`unknown input step ${step}`);
          }
          return Promise.resolve();
        },
        unmount() {
          void bundle.act(() => reactRoot.unmount());
          container.remove();
        },
      };
    },
  };
}
