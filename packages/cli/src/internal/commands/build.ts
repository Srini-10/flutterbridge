// `bridge build` and `bridge validate` — the whole pipeline, as one command.
//
// ## Why this exists separately from the stages
//
// A user does not want four commands. `build` is the one a person runs, and the four stages remain
// separately runnable because a person debugging wants to stop after one of them.
//
// It composes the stage functions rather than reimplementing them, so there is exactly one place that knows
// how to run the analyzer, one that knows how to load a generator, and one that knows how to write files.
//
// ## Progress reporting, and why it is on stderr
//
// Progress goes to stderr and results go to stdout. That is what makes `bridge build --json | jq` work while
// a human still sees what is happening — a progress line on stdout would corrupt the document that the same
// run is meant to produce.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PluginHost, Program, WidgetRegistry } from '@bridge/compiler';

import { bold, dim, green, json, red, yellow } from '../render.js';
import { CliError, normalize } from '../document.js';
import type { AnyUirNode } from '@bridge/uir';

import type { Args } from '../args.js';
import {
  analyze,
  generate,
  loadDocument,
  openProject,
  parseDocument,
  pluginBases,
  run,
  writeManifest,
} from './project.js';

/** One stage's outcome, for the summary and for `--json`. */
interface Stage {
  readonly name: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly detail: string;
}

/**
 * `bridge build` — analyze, normalize, generate, and typecheck.
 *
 * Stops at the first stage that fails. A build that carried on past a failing analyze would generate from a
 * document the analyzer refused, which is the "compiles around the holes" outcome the severity rule forbids.
 */
export async function build(from: string, args: Args): Promise<{ output: string; exitCode: number }> {
  const project = openProject(from, args);
  const quiet = args.flags.get('json') === true || args.flags.get('quiet') === true;
  const stages: Stage[] = [];

  const step = (name: string): void => {
    if (!quiet) process.stderr.write(`${dim('•')} ${name}\n`);
  };

  // ── analyze ──
  step('analyzing Flutter source');
  let started = Date.now();
  const analysis = await analyze(from, args);
  stages.push({
    name: 'analyze',
    ok: analysis.exitCode === 0,
    ms: Date.now() - started,
    detail: analysis.output.trim(),
  });
  if (analysis.exitCode !== 0) return finish(project.root, stages, args, analysis.exitCode);

  // ── normalize ──
  step('normalizing (N1–N11)');
  started = Date.now();
  const work = join(project.root, project.config.work);
  const raw = join(work, 'uir.ndjson');
  if (!existsSync(raw)) throw new CliError('the analyzer produced no document to normalize.', 3);

  // The same `normalize` the inspection commands use, which is the same `normalizationPipeline()` through
  // the same `PassManager` the compiler runs. One implementation, so `bridge build` and `bridge normalize`
  // cannot come to different conclusions about the same document.
  const host = await PluginHost.load(project.config.plugins, { from: pluginBases(project) });
  const widgets = WidgetRegistry.from(host.plugins);
  // Through the loader, so the manifest's schema/format/truncation refusals apply here too — see
  // `loadDocument`. `build` is the command most likely to meet a stale `.bridge/` document, because it
  // is the one people run without thinking about which stage produced what.
  const program = loadDocument(raw, relative(project.root, raw));
  const result = normalize(program, widgets);
  const blocking = result.diagnostics.filter((d) => d.severity === 'error');

  mkdirSync(work, { recursive: true });
  const normalized = join(work, 'normalized.ndjson');
  writeFileSync(normalized, result.program.toNdjson());
  // With its manifest, so the document `generate` prefers is as checkable as the one the analyzer
  // wrote. Without this, tampering with `uir.manifest.json` and running `generate` read a normalized
  // document nothing had vouched for — the loader's refusals held on one file in `.bridge/` and not
  // the other.
  writeManifest(normalized, result.program.nodes, result.diagnostics.length);

  stages.push({
    name: 'normalize',
    ok: blocking.length === 0,
    ms: Date.now() - started,
    detail:
      blocking.length === 0
        ? `${result.program.nodes.length} nodes`
        : blocking.map((d) => `${d.code}: ${d.message}`).join('\n'),
  });
  if (blocking.length > 0) return finish(project.root, stages, args, 1);

  // ── generate ──
  step('generating');
  started = Date.now();
  const generated = await generate(from, args);
  stages.push({
    name: 'generate',
    ok: generated.exitCode === 0,
    ms: Date.now() - started,
    detail: generated.output.trim(),
  });
  if (generated.exitCode !== 0) return finish(project.root, stages, args, generated.exitCode);

  // ── typecheck ──
  if (project.config.build.typecheck) {
    step('typechecking');
    started = Date.now();
    const out = join(project.root, project.config.out);

    // ## Why an uninstalled project is skipped rather than failed
    //
    // The emitted project is an ordinary npm project: it declares `react`, `next` and the runtime kit, and
    // *the user* installs them. Running `tsc` before that produces eighteen "cannot find module 'react'"
    // errors, which say nothing about the generated code and bury anything that would.
    //
    // So the precondition is checked directly. Reporting "dependencies are not installed, run npm install"
    // is both true and actionable, where reporting the module errors is technically true and useless. It is
    // **not** a suppressed failure: the stage says plainly that it did not run, and `bridge build` in an
    // installed project still typechecks for real.
    const installed = existsSync(join(out, 'node_modules'));
    const tsc = installed
      // `npx`, not `/usr/bin/env npx`: `/usr/bin/env` does not exist on Windows, and `run` now resolves
      // through a shell there so that `npx.cmd` is found at all.
      ? await run('npx', ['--no-install', 'tsc', '-p', 'tsconfig.json', '--noEmit'], out)
      : { code: 0, stdout: '', stderr: '' };
    const missingTsc =
      installed && (tsc.code === 127 || /could not determine executable|not found/i.test(tsc.stderr));
    const skipped = !installed || missingTsc;

    stages.push({
      name: 'typecheck',
      ok: skipped || tsc.code === 0,
      ms: Date.now() - started,
      detail: !installed
        ? `skipped — dependencies are not installed. Run \`npm install\` in ${project.config.out}, then build again.`
        : missingTsc
          ? 'skipped — no typescript in the emitted project'
          : tsc.code === 0
            ? 'clean'
            : `${tsc.stdout}${tsc.stderr}`.trim(),
    });
    if (!skipped && tsc.code !== 0) return finish(project.root, stages, args, 1);
  }

  return finish(project.root, stages, args, 0);
}

