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
  /** Store definitions to provide: `{ module, name }`. */
  readonly stores: readonly { readonly module: string; readonly name: string }[];
  /** The component the root route renders: `{ module, name }`, if there is one. */
  readonly root: { readonly module: string; readonly name: string } | undefined;
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
      '@bridge/runtime-react': 'workspace:*',
      next: NEXT_VERSION,
      react: REACT_VERSION,
      'react-dom': REACT_VERSION,
    },
    devDependencies: {
      '@types/react': REACT_VERSION,
      '@types/react-dom': REACT_VERSION,
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
    "import { Providers } from './providers.js';",
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
  lines.push("import { RouterProvider, StoreProvider, ThemeProvider } from '@bridge/runtime-react';");
  lines.push("import type { ReactNode } from 'react';");
  const local = [
    { specifier: input.routesModule, name: input.routesName },
    ...input.stores.map((store) => ({ specifier: store.module, name: store.name })),
    { specifier: input.themeModule, name: input.themeName },
  ].sort((a, b) => (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0));
  for (const entry of local) lines.push(`import { ${entry.name} } from '${entry.specifier}';`);
  lines.push('');
  lines.push('/** Scopes every store, the theme and the router to this client root (ADR-15). */');
  lines.push('export function Providers({ children }: { readonly children: ReactNode }) {');

  // Nested providers, innermost last. Built as text rather than by folding a tree: the nesting is fixed and
  // shallow, and a fold would make the indentation a function of the store count.
  const open: string[] = [`<ThemeProvider descriptor={${input.themeName}}>`, `<RouterProvider descriptor={${input.routesName}}>`];
  const close: string[] = ['</RouterProvider>', '</ThemeProvider>'];
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

/** The root route's page. */
function page(input: ScaffoldInput): string {
  if (input.root === undefined) {
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
  return [
    "'use client';",
    '',
    banner('the program'),
    '',
    `import { ${input.root.name} } from '${input.root.module}';`,
    '',
    '/** The root route. */',
    'export default function Page() {',
    `  return <${input.root.name} />;`,
    '}',
    '',
  ].join('\n');
}
