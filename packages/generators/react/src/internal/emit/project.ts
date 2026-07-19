// The scaffolder — the files that are not a lowering of any node.
//
// ## Why this is a Next.js App Router project and not `main.tsx` + `App.tsx`
//
// The frozen architecture names the target in three places, and they agree. This package's own description is
// *"Target #1 — Next.js generator: scaffolder, lower-signals, rsc-split, UINode emitters, route emitter"*.
// ADR-16 is an entire ADR about which Next **major** to pin, and instructs: *"Pin `next@15.5.x` in
// `gen-react`'s scaffolder and the runtime kit's peer range."* ADR-15's `rsc-safety` analysis and its
// `"use client"` rule only mean anything under the App Router.
//
// A Vite-style SPA would be a different target, and would make ADR-15 unenforceable: without RSC there is no
// server component, so "a store read disqualifies server rendering" has nothing to disqualify — and the
// privacy defect ADR-15 exists to prevent is a server-rendering defect.
//
// ## `"use client"`, and why it is on everything for now
//
// ADR-15 §3: *"Any component subtree that reads a store is **client-scoped**: the `rsc-safety` analysis (Spec
// §3.3) must treat a store read as disqualifying for server rendering."* That analysis is a compiler pass and
// does not exist yet — `rsc-split` is named in this package's description as future work. Until it does, every
// emitted component carries `"use client"`.
//
// That is the *conservative* direction, deliberately. Marking a client component as a server component is the
// ADR-15 defect — one user's cart served to another. Marking a server component as a client component costs
// bundle size. One is a privacy breach; the other is a performance regression. Choosing correctly here is
// `rsc-split`'s job, and until it can, this errs where being wrong is survivable.

import type { EmittedFile } from '@bridge/plugin-sdk';

/** Pinned per ADR-16: "stay on Next 15 (pinned `15.5.x`) through M1 and M2. Re-decide at the M3-T6 freeze." */
const NEXT_VERSION = '15.5.20';
const REACT_VERSION = '19.2.7';

/**
 * The type stubs, versioned **separately from the packages they describe**.
 *
 * These were emitted as `REACT_VERSION` for both, and `@types/react-dom@19.2.7` does not exist — the
 * `19.2.x` line of `@types/react-dom` ends at `19.2.3`. So `npm install` in *every* generated project
 * died with `ETARGET / No matching version found`, before installing anything.
 *
 * The mistake is a reasonable-sounding assumption that is simply not true of DefinitelyTyped: a stub
 * package tracks the *major and minor* of its subject and then versions on its own patch cadence,
 * because it is published whenever the types change and not whenever React does. `@types/react` and
 * `@types/react-dom` are two packages with two release histories, and neither follows `react`.
 *
 * This repository already knew — `packages/runtimes/react/package.json` pins `19.2.3` for the DOM
 * stubs and `19.2.7` for the React ones. The generator had reconstructed the number instead of using
 * the known-good one, which is how a value that is right in one file becomes wrong in another.
 */
const REACT_TYPES_VERSION = '19.2.7';
const REACT_DOM_TYPES_VERSION = '19.2.3';

/**
 * The runtime kit range an app emitted by *this* generator needs.
 *
 * **This was `workspace:*` until M5-C, and that made every generated application uninstallable
 * anywhere but inside this monorepo** — `workspace:` is a pnpm-only protocol, and `npm install` in an
 * emitted project fails outright with `EUNSUPPORTEDPROTOCOL`. The generator's whole output is a
 * project someone is meant to run, so the one dependency the generator itself controls has to be
 * expressible to the package managers people actually use.
 *
 * A caret range, not an exact pin: the emitted code calls the kit's public API, and ADR-6 makes that
 * API the contract between them, so a patch or minor kit release is exactly the thing a generated app
 * should be able to take without regenerating. A breaking kit release changes the major, and this
 * constant with it.
 *
 * `runtime-kit-range.test.ts` asserts that the installed kit satisfies this range, so the two cannot
 * drift apart silently — the range is declared once here and *verified* against the kit, rather than
 * restated in two places that will eventually disagree.
 *
 * Exported because the generator declares the same fact twice over: here, as the dependency a
 * generated app installs, and as `TargetGenerator.runtimeRange`, the SPI field INV-12/INV-13 require.
 * Those are the same compatibility claim seen from two sides, so they are one constant.
 */
