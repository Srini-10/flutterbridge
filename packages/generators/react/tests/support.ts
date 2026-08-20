import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic, GeneratorContext, ProgramView, WidgetCatalog } from '@bridge/plugin-sdk';
import { parseUirNode, type AnyUirNode, type NodeId } from '@bridge/uir';

// Test support.
//
// ## Why this builds its own ProgramView instead of importing the compiler's Program
//
// It could not import it if it wanted to — `.dependency-cruiser.cjs` forbids the plugin realm from reaching
// `@bridge/compiler`, and while `tests/` is excluded from the cruise, a devDependency on the compiler would
// invert the layering the rule exists to protect and would make this package unbuildable without it.
//
// So the tests do what the SPI says a host does: hand the generator a `ProgramView` over `AnyUirNode[]`. That
// this is possible *at all* using only `@bridge/uir` is itself the point ADR-22 was arguing — and it is the
// cheapest available check that the SPI does not secretly depend on the compiler.

/** A `ProgramView` over nodes in hand. The compiler's `Program` satisfies the same interface (ADR-22). */
export function programOf(nodes: readonly AnyUirNode[]): ProgramView {
  const byId = new Map<NodeId, AnyUirNode>();
  for (const node of nodes) byId.set(node.id, node);
  // Canonical order — kind, then id — which is what the compiler guarantees and every emitter relies on.
  const ordered = [...nodes].sort((a, b) => (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind < b.kind ? -1 : 1));
  return {
    nodes: ordered,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    ofKind: <K extends AnyUirNode['kind']>(kind: K) =>
      ordered.filter((node): node is Extract<AnyUirNode, { kind: K }> => node.kind === kind),
  };
}

/** Parses an NDJSON document the way the loader does: validating every line, never casting. */
export function parseNdjson(document: string): AnyUirNode[] {
  return document
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseUirNode(JSON.parse(line), `line ${index + 1}`));
}

/** The empty catalog. Widget facts only matter where a test exercises slots. */
export const NO_WIDGETS: WidgetCatalog = { name: 'test', priority: 0, widgets: [] };

/** A context, and the diagnostics it collected. */
export interface Harness {
  readonly context: GeneratorContext;
  readonly reported: Diagnostic[];
}

/** Builds a `GeneratorContext` over `nodes`. */
export function harness(
  nodes: readonly AnyUirNode[],
  inherited: readonly Diagnostic[] = [],
): Harness {
  const reported: Diagnostic[] = [];
  return {
    reported,
    context: {
      program: programOf(nodes),
      widgets: NO_WIDGETS,
      diagnostics: inherited,
      report: (diagnostic) => reported.push(diagnostic),
    },
  };
}

/** The real hello_bridge document, normalized — minted by `bridge_analyzer` from `fixtures/apps/hello_bridge`. */
export function helloBridge(): AnyUirNode[] {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/hello_bridge.normalized.ndjson', import.meta.url));
  return parseNdjson(readFileSync(path, 'utf8'));
}

/**
 * The real `examples/counter` document, normalized — minted by `bridge_analyzer` from the example app.
 *
 * The subject of the browser suite, and therefore the right fixture for the defects that suite found: a
 * hand-authored node graph would assert about a program shape the compiler does not actually produce, and
 * both M5-D defects were in the gap between "the emitter handles this node" and "the app it produces runs".
 */
export function counter(): AnyUirNode[] {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/counter.normalized.ndjson', import.meta.url));
  return parseNdjson(readFileSync(path, 'utf8'));
}

/** The file at `path` in an emitted project, or `undefined`. */
export function fileAt(files: readonly { path: string; contents: string }[], path: string): string | undefined {
  return files.find((file) => file.path === path)?.contents;
}

// ── the real build-proof pipeline (M3-D, extended M7-F) ─────────────────────────────────────────────
//
// Shared by every test that needs the whole chain — Flutter source → analyzer → `bridge normalize` →
// generator → `tsc` — over a committed, analyzer-produced golden. One copy, so a fixture beyond
// `layout_proof.ndjson` (M7-F's `promoted_counter.normalized.ndjson`) does not re-derive the tricky half
// of this: the check-only tsconfig that resolves the kit's real source and `tsc.js` directly, not the
// shell-script shim that fails silently on Windows (see `build.test.ts`'s own comment on that, kept
// there rather than duplicated here).

