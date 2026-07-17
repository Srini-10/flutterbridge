import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnyUirNode } from '@bridge/uir';
import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// The build proof (M3-B) — does the emitted code actually compile against the real runtime?
//
// ## Why this test exists and the other ones do not replace it
//
// `generate.test.ts` asserts what the output *says*. This asserts that what it says is *true*: that every
// import resolves, every runtime API is called with the arguments it actually takes, and every emitted `.tsx`
// typechecks. Those are the claims a golden test cannot make — a golden is only ever as right as the day
// someone recorded it, and a generator that emits `useSignal(count)` where the kit wants `useSignal(signal)`
// produces a golden that passes forever and an application that does not build.
//
// It typechecks against the **real, unmocked `@bridge/runtime-react`** — the frozen M3-A kit, resolved
// through the workspace. That is what makes it a compatibility test between the two packages and not a test
// of the generator's opinion of the kit.
//
// ## Why the generator does not import the runtime, and this test does
//
// `@bridge/runtime-react` is a **devDependency** here. `src/` never imports it — it emits *text* that names
// it, which is ADR-6's whole shape ("generated code may only use public kit entrypoints"). The dependency is
// the test's, so that `tsc` has something to resolve; `.dependency-cruiser.cjs` excludes `tests/` from the
// cruise and `src/`'s import graph is unchanged. The compiler does the same thing with
// `@bridge/widgets-material`.
//
// ## What is not proved here
//
// `next build`. It needs a real install of Next into a scratch project, which is minutes of network per run
// and would make this suite unrunnable offline. The emitted app imports nothing from `next` — only `react` and
// the kit — so `tsc` covers every module the generator actually wrote. Running the App Router end-to-end is
// `just e2e`, still a stub in the justfile, and belongs with the Playwright harness at M4-T3.

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const runtimeSrc = join(packageRoot, '..', '..', 'runtimes', 'react', 'src', 'index.ts');

const span = { file: 'lib/main.dart', line: 1, column: 1 } as const;
const temporaries: string[] = [];