export const RUNTIME_KIT_RANGE = '^0.1.0';

// ## Emitted imports carry no file extension
//
// Local specifiers are `@/theme/tokens` and `./providers`, never `@/theme/tokens.js`. They *were* `.js`,
// and that made **every generated application fail `next build`**:
//
// ```text
// ./app/page.tsx
// Module not found: Can't resolve '@/components/counter-screen.js'
// ```
//
// The trap is that it typechecked clean. This scaffolder configures `"moduleResolution": "Bundler"`, and
// under Bundler resolution TypeScript accepts a `.js` specifier and resolves it to the `.tsx` file beside
// it — the `.js` convention belongs to `NodeNext`, where the emitted JavaScript really is what runs.
// webpack does no such mapping: it looks for a file literally named `counter-screen.js`, finds `.tsx`, and
// stops.
//
// So `tsc --noEmit` passed and `next build` failed, and **`tsc` was the only gate the pipeline had**.
// M5-B and M5-C both reported "the emitted project typechecks clean against the real kit" — true, and not
// the same claim as "the application builds". Three milestones were green on a project that could never
// have run in a browser. That gap is what M5-D exists to close, and `next build` is now part of the suite
// rather than something a person remembers to try.

/** What the scaffolder needs to know about the generated app. */
export interface ScaffoldInput {
  /** The package name for the generated project. */
  readonly name: string;
  /** The module path of the theme descriptor, e.g. `@/theme/tokens`. */
  readonly themeModule: string;
  /** The exported theme descriptor's name. */
  readonly themeName: string;
  /** The module path of the route table. */
  readonly routesModule: string;
  /** The exported route table's name. */
  readonly routesName: string;
  /** The module path of the asset manifest. */
  readonly assetsModule: string;
  /** The exported asset manifest's name. */
  readonly assetsName: string;
  /** Store definitions to provide: `{ module, name }`. */
  readonly stores: readonly { readonly module: string; readonly name: string }[];
  /** Everything `app/page.tsx` needs. Built by the pipeline, because lowering a value needs the emit scope. */
  readonly page: PageInput;
}

/** One screen `app/page.tsx` can show. */
export interface PageScreen {
  /** The identity the outlet looks it up by — a route-table name, or a `ui.Component` node id. */
  readonly key: string;
  /**
   * The identifier the page renders.
   *
   * Usually the imported component. When the route carries arguments (ADR-0025 D1) it is a **wrapper**
   * the page declares, which constructs that component with them — see {@link PageInput.declarations}.
   */
  readonly name: string;
}

/**
 * `app/page.tsx`: what it imports, what it declares, and what it renders.
 *
 * The scaffolder writes fixed text and holds no emit scope, but this one file's content depends on
 * values that must be *lowered* — a route's arguments are `bind.*` nodes, and turning one into an
 * expression needs resolution and reporting. So the pipeline lowers them and hands the result over as
 * text, and the split stays where it has always been: the pipeline knows the program, the scaffolder
 * knows the file.
 */
