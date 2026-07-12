// @bridge/cli — The `bridge` command surface. Contains no compilation logic (INV-17).
//
// BRIDGE-STUB(M2): commands analyze | build | verify, --json output schemas, exit codes 0/1/2/3. See Blueprint §3 M2-T21.
//
// ## What is here today: the debugging surface
//
// Nine commands for **looking at what the compiler did**. Every one loads a document through
// `@bridge/compiler`'s own loader and, where it needs a normalized program, runs the real
// `normalizationPipeline()` through the real `PassManager`. None re-derives a compiler fact:
// `route-graph` *is* `navGraph()`, `graph` *is* `referencesOf()`, and `explain` recomputes a node id
// with the generated `nodeIdOfContent` and checks it against the stored one.
//
// That constraint is not fastidiousness. A debugger that computes its own answer will eventually
// disagree with the compiler, and on that day it will send someone hunting a bug that does not exist
// while the real one goes unnoticed. These tools are a window, not a second opinion.
//
// **None of them can change how anything compiles.** No command mutates a document in place, and
// `normalize` — the only one that writes at all — writes a new file.
//
// `analyze`, `build` and `verify` (the *production* surface) remain unimplemented; see the stub above.

import { LoadError, PluginError } from '@bridge/compiler';

import { parseArgs, UsageError, type Args } from './internal/args.js';
import { CliError, openDocument } from './internal/document.js';
import { diagnostics, explain, normalizeCommand, stats } from './internal/commands/pipeline.js';
import { graph, inspect, routeGraph, signalGraph, widgetTree } from './internal/commands/views.js';
import { bold, dim } from './internal/render.js';

const USAGE = `${bold('bridge')} — inspect what the compiler did.

${bold('usage')}  bridge <command> <document.ndjson> [options]

${bold('commands')}
  inspect        what the document contains: nodes by layer and kind, and its manifest
  graph          the reference graph — every node and every id it points at
  widget-tree    the UI tree of every component, drawn
  route-graph    the routes, what each renders, and every transition between them
  signal-graph   every signal, who writes it, and who reads it
  normalize      run N1..N11 and write the normalized document
  diagnostics    run N1..N11 and report everything the passes said
  explain        one node in full: source, identity, edges, and its fate in each pass
  stats          where the time goes, pass by pass

${bold('options')}
  --normalized       run N1..N11 before looking (default: the document as the analyzer emitted it)
  --json             machine-readable output
  --dot              graphviz output (graph only)
  --verbose          list every node a diagnostic fired on (diagnostics only)
  --out <path>       where to write (normalize only; default stdout)
  --manifest <path>  the manifest (default: <document>.manifest.json)
  --plugin <spec>    widget catalogs to load, comma-separated (default: @bridge/widgets-material)

${dim('These tools are for debugging. None of them changes how anything compiles.')}
`;

/** Runs [argv] (without node and script). Returns the process exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }

  if (args.command === '' || args.command === 'help' || args.flags.has('help')) {
    process.stdout.write(USAGE);
    return args.command === '' ? 2 : 0;
  }

  try {
    const doc = await openDocument(args);

    switch (args.command) {
      case 'inspect':
        return say(inspect(doc, args));
      case 'graph':
        return say(graph(doc, args));
      case 'widget-tree':
        return say(widgetTree(doc, args));
      case 'route-graph':
        return say(routeGraph(doc, args));
      case 'signal-graph':
        return say(signalGraph(doc, args));
      case 'normalize':
        return say(normalizeCommand(doc, args));
      case 'stats':
        return say(stats(doc, args));
      case 'explain':
        return say(explain(doc, args));
      case 'diagnostics': {
        const result = diagnostics(doc, args);
        say(result.output);
        return result.exitCode;
      }
      default:
        process.stderr.write(`unknown command: ${args.command}\n\n${USAGE}`);
        return 2;
    }
  } catch (error) {
    return fail(error);
  }
}

function say(output: string): number {
  if (output !== '') process.stdout.write(`${output}\n`);
  return 0;
}

/**
 * Turns a failure into an exit code.
 *
 * `3` is the compiler's own code for **an input it refuses to work with** (INV-5) — a document from a
 * foreign schema, a catalog that would not resolve. It is not the same as `2`, "the command was wrong",
 * and conflating them would teach a script to retry something that can never work.
 */
function fail(error: unknown): number {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    return error.exitCode;
  }
  if (error instanceof LoadError || error instanceof PluginError) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 3;
  }
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  throw error;
}
