// @bridge/cli — The `bridge` command surface. Contains no compilation logic (INV-17).
//
// ## Two surfaces, one rule
//
// **The production surface** (`init`, `doctor`, `analyze`, `generate`, `build`, `validate`, `clean`) takes a
// Flutter project to an emitted application. It arrived in M5-B and retired the M2 stub tag this file
// carried from M0 — until then the pipeline had no public entry point at all, and every milestone drove it
// through tests and one-off harnesses. M5-A's report made the cost concrete.
//
// **The debugging surface** (below) looks at what the compiler did.
//
// Neither contains compilation logic. The production commands delegate: the analyzer is a separate program
// in a separate language (ADR-2), normalization is the real `normalizationPipeline()` through the real
// `PassManager`, and the generator is loaded through `PluginHost` exactly the way a third-party one would be
// (Spec §1.2 rule 3). Writing files is the CLI's job precisely *because* ADR-22 forbids the generator from
// touching disk.
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
// They are a window, not a second opinion — and they are still the only commands that can tell you *why*
// a build did what it did.


import { LoadError, PluginError } from '@bridge/compiler';

import { parseArgs, UsageError, type Args } from './internal/args.js';
import { CliError, openDocument } from './internal/document.js';
import { build, validate } from './internal/commands/build.js';
import { diagnostics, explain, normalizeCommand, stats } from './internal/commands/pipeline.js';
import { analyze, clean, doctor, generate, init } from './internal/commands/project.js';
import { graph, inspect, routeGraph, signalGraph, widgetTree } from './internal/commands/views.js';
import { bold, dim } from './internal/render.js';
import { VERSION } from './internal/analyzer.js';


const USAGE = `${bold('bridge')} — compile a Flutter application to another target.

${bold('usage')}  bridge <command> [options]

${bold('getting started')}
  init           write a bridge.json you can edit
  doctor         check this machine can build, and say what to fix
  build          analyze, normalize, generate, typecheck
  validate       build, then check determinism and the normalization fixed point

${bold('stages')}  ${dim('each one runs on its own, for when a build stops somewhere')}
  analyze        run the analyzer over the Flutter project and write UIR
  generate       normalize and emit the target project
  clean          remove generated output and intermediate documents

${bold('inspect')}  ${dim('what the compiler did — takes a document, changes nothing')}
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
  --json             machine-readable output
  --config <path>    the configuration file (default: the nearest bridge.json)
  --quiet            no progress reporting (build only)
  --force            overwrite (init only)
  --normalized       run N1..N11 before looking (inspection commands)
  --dot              graphviz output (graph only)
  --verbose          list every node a diagnostic fired on (diagnostics only)
  --out <path>       where to write (normalize only; default stdout)
  --manifest <path>  the manifest (default: <document>.manifest.json)
  --plugin <spec>    widget catalogs to load, comma-separated (default: @bridge/widgets-material)

${bold('exit codes')}
  0 success   1 the program is not fit to build   2 the command was wrong   3 an input was refused

${dim('docs  https://github.com/flutterbridge/flutterbridge#readme')}
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

  const cwd = process.cwd();
  try {
    // The production surface works on a *project*; the inspection surface works on a *document*. Splitting
    // here keeps a document from being opened for a command that has none to open.
    switch (args.command) {
      case 'version':
        process.stdout.write(`${VERSION}\n`);
        return 0;
      case 'init':
        return report(init(cwd, args));
      case 'doctor':
        return report(await doctor(cwd, args));
      case 'analyze':
        return report(await analyze(cwd, args));
      case 'generate':
        return report(await generate(cwd, args));
      case 'build':
        return report(await build(cwd, args));
      case 'validate':
        return report(await validate(cwd, args));
      case 'clean':
        return report(clean(cwd, args));
      default:
        break;
    }

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

/** Prints a command's output and returns its exit code. */
function report(result: { output: string; exitCode: number }): number {
  if (result.output !== '') {
    const stream = result.exitCode === 0 ? process.stdout : process.stderr;
    stream.write(`${result.output}\n`);
  }
  return result.exitCode;
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