function finish(
  root: string,
  stages: readonly Stage[],
  args: Args,
  exitCode: number,
): { output: string; exitCode: number } {
  if (args.flags.get('json') === true) {
    return { output: json({ ok: exitCode === 0, stages }), exitCode };
  }

  const lines: string[] = [];
  for (const stage of stages) {
    const skipped = stage.detail.startsWith('skipped');
    const mark = skipped ? yellow('skip') : stage.ok ? green('ok  ') : red('fail');
    lines.push(`  ${mark} ${stage.name.padEnd(11)} ${dim(`${stage.ms}ms`)}`);
    if (!stage.ok && stage.detail !== '') {
      lines.push(...stage.detail.split('\n').map((line) => `       ${line}`));
    } else if (skipped) {
      lines.push(`       ${yellow(stage.detail.replace(/^skipped — /, ''))}`);
    } else if (stage.ok && stage.detail !== '' && stage.name !== 'analyze') {
      lines.push(`       ${dim(stage.detail.split('\n').slice(-1)[0] ?? '')}`);
    }
  }

  lines.push('');
  lines.push(exitCode === 0 ? green('build succeeded.') : red('build failed.'));
  void root;
  return { output: lines.join('\n'), exitCode };
}

/**
 * `bridge validate` — build, and then check the properties the compiler promises.
 *
 * Determinism and the normalization fixed point are **contracts**, not implementation details: a build that
 * is not reproducible cannot be reviewed, and a normalization that is not idempotent means an incremental
 * build and a clean one can disagree. They are checked here so a user can check them, rather than only in
 * this repository's own tests.
 */
export async function validate(from: string, args: Args): Promise<{ output: string; exitCode: number }> {
  const project = openProject(from, args);
  const built = await build(from, args);
  if (built.exitCode !== 0) return built;

  const work = join(project.root, project.config.work);
  const raw = join(work, 'uir.ndjson');
  const host = await PluginHost.load(project.config.plugins, { from: pluginBases(project) });
  const widgets = WidgetRegistry.from(host.plugins);
  const nodes = loadDocument(raw, 'uir.ndjson').nodes;

  // `toNdjson()`, not a hand-rolled `JSON.stringify` over `nodes`. The canonical serializer is what the
  // `normalize` command writes and what every hash in this project's reports is taken over; a second
  // serializer here compared two documents that were byte-different and semantically identical, and
  // reported "a compiler property does not hold" — which is the one thing a validator must never get wrong.
  const once = (input: readonly AnyUirNode[]): string =>
    normalize(Program.of(input), widgets).program.toNdjson();

  const first = once(nodes);
  const second = once(nodes);
  const again = once(parseDocument(`${first}\n`, 'normalized'));

  const checks = [
    { name: 'deterministic', ok: first === second, detail: 'two runs over the same input agree' },
    { name: 'fixed point', ok: first === again, detail: 'normalize(normalize(x)) == normalize(x)' },
  ];

  if (args.flags.get('json') === true) {
    return { output: json({ ok: checks.every((c) => c.ok), checks }), exitCode: checks.every((c) => c.ok) ? 0 : 1 };
  }

  const lines = [
    built.output,
    '',
    bold('properties'),
    ...checks.map((c) => `  ${c.ok ? green('ok  ') : red('fail')} ${c.name.padEnd(14)} ${dim(c.detail)}`),
  ];
  const ok = checks.every((c) => c.ok);
  lines.push('', ok ? green('validated.') : red('a compiler property does not hold — please report this.'));
  return { output: lines.join('\n'), exitCode: ok ? 0 : 1 };
}