export interface PageInput {
  /**
   * What the page renders when it renders the root route directly — the component, or its wrapper.
   *
   * `undefined` when the program declares no route at `/`.
   */
  readonly root: string | undefined;
  /**
   * Every screen reachable as a **declared route**, keyed by its name in the route table.
   *
   * Empty when the program declares no routes at all. Then the page renders {@link root} directly and no
   * outlet is emitted: a screen that cannot be navigated away from does not need a stack.
   */
  readonly routes: readonly PageScreen[];
  /**
   * Every screen reachable as an **inline destination**, keyed by its `ui.Component` node id.
   *
   * A separate namespace from {@link routes}, exactly as `RouterOutlet` keeps them apart: a route called
   * `detail` and a component whose id is `detail` must not collide into one key and silently render the
   * wrong screen.
   */
  readonly components: readonly PageScreen[];
  /** The rendered import block, ordered by the one rule every emitted file's imports follow. */
  readonly imports: readonly string[];
  /** Module-scope declarations the page needs — the route wrappers, rendered. */
  readonly declarations: readonly string[];
}

/** The header every generated file carries. */
export function banner(source: string): string {
  return [
    '// GENERATED CODE — DO NOT EDIT.',
    '//',
    `// Emitted by @bridge/gen-react from ${source}.`,
    '//',
    '// Edits are lost on the next build. To change what this file says, change the Flutter source it came',
    '// from, or attach an override to the anchor of the node that produced it.',
  ].join('\n');
}

/**
 * The files that scaffold the project.
 *
 * @param input - what the app is made of.
 * @returns `package.json`, `tsconfig.json`, `next.config.mjs`, and the App Router root.
 */
export function scaffold(input: ScaffoldInput): EmittedFile[] {
  return [
    { path: 'package.json', contents: packageJson(input) },
    { path: 'tsconfig.json', contents: tsconfigJson() },
    { path: 'next.config.mjs', contents: nextConfig() },
    { path: 'app/layout.tsx', contents: layout(input) },
    { path: 'app/page.tsx', contents: page(input) },
    { path: 'app/providers.tsx', contents: providers(input) },
  ];
}

/**
 * The generated project's manifest.
 *
 * Keys are in a fixed order and dependencies are sorted — `JSON.stringify` over a built object would put them
 * in insertion order, which is the order the emitter happened to add them, which is not a fact about the app.
 */