afterAll(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A counter app: a store with a signal and an action, a component that reads and writes it, a theme, a route. */
function counterApp(): AnyUirNode[] {
  const lit = (id: string, value: unknown, type = 'int'): unknown => ({
    id,
    kind: 'logic.Lit',
    span,
    type: { name: type },
    value,
  });

  return [
    {
      id: 'sig-count',
      kind: 'sig.Signal',
      span,
      anchor: 'lib/state/counter.dart#count',
      scope: 'store',
      type: { name: 'int' },
      initial: lit('lit-0', 0),
    },
    {
      id: 'der-doubled',
      kind: 'sig.Derived',
      span,
      anchor: 'lib/state/counter.dart#doubled',
      type: { name: 'int' },
      body: {
        id: 'bin-1',
        kind: 'logic.Binary',
        span,
        type: { name: 'int' },
        operator: '*',
        left: { id: 'ref-1', kind: 'logic.Ref', span, type: { name: 'int' }, name: 'count', target: 'sig-count' },
        right: lit('lit-2', 2),
      },
    },
    {
      // `count += 1` — the shape that must become `count.set(count.peek() + 1)`, not `count = count + 1`.
      id: 'act-increment',
      kind: 'sig.Action',
      span,
      anchor: 'lib/state/counter.dart#increment',
      writes: ['sig-count'],
      body: [
        {
          id: 'stmt-1',
          kind: 'logic.ExprStmt',
          span,
          expr: {
            id: 'asg-1',
            kind: 'logic.Assign',
            span,
            type: { name: 'int' },
            operator: 'addAssign',
            target: { id: 'ref-2', kind: 'logic.Ref', span, type: { name: 'int' }, name: 'count', target: 'sig-count' },
            value: lit('lit-1', 1),
          },
        },
      ],
    },
    {
      id: 'store-counter',
      kind: 'app.Store',
      span,
      name: 'Counter',
      origin: 'declared',
      signals: ['sig-count'],
      derived: ['der-doubled'],
      actions: ['act-increment'],
    },
    { id: 'tok-1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5', dark: '#FF9FA8DA' },
    { id: 'tok-2', kind: 'app.Token', span, group: 'space', name: 'gap', light: 8 },
    {
      id: 'comp-home',
      kind: 'ui.Component',
      span,
      name: 'HomeScreen',
      localSignals: ['sig-local'],
      render: {
        id: 'el-col',
        kind: 'ui.Element',
        span,
        component: { name: 'Column', userDefined: false },
        props: {
          mainAxisAlignment: { id: 'b-1', kind: 'bind.Const', span, value: 'center' },
          crossAxisAlignment: { id: 'b-2', kind: 'bind.Const', span, value: 'stretch' },
        },
        children: [
          {
            // A slot, not a child: `Center(child: ...)`. The catalog says `slots: ["child"]`, the analyzer
            // puts it in `slots`, and the kit's `Center` takes a `child` prop — the same distinction, kept
            // all the way through.
            id: 'el-center',
            kind: 'ui.Element',
            span,
            component: { name: 'Center', userDefined: false },
            props: {},
            slots: {
              child: { id: 'txt-1', kind: 'ui.Text', span, value: { id: 'b-3', kind: 'bind.Const', span, value: 'Hello' } },
            },
            children: [],
          },
          {
            id: 'el-pad',
            kind: 'ui.Element',
            span,
            component: { name: 'SizedBox', userDefined: false },
            props: { height: { id: 'b-4', kind: 'bind.Const', span, value: 8 } },
            children: [],
          },
          {
            id: 'txt-2',
            kind: 'ui.Text',
            span,
            // A local signal read: the reactivity edge, which must become `useSignal(...)`.
            value: { id: 'b-5', kind: 'bind.Signal', span, signal: 'sig-local' },
          },
        ],
      },
    },
    {
      id: 'sig-local',
      kind: 'sig.Signal',
      span,
      anchor: 'lib/screens/home.dart#label',
      scope: 'component',
      type: { name: 'String' },
      initial: lit('lit-s', 'hi', 'String'),
    },
    { id: 'route-1', kind: 'app.Route', span, path: '/', component: 'comp-home' },
  ] as unknown as AnyUirNode[];
}

/** Writes the emitted project to a temp directory and returns its root. */
function materialise(files: readonly { path: string; contents: string }[]): string {
  const root = mkdtempSync(join(tmpdir(), 'bridge-emit-'));
  temporaries.push(root);
  for (const file of files) {
    const full = join(root, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.contents);
  }
  return root;
}

describe('the emitted project compiles against the real runtime', () => {
  it('typechecks', () => {
    const { context, reported } = harness(counterApp());
    const { files } = reactGenerator.generate(context);

    // The app is built entirely from M3-B's supported surface, so nothing should be refused. If this fires,
    // the generator is rejecting something it claims to support.
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);

    const root = materialise(files);

    // A tsconfig for the check, not the one the app ships with: it maps the workspace packages by path so tsc
    // resolves the *real* kit source rather than a stub, and drops the `next` plugin, which is a
    // language-server concern tsc ignores anyway.
    writeFileSync(
      join(root, 'tsconfig.check.json'),
      `${JSON.stringify(
        {
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
            baseUrl: '.',
            paths: {
              '@/*': ['./src/*'],
              '@bridge/runtime-react': [runtimeSrc.replace(/\.ts$/, '')],
              react: [join(packageRoot, 'node_modules', '@types', 'react', 'index.d.ts').replace(/\.d\.ts$/, '')],
              'react/jsx-runtime': [
                join(packageRoot, 'node_modules', '@types', 'react', 'jsx-runtime.d.ts').replace(/\.d\.ts$/, ''),
              ],
            },
          },
          include: ['app/**/*.ts', 'app/**/*.tsx', 'src/**/*.ts', 'src/**/*.tsx'],
        },
        null,
        2,
      )}\n`,
    );

    const tsc = join(packageRoot, 'node_modules', '.bin', 'tsc');
    try {
      execFileSync(tsc, ['-p', join(root, 'tsconfig.check.json')], { stdio: 'pipe', cwd: root });
    } catch (error) {
      const failure = error as { stdout?: Buffer; stderr?: Buffer };
      const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
      // The emitted files are printed on failure: a type error in generated code is a generator bug, and the
      // only way to find it is to read what the generator wrote.
      const dump = files.map((file) => `\n──── ${file.path}\n${file.contents}`).join('');
      expect.unreachable(`the emitted project does not typecheck:\n${output}\n${dump}`);
    }
  }, 120_000);

  it('emits a store whose action writes through the signal, not around it', () => {
    const { context } = harness(counterApp());
    const { files } = reactGenerator.generate(context);
    const store = files.find((file) => file.path === 'src/stores/counter.ts')?.contents ?? '';

    // `count += 1` in Dart. Emitting `count = count + 1` would rebind a local and leave the signal untouched —
    // "generated React state that never updates", which `sig.Action`'s own schema doc names as the defect.
    expect(store).toContain('count.set(count.peek() + 1)');
    expect(store).not.toMatch(/^\s*count = /m);
  });

  it('emits a derived that reads through .get()', () => {
    const { context } = harness(counterApp());
    const { files } = reactGenerator.generate(context);
    const store = files.find((file) => file.path === 'src/stores/counter.ts')?.contents ?? '';
    expect(store).toContain("derived(() => (count.get() * 2), 'doubled')");
  });

  it('emits a signal read in the tree as useSignal — the reactivity edge', () => {
    const { context } = harness(counterApp());
    const { files } = reactGenerator.generate(context);
    const component = files.find((file) => file.path === 'src/components/home-screen.tsx')?.contents ?? '';

    // `useSignal(label)`, not `label` (renders `[object Object]`) and not `label.peek()` (renders once and
    // never updates).
    expect(component).toContain('useSignal(label)');
  });
});
