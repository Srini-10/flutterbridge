import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseUirNode, type AnyUirNode } from '@bridge/uir';
import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// The build-proof (M3-D) — the whole pipeline, over a program the analyzer really produced.
//
// ## Why this used to prove nothing, and now does
//
// It once typechecked emitted code against a **hand-built** UIR — a program no analyzer run ever emitted.
// That is exactly how the child-slot mismatch (validation B1) survived: the fixture put a single child in
// `slots`, which is what the generator wants, while the real analyzer put it in `children`, which is what
// broke. A build proof over an imagined program proves the imagination is consistent, not the pipeline.
//
// So the input is now the **committed golden** `fixtures/uir/layout_proof.ndjson` — real analyzer output,
// pinned byte-for-byte by `build_proof_test.dart`, which mints it from real Flutter source. This test takes
// it the rest of the way: the real compiler (N1–N11, through the `bridge` CLI), the real generator, and
// `tsc` against the real, unmocked `@bridge/runtime-react`. Flutter source → analyzer → compiler → generator
// → tsc, with no hand-built node anywhere. Drift in either half fails a test: the analyzer half here, the
// generator half in the Dart guard.
//
// ## What is not proved here
//
// `next build` and the browser: the emitted app imports only `react` and the kit (never `next`), so `tsc`
// covers every module the generator wrote. The App Router at runtime is `just e2e` (M4-T3, Playwright).

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..', '..');
const runtimeSrc = join(packageRoot, '..', '..', 'runtimes', 'react', 'src', 'index.ts');
const goldenPath = join(repoRoot, 'fixtures', 'uir', 'layout_proof.ndjson');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'bridge.mjs');

const temporaries: string[] = [];
afterAll(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** Parses an NDJSON document the way the loader does — validating every line, never casting. */
function parse(document: string, label: string): AnyUirNode[] {
  return document
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseUirNode(JSON.parse(line), `${label}:${index + 1}`));
}

/**
 * The golden run through the **real compiler** (N1–N11), via the `bridge` CLI.
 *
 * Shelled, not imported: the generator does not depend on the compiler and must not start now, even in a
 * test — `bridge normalize` is the same entrypoint an author uses, so this exercises the contract as shipped.
 */
function compiled(): AnyUirNode[] {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-compile-'));
  temporaries.push(dir);
  const raw = join(dir, 'raw.ndjson');
  const out = join(dir, 'normalized.ndjson');
  writeFileSync(raw, readFileSync(goldenPath));
  execFileSync('node', [cli, 'normalize', raw, '--out', out], { stdio: 'pipe' });
  return parse(readFileSync(out, 'utf8'), 'normalized');
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

/**
 * A tsconfig for the check — not the one the app ships with.
 *
 * It maps the workspace packages by path so `tsc` resolves the *real* kit source rather than a stub, and
 * drops the `next` plugin, which is a language-server concern `tsc` ignores anyway.
 */
function writeCheckTsconfig(root: string): string {
  const path = join(root, 'tsconfig.check.json');
  writeFileSync(
    path,
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
  return path;
}

// One pass through the whole pipeline, shared by every assertion below.
const nodes = compiled();
const generated = reactGenerator.generate(harness(nodes).context);
const componentSource =
  generated.files.find((file) => file.path === 'src/components/home-screen.tsx')?.contents ?? '';

describe('the emitted project compiles against the real runtime (M3-D build-proof)', () => {
  it('the analyzer golden is the compiler’s output unchanged for this fixture', () => {
    // The fixture is pure layout plus a component signal; N1–N11 have nothing to rewrite in it. Stating it
    // makes the chain honest: the generator consumes exactly what the compiler produced.
    expect(nodes.map((n) => n.id).sort()).toEqual(parse(readFileSync(goldenPath, 'utf8'), 'golden').map((n) => n.id).sort());
  });

  it('Flutter → analyzer → compiler → generator → tsc', () => {
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    // Nothing in the fixture is outside the supported surface, so nothing may be refused. If this fires, the
    // generator is rejecting something it claims to support — or the analyzer drifted into a shape it cannot.
    expect(reported.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

    const root = materialise(files);
    const tsconfig = writeCheckTsconfig(root);
    const tsc = join(packageRoot, 'node_modules', '.bin', 'tsc');
    try {
      execFileSync(tsc, ['-p', tsconfig], { stdio: 'pipe', cwd: root });
    } catch (error) {
      const failure = error as { stdout?: Buffer; stderr?: Buffer };
      const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
      const dump = files.map((file) => `\n──── ${file.path}\n${file.contents}`).join('');
      expect.unreachable(`the emitted project does not typecheck:\n${output}\n${dump}`);
    }
  }, 120_000);

  // ── regressions on the real output — the three defects M3-D fixed, asserted where they lived ──

  it('B1 — a single-child wrapper renders its child as a `child` prop, never JSX children', () => {
    // `Center(child: …)` → the kit's `Center`, which reads `props.child`. Emitting `<Center><X/></Center>`
    // dropped the subtree at runtime and did not typecheck; the analyzer now keeps `child` a slot, and the
    // generator a `child={…}` prop.
    expect(componentSource).toMatch(/<Center child=\{/);
    expect(componentSource).toMatch(/<Padding [^>]*child=\{/);
    expect(componentSource).toMatch(/<SizedBox [^>]*child=\{/);
    // A single-child wrapper never takes JSX children — that was the B1 bug, and it dropped the subtree.
    expect(componentSource).not.toMatch(/<Center>/);
  });

  it('B1 — nested single-child wrappers compose', () => {
    expect(componentSource).toMatch(/<Center child=\{<Padding [^>]*child=\{<Column>/);
  });

  it('D1 — `\'use client\'` is the first line, before every import', () => {
    expect(componentSource.startsWith("'use client';")).toBe(true);
    const firstImport = componentSource.indexOf('import ');
    expect(firstImport).toBeGreaterThan(-1);
    expect(componentSource.indexOf("'use client';")).toBeLessThan(firstImport);
  });

  it('D2 — a kit value type used in the tree is imported, not left dangling', () => {
    expect(componentSource).toContain('EdgeInsets.all(16)');
    expect(componentSource).toMatch(/import \{[^}]*\bEdgeInsets\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  it('a component signal lives in the component and is read through the signal (ADR-15, ADR-4)', () => {
    // Declared through `useState`'s initialiser — never at module scope (INV-19) and never re-allocated each
    // render — and read through `.get()`, the reactive read, not the bare object (`[object Object]`).
    expect(componentSource).toMatch(/const \[_count\] = useState\(\(\) => signal\(3\)\)/);
    expect(componentSource).toContain('_count.get()');
  });
});