function packageJson(input: ScaffoldInput): string {
  const manifest = {
    name: input.name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: {
      '@bridge/runtime-react': RUNTIME_KIT_RANGE,
      next: NEXT_VERSION,
      react: REACT_VERSION,
      'react-dom': REACT_VERSION,
    },
    devDependencies: {
      '@types/react': REACT_TYPES_VERSION,
      '@types/react-dom': REACT_DOM_TYPES_VERSION,
      typescript: '5.9.3',
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function tsconfigJson(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
      incremental: true,
      paths: { '@/*': ['./src/*'] },
      plugins: [{ name: 'next' }],
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

function nextConfig(): string {
  return [
    '// GENERATED CODE — DO NOT EDIT.',
    '',
    '/** @type {import(\'next\').NextConfig} */',
    'const nextConfig = {',
    '  reactStrictMode: true,',
    '};',
    '',
    'export default nextConfig;',
    '',
  ].join('\n');
}

/** The App Router root. A server component: it provides nothing and reads nothing. */
function layout(input: ScaffoldInput): string {
  return [
    banner('the program'),
    '',
    "import type { ReactNode } from 'react';",
    '',
    "import { Providers } from './providers';",
    '',
    `/** The application shell for \`${input.name}\`. */`,
    'export default function RootLayout({ children }: { readonly children: ReactNode }) {',
    '  return (',
    '    <html lang="en">',
    '      <body>',
    '        <Providers>{children}</Providers>',
    '      </body>',
    '    </html>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/**
 * The providers.
 *
 * A client component, and the only place stores are instantiated. ADR-15's rewrite in one file: the store
 * *definitions* are module-scope imports and hold no state; `StoreProvider` makes the instance, once per
 * client root. There is no `new Store()` here and there cannot be one.
 */
function providers(input: ScaffoldInput): string {
  const lines: string[] = ["'use client';", '', banner('the program'), ''];
  // Same order the module builder produces: packages first, then the project's own modules, each
  // lexicographic. `sortSpecifiers` is the rule; this file is checked against it like any other.
  lines.push(
    "import { AssetProvider, RouterProvider, StoreProvider, ThemeProvider } from '@bridge/runtime-react';",
  );
  lines.push("import type { ReactNode } from 'react';");
  const local = [
    { specifier: input.assetsModule, name: input.assetsName },
    { specifier: input.routesModule, name: input.routesName },
    ...input.stores.map((store) => ({ specifier: store.module, name: store.name })),
    { specifier: input.themeModule, name: input.themeName },
  ].sort((a, b) => (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0));
  for (const entry of local) lines.push(`import { ${entry.name} } from '${entry.specifier}';`);
  lines.push('');
  lines.push(
    '/** Scopes every store, the theme, the assets and the router to this client root (ADR-15). */',
  );
  lines.push('export function Providers({ children }: { readonly children: ReactNode }) {');

  // Nested providers, innermost last. Built as text rather than by folding a tree: the nesting is fixed and
  // shallow, and a fold would make the indentation a function of the store count.
  const open: string[] = [
    `<ThemeProvider descriptor={${input.themeName}}>`,
    `<AssetProvider manifest={${input.assetsName}}>`,
    `<RouterProvider descriptor={${input.routesName}}>`,
  ];
  const close: string[] = ['</RouterProvider>', '</AssetProvider>', '</ThemeProvider>'];
  for (const store of input.stores) {
    open.push(`<StoreProvider definition={${store.name}}>`);
    close.unshift('</StoreProvider>');
  }

  lines.push('  return (');
  open.forEach((tag, index) => lines.push(`${'  '.repeat(index + 2)}${tag}`));
  lines.push(`${'  '.repeat(open.length + 2)}{children}`);
  close.forEach((tag, index) => lines.push(`${'  '.repeat(open.length + 1 - index)}${tag}`));
  lines.push('  );');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

/**
 * The root route's page.
 *
 * Renders names, and lowers nothing. Every identifier here — the screens, and the wrappers that supply a
 * route's arguments — was decided by the pipeline, which is the layer that can resolve a value. See
 * {@link PageInput}.
 */
function page(input: ScaffoldInput): string {
  const { root, routes, components, imports, declarations } = input.page;

  if (root === undefined) {
    return [
      banner('the program'),
      '',
      '/** The program declares no route at `/`. */',
      'export default function Page() {',
      '  return null;',
      '}',
      '',
    ].join('\n');
  }
  // A program that never navigates renders its root component directly. Emitting an outlet for it would
  // add a stack, a subscription and two empty maps to an application that has one screen.
  if (routes.length === 0 && components.length === 0) {
    return [
      "'use client';",
      '',
      banner('the program'),
      '',
      ...imports,
      ...declarations,
      '/** The root route. */',
      'export default function Page() {',
      `  return <${root} />;`,
      '}',
      '',
    ].join('\n');
  }

  // Otherwise the page *is* the navigation stack's window. `RouterOutlet` renders whichever entry is on
  // top, so a `push` in a callback changes what is on screen — which is what the stack could not do
  // before the kit had a consumer for it (M7-C).
  const entries = (list: readonly PageScreen[]): string =>
    list.map((s) => `${JSON.stringify(s.key)}: ${s.name}`).join(', ');

  const lines = [
    "'use client';",
    '',
    banner('the program'),
    '',
    ...imports,
    ...declarations,
    '/** The navigation stack, rendered. The entry on top is what the user sees. */',
    'export default function Page() {',
    '  return (',
    '    <RouterOutlet',
    `      routes={{ ${entries(routes)} }}`,
  ];
  if (components.length > 0) {
    lines.push(`      components={{ ${entries(components)} }}`);
  }
  lines.push('    />', '  );', '}', '');
  return lines.join('\n');
}
