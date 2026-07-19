// Loading a document, exactly the way the compiler loads it.
//
// **The CLI contains no compilation logic (INV-17).** Every command here reads a document through
// `@bridge/compiler`'s own loader, normalizes it through the real `PassManager` with the real
// `normalizationPipeline()`, and reports what it saw. Nothing in this package may compute what a
// compiler output *would* be — if a tool disagreed with the compiler, the tool would be a lie, and a
// debugger that lies is worse than no debugger.

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  load,
  navGraph,
  normalizationPipeline,
  PassManager,
  PluginHost,
  Program,
  WidgetRegistry,
  type Diagnostic,
  type Manifest,
  type NavGraph,
  type NormalizationManifest,
} from '@bridge/compiler';
import { UIR_SCHEMA_HASH, UIR_VERSION } from '@bridge/uir';

import { flag, value, type Args } from './args.js';

/** The catalog the compiler loads by default. Never statically imported — the host resolves it. */
const DEFAULT_PLUGIN = '@bridge/widgets-material';

/** A loaded document, and everything a command may want to know about it. */
export interface Document {
  readonly path: string;
  readonly program: Program;
  readonly manifest: Manifest | undefined;
  readonly widgets: WidgetRegistry;
  /** Whether [program] has been through N1..N11. */
  readonly normalized: boolean;
}

/** The manifest that accompanies [documentPath] — the analyzer's convention (`RecordWriter`). */
export function manifestPathFor(documentPath: string): string {
  const base = basename(documentPath, extname(documentPath));
  return join(dirname(documentPath), `${base}.manifest.json`);
}

/**
 * Reads the document named by [args], and normalizes it when `--normalized` was asked for.
 *
 * The default is the document **as the analyzer emitted it**. That is the honest default for a
 * debugger: it shows you what is actually on disk, not what the compiler would like it to be. Pass
 * `--normalized` to see it after N1..N11.
 */
export async function openDocument(args: Args): Promise<Document> {
  const path = args.positionals[0];
  if (path === undefined) throw new CliError('a document path is required', 2);
  if (!existsSync(path)) throw new CliError(`no such document: ${path}`, 2);

  const manifestPath = value(args, 'manifest') ?? manifestPathFor(path);
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
    : undefined;

  // Resolved from the working directory first, then from this package — the same bases the production
  // commands use (`pluginBases`). M5-B fixed the production path and left this one calling the bare
  // form, which resolves relative to `@bridge/compiler` and therefore finds only plugins the compiler
  // itself depends on. In a checkout that difference is invisible; in an install it means
  // `bridge inspect --plugin <my-catalog>` cannot see a catalog that `bridge build` loads fine.
  const specifiers = (value(args, 'plugin') ?? DEFAULT_PLUGIN).split(',').filter(Boolean);
  const host = await PluginHost.load(specifiers, {
    from: [process.cwd(), fileURLToPath(new URL('../', import.meta.url))],
  });
  const widgets = WidgetRegistry.from(host.plugins);

  const loaded = load(readFileSync(path, 'utf8'), manifest);
  if (!flag(args, 'normalized')) {
    return { path, program: loaded, manifest, widgets, normalized: false };
  }

  return { path, program: normalize(loaded, widgets).program, manifest, widgets, normalized: true };
}

/** Runs the real pipeline. The same `PassManager`, the same passes, in the same order. */
export function normalize(
  program: Program,
  widgets: WidgetRegistry,
): { program: Program; diagnostics: readonly Diagnostic[]; manifest: NormalizationManifest } {
  return new PassManager(normalizationPipeline()).run(program, {
    uirVersion: UIR_VERSION,
    schemaHash: UIR_SCHEMA_HASH,
    widgets,
  });
}

/** The nav-graph of [program] — the compiler's own analysis, not a re-derivation. */
export function navigation(program: Program): NavGraph {
  return navGraph(program);
}

/** A failure with an exit code. 2 = the command was wrong; 3 = the input was unfit (INV-5). */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}