const here = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..', '..');
const runtimeSrc = join(packageRoot, '..', '..', 'runtimes', 'react', 'src', 'index.ts');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'bridge.mjs');

const temporaries: string[] = [];

/** Removes every temporary directory this module created. Call once, from the caller's own `afterAll`. */
export function cleanupBuildProofTemporaries(): void {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
  temporaries.length = 0;
}

/**
 * Runs `golden` — a raw, analyzer-produced NDJSON document — through the real compiler (N1–N11), via the
 * `bridge` CLI. Shelled, not imported: the generator does not depend on the compiler and must not start
 * now, even in a test — `bridge normalize` is the same entry point an author uses.
 */
export function compiledFrom(golden: string): AnyUirNode[] {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-compile-'));
  temporaries.push(dir);
  const raw = join(dir, 'raw.ndjson');
  const out = join(dir, 'normalized.ndjson');
  writeFileSync(raw, golden);
  execFileSync('node', [cli, 'normalize', raw, '--out', out], { stdio: 'pipe' });
  return parseNdjson(readFileSync(out, 'utf8'));
}

/** Writes the emitted project to a temp directory and returns its root. */
export function materialise(files: readonly { path: string; contents: string }[]): string {
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
export function writeCheckTsconfig(root: string): string {
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

/**
 * Type-checks the emitted `files` against the real runtime kit. Throws (via `expect.unreachable`,
 * imported by the caller) with the compiler's own output and a dump of every file, on failure.
 *
 * **`node typescript/lib/tsc.js`, not the `.bin/tsc` shim.** The shim is a shell script on Windows, and
 * the executable npm writes beside it is `tsc.cmd` — which `execFileSync` also refuses, because Node
 * blocks `.bat`/`.cmd` without `shell: true` (the CVE-2024-27980 mitigation). `tsc.js` is a plain
 * JavaScript entry point; running it with the Node already executing the test needs no shim, no shell
 * and no quoting, and behaves identically on every platform.
 */
export function typecheckEmitted(files: readonly { path: string; contents: string }[]): void {
  const root = materialise(files);
  const tsconfig = writeCheckTsconfig(root);
  const tsc = join(packageRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
  try {
    execFileSync(process.execPath, [tsc, '-p', tsconfig], { stdio: 'pipe', cwd: root });
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
    const dump = files.map((file) => `\n──── ${file.path}\n${file.contents}`).join('');
    throw new Error(`the emitted project does not typecheck:\n${output}\n${dump}`);
  }
}

/** The real `fixtures/apps/promoted_counter` document, raw analyzer output (M7-F) — not yet normalized. */
export function promotedCounterRaw(): string {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/promoted_counter.ndjson', import.meta.url));
  return readFileSync(path, 'utf8');
}

/** The real `fixtures/apps/inline_push_props` document, raw analyzer output (M7-G) — not yet normalized. */
export function inlinePushPropsRaw(): string {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/inline_push_props.ndjson', import.meta.url));
  return readFileSync(path, 'utf8');
}

/** The real `fixtures/apps/async_push_guard` document, raw analyzer output (M7-H) — not yet normalized. */
export function asyncPushGuardRaw(): string {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/async_push_guard.ndjson', import.meta.url));
  return readFileSync(path, 'utf8');
}

/** The real `fixtures/apps/local_store` document, raw analyzer output (M7-N) — not yet normalized. */
export function localStoreRaw(): string {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/local_store.ndjson', import.meta.url));
  return readFileSync(path, 'utf8');
}

/** The real `fixtures/apps/structured_build` document, raw analyzer output (M8-B) — not yet normalized. */
export function structuredBuildRaw(): string {
  const path = fileURLToPath(new URL('../../../../fixtures/uir/structured_build.ndjson', import.meta.url));
  return readFileSync(path, 'utf8');
}
