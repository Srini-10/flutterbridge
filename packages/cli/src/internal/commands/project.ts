// The **production** command surface — the path from a Flutter project to an emitted application.
//
// ## What this retires
//
// `index.ts` carried `BRIDGE-STUB(M2): commands analyze | build | verify` from M0 to M5-A. Until now every
// milestone drove the pipeline through tests and one-off harnesses, and there was **no public entry point
// that went from Flutter source to a project**. M5-A's report made the cost concrete: validating two real
// applications meant writing a bespoke harness for each stage.
//
// ## INV-17 still holds: there is no compilation logic here
//
// Every stage is delegated:
//
//   * `analyze` spawns the Dart analyzer, which is a separate program in a separate language (ADR-2).
//   * `normalize` runs the real `normalizationPipeline()` through the real `PassManager`.
//   * `generate` loads the generator through `PluginHost`, exactly the way a third-party one loads
//     (Spec §1.2 rule 3), and calls the pure `generate` ADR-22 specifies.
//   * writing files is the CLI's job precisely *because* ADR-22 forbids the generator from touching disk.
//
// Nothing here decides what a widget means, what a pass does, or what a diagnostic says.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { CONFIG_FILES, defaultConfigDocument, parseConfig, type BridgeConfig } from '@bridge/core';
import {
  load,
  LoadError,
  parseNdjson,
  PluginHost,
  Program,
  WidgetRegistry,
  type Manifest,
} from '@bridge/compiler';
import type { Diagnostic, EmittedFile, GeneratorContext, ProgramView } from '@bridge/plugin-sdk';
import { UIR_SCHEMA_HASH, UIR_VERSION, type AnyUirNode, type NodeId } from '@bridge/uir';

import { bold, cyan, dim, green, json, red, yellow } from '../render.js';
import { CliError, manifestPathFor, normalize } from '../document.js';
import { value, type Args } from '../args.js';
import {
  command,
  isResolved,
  isWritable,
  locate,
  packageOf,
  packageRoot,
  VERSION,
  type Analyzer,
} from '../analyzer.js';

/** Where a project's configuration was found, and what it says. */
export interface Project {
  /** The directory holding the configuration file. Every relative path resolves against it. */
  readonly root: string;
  /** The configuration file's path, or `undefined` when defaults are in use. */
  readonly file: string | undefined;
  /** The configuration. */
  readonly config: BridgeConfig;
}

/**
 * Finds and reads the project configuration.
 *
 * Searches upward from [from], the way every tool a developer already uses does — so `bridge build` works
 * from a subdirectory, which is where people actually are.
 *
 * **A missing file is not an error.** The defaults are chosen so that a Flutter project with no
 * configuration at all compiles; requiring a file to do nothing would be requiring ceremony. A file that
 * *exists* and is wrong is a different matter and is reported.
 */
export function openProject(from: string, args: Args): Project {
  const override = value(args, 'config');
  if (override !== undefined) {
    const file = resolve(from, override);
    if (!existsSync(file)) {
      throw new CliError(`no configuration at ${relative(from, file) || file}.`, 2);
    }
    return read(file);
  }

  let dir = resolve(from);
  for (;;) {
    for (const name of CONFIG_FILES) {
      const file = join(dir, name);
      if (existsSync(file)) return read(file);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { root: resolve(from), file: undefined, config: parseConfig({}).config };
}

function read(file: string): Project {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new CliError(`${file} is not valid JSON: ${(cause as Error).message}`, 2);
  }
  const { config, problems } = parseConfig(document);
  if (problems.length > 0) {
    const lines = problems.map((p) => `  ${p.key === '' ? '(root)' : bold(p.key)}: ${p.message}`);
    throw new CliError(`${file} has ${problems.length} problem(s):\n${lines.join('\n')}`, 2);
  }
  return { root: dirname(file), file, config };
}

/** A path from the configuration, resolved against the project root. */
function at(project: Project, path: string): string {
  return isAbsolute(path) ? path : resolve(project.root, path);
}

/**
 * A path as a person would want to read it.
 *
 * Relative when that is shorter — `build/bridge` beats a full home directory — and absolute when it is not.
 * A relative path that climbs out of the project reads as `../../../../../../../Users/…`, which is strictly
 * worse than the absolute path it is derived from, and that is exactly what `doctor` printed for the
 * analyzer on the first run of this command.
 */
function shown(project: Project, path: string): string {
  const rel = relative(project.root, path);
  return rel !== '' && !rel.startsWith('..') ? rel : path;
}

/**
 * Where plugin specifiers are resolved from, in order.
 *
 * The **project** first, so a project that installs its own generator or catalog gets the one it installed.
 * Then the CLI's own directory, so the first-party generator works with nothing installed at all — which is
 * what makes `bridge init && bridge build` a two-command getting-started rather than a four-command one.
 */
export function pluginBases(project: Project): readonly string[] {
  return [project.root, packageRoot()];
}

// ## Why `@bridge/cli` *depends on* the default generator and catalog
//
// A clean `npm install -g @bridge/cli` used to fail `doctor` on two checks — `@bridge/gen-react` and
// `@bridge/widgets-material` were devDependencies, so a global install had neither, and the default
// configuration names both. `bridge build` could not work out of the box.
//
// They are runtime dependencies now, and that is not a retreat from Spec §1.2 rule 3. The rule forbids
// the compiler from *statically importing* a plugin, and it still does not: everything above is loaded
// through `PluginHost` at runtime, resolved by specifier, exactly as a third-party generator is. What
// changed is only whether the default one is present on disk.
//
// The distinction that makes this correct is which package holds the dependency. **`@bridge/compiler`
// is a library and must not know that `gen-react` exists** — that is rule 3's actual subject, and M5-B
// found the compiler was violating it in the resolution layer. **`@bridge/cli` is an application**, and
// an application shipping working defaults is not coupling, it is the product. `pluginBases` puts the
// *project* ahead of this package, so a user who installs their own generator gets theirs; the bundled
// pair is a fallback, not a fixture.

// ── init ──────────────────────────────────────────────────────────────────────────────────────────

/** `bridge init` — writes a configuration file. */
export function init(from: string, args: Args): { output: string; exitCode: number } {
  const file = join(resolve(from), CONFIG_FILES[0]!);
  if (existsSync(file) && args.flags.get('force') !== true) {
    return {
      output: `${yellow('exists')} ${relative(resolve(from), file)}\n${dim('  pass --force to overwrite it.')}`,
      exitCode: 0,
    };
  }

  writeFileSync(file, defaultConfigDocument());

  // A `pubspec.yaml` beside it is what makes the defaults correct. Saying so is more useful than assuming
  // it: a user running `init` in the wrong directory finds out now rather than at `analyze`.
  const pubspec = existsSync(join(resolve(from), 'pubspec.yaml'));
  const note = pubspec
    ? `${dim('  a Flutter project is here, so the defaults are ready to use.')}`
    : `${yellow('  no pubspec.yaml here')} — set ${bold('source')} to the Flutter project directory.`;

  return {
    output: [
      `${green('created')} ${relative(resolve(from), file)}`,
      note,
      '',
      `${bold('next')}  bridge doctor    ${dim('check the toolchain')}`,
      `      bridge build     ${dim('analyze, normalize, generate, typecheck')}`,
    ].join('\n'),
    exitCode: 0,
  };
}

// ── doctor ────────────────────────────────────────────────────────────────────────────────────────

/** One thing `doctor` checked. */
interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  /** What to do about it. Empty when there is nothing to do. */
  readonly fix: string;
}

/**
 * `bridge doctor` — reports whether this machine can run a build, and what to do when it cannot.
 *
 * Every check names the thing it needs and how to get it. A doctor that says "not found" and stops has
 * moved the problem rather than solved it.
 */
export async function doctor(from: string, args: Args): Promise<{ output: string; exitCode: number }> {
  const project = openProject(from, args);
  const checks: Check[] = [];

  checks.push({
    name: 'configuration',
    ok: true,
    detail: project.file === undefined ? 'defaults (no bridge.json)' : shown(project, project.file),
    fix: project.file === undefined ? 'run `bridge init` to write one you can edit' : '',
  });

  // A `bridge.yaml` is read by nothing. Saying so is the point: a silently ignored configuration file is
  // the worst outcome, because the user believes they have configured something.
  const yaml = join(project.root, 'bridge.yaml');
  if (existsSync(yaml)) {
    checks.push({
      name: 'bridge.yaml',
      ok: false,
      detail: 'present, and not read',
      fix: 'FlutterBridge reads bridge.json. Convert it, or delete it to avoid confusion.',
    });
  }

  const source = at(project, project.config.source);
  const pubspec = join(source, 'pubspec.yaml');
  checks.push({
    name: 'Flutter project',
    ok: existsSync(pubspec),
    detail: existsSync(pubspec) ? shown(project, pubspec) : `no pubspec.yaml in ${project.config.source}`,
    fix: existsSync(pubspec) ? '' : 'set `source` in bridge.json to the directory holding pubspec.yaml',
  });

  const packageConfig = join(source, '.dart_tool', 'package_config.json');
  checks.push({
    name: 'resolved packages',
    ok: existsSync(packageConfig),
    detail: existsSync(packageConfig) ? '.dart_tool/package_config.json' : 'not resolved',
    fix: existsSync(packageConfig)
      ? ''
      : 'run `flutter pub get` in the project — the analyzer reads the resolved package graph',
  });

  const dart = await which('dart');
  checks.push({
    name: 'Dart SDK',
    ok: dart !== undefined,
    detail: dart ?? 'not on PATH',
    fix: dart === undefined ? 'install Flutter (which bundles Dart), or add dart to PATH' : '',
  });

  // Three separate questions with three separate fixes: is it there, are its dependencies resolved,
  // and can it be resolved here. Collapsing them into one "analyzer: not found" — which is what M5-B
  // shipped — reports the wrong problem for two of the three.
  const analyzer = locate(project.root);
  checks.push({
    name: 'analyzer',
    ok: analyzer !== undefined,
    detail:
      analyzer === undefined
        ? 'not found'
        : `${shown(project, analyzer.entry)} ${dim(`(${analyzer.origin}, ${analyzer.form})`)}`,
    fix:
      analyzer === undefined
        ? 'reinstall @bridge/cli, or set BRIDGE_ANALYZER to bridge_analyzer’s entry point'
        : '',
  });

  if (analyzer !== undefined) {
    const resolved = isResolved(analyzer);
    checks.push({
      name: 'analyzer packages',
      ok: resolved || isWritable(analyzer),
      detail: resolved ? 'resolved' : 'not resolved yet — the first analyze will resolve them',
      fix:
        resolved || isWritable(analyzer)
          ? ''
          : `${packageOf(analyzer) ?? 'the analyzer directory'} is not writable; run \`dart pub get\` there, or set BRIDGE_ANALYZER to a copy you own`,
    });
  }

  const generator = await probePlugin(project.config.generator, pluginBases(project));
  checks.push({
    name: 'generator',
    ok: generator === undefined,
    detail: generator === undefined ? project.config.generator : generator,
    fix: generator === undefined ? '' : `install ${project.config.generator}, or change \`generator\``,
  });

  for (const specifier of project.config.plugins) {
    const problem = await probePlugin(specifier, pluginBases(project));
    checks.push({
      name: 'catalog',
      ok: problem === undefined,
      detail: problem === undefined ? specifier : problem,
      fix: problem === undefined ? '' : `install ${specifier}, or remove it from \`plugins\``,
    });
  }

  if (args.flags.get('json') === true) {
    return {
      output: json({ checks: checks.map(({ name, ok, detail, fix }) => ({ name, ok, detail, fix })) }),
      exitCode: checks.every((c) => c.ok) ? 0 : 1,
    };
  }

  const lines = checks.map((check) => {
    const mark = check.ok ? green('ok  ') : red('fail');
    const fix = check.ok || check.fix === '' ? '' : `\n     ${dim('→')} ${check.fix}`;
    return `  ${mark} ${check.name.padEnd(18)} ${dim(check.detail)}${fix}`;
  });
  const failed = checks.filter((c) => !c.ok).length;
  return {
    output: [
      `${bold('bridge doctor')}`,
      '',
      ...lines,
      '',
      failed === 0 ? green('ready to build.') : red(`${failed} problem(s) — fix them and run again.`),
    ].join('\n'),
    exitCode: failed === 0 ? 0 : 1,
  };
}

/** The message explaining why [specifier] cannot be loaded, or `undefined` when it can. */
async function probePlugin(specifier: string, from: readonly string[]): Promise<string | undefined> {
  try {
    await PluginHost.load([specifier], { from });
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * Where [program] is, or `undefined`.
 *
 * `where` on Windows, `which` everywhere else — they are different programs with the same job, and
 * neither exists on the other platform. This previously ran `/usr/bin/env which`, which fails twice over
 * on Windows: `/usr/bin/env` is not a path that exists there, and `which` is not a command. `doctor`'s
 * "Dart SDK" check therefore reported *not on PATH* on every Windows machine, including ones with Flutter
 * correctly installed — a diagnostic that is not merely unhelpful but actively misleading.
 *
 * `where` prints every match, one per line; the first is the one that would run.
 */
async function which(program: string): Promise<string | undefined> {
  const windows = process.platform === 'win32';
  const result = await run(windows ? 'where' : 'which', [program], process.cwd());
  if (result.code !== 0) return undefined;
  const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '');
  return first === '' ? undefined : first;
}

/**
 * Resolves the analyzer's own dependencies, once.
 *
 * The shipped analyzer is Dart source with no `.dart_tool/` — see `analyzer.ts` for why it cannot be
 * shipped resolved. So the first `analyze` on a new machine runs `dart pub get`, exactly as a cloned
 * Dart project would, and every run after it finds the resolution already there.
 *
 * This is *not* a hidden install step that changes what is compiled: `pubspec.lock` ships with the
 * source, so the resolution is the one this repository tested rather than whatever is newest today.
 */
async function ensureResolved(analyzer: Analyzer): Promise<void> {
  if (isResolved(analyzer)) return;

  const pkg = packageOf(analyzer);
  if (pkg === undefined) return;

  if (!isWritable(analyzer)) {
    throw new CliError(
      `the analyzer at ${pkg} needs its dependencies resolved, and that directory is not writable.\n` +
        `  ${dim('→')} run \`dart pub get\` there yourself, or set BRIDGE_ANALYZER to a copy you own.`,
      3,
    );
  }

  process.stderr.write(`${dim('•')} resolving analyzer dependencies (first run only)\n`);
  const result = await run('dart', ['pub', 'get'], pkg);
  if (result.code !== 0) {
    throw new CliError(
      `the analyzer's dependencies could not be resolved.\n${result.stderr.trim()}\n` +
        `  ${dim('→')} this needs network access the first time. Check connectivity and run again.`,
      3,
    );
  }
}

// ── analyze ───────────────────────────────────────────────────────────────────────────────────────

/** `bridge analyze` — runs the Dart analyzer over the Flutter project and writes UIR. */
export async function analyze(from: string, args: Args): Promise<{ output: string; exitCode: number }> {
  const project = openProject(from, args);
  const analyzer = locate(project.root);
  if (analyzer === undefined) {
    throw new CliError(
      'the analyzer was not found.\n' +
        `  ${dim('→')} run \`bridge doctor\` — it reports where it looked and how to point it somewhere else.`,
      3,
    );
  }
  await ensureResolved(analyzer);

  const source = at(project, project.config.source);
  const work = at(project, project.config.work);
  mkdirSync(work, { recursive: true });
  const out = join(work, 'uir.ndjson');

  const wants = args.flags.get('json') === true;
  const invocation = command(
    analyzer,
    ['--project', source, '--out', out, ...(wants ? ['--format', 'json'] : [])],
    project.root,
  );
  const result = await run(invocation.program, invocation.args, invocation.cwd);

  // The analyzer's own exit code and its own diagnostics, passed through unchanged. Re-phrasing them here
  // would be a second voice describing the same problem — which is exactly what the adapter contract
  // forbids inside the analyzer, for the same reason.
  const text = wants ? result.stdout : result.stdout + result.stderr;
  const wrote = existsSync(out);
  return {
    output: wants ? text.trim() : `${text.trim()}${wrote ? `\n${dim(`wrote ${shown(project, out)}`)}` : ''}`,
    exitCode: result.code,
  };
}

// ── generate ──────────────────────────────────────────────────────────────────────────────────────

/** `bridge generate` — normalizes UIR and writes the emitted project. */
export async function generate(from: string, args: Args): Promise<{ output: string; exitCode: number }> {
  const project = openProject(from, args);
  const work = at(project, project.config.work);
  const document = join(work, 'normalized.ndjson');
  const raw = join(work, 'uir.ndjson');
  const input = existsSync(document) ? document : raw;

  if (!existsSync(input)) {
    throw new CliError(
      `no UIR to generate from.\n  ${dim('→')} run \`bridge analyze\` first, or \`bridge build\` to do both.`,
      2,
    );
  }

  const loaded = loadDocument(input, relative(project.root, input));

  // Resolved from the **project**, not from the compiler — see `PluginHost.LoadOptions.from`. The CLI's own
  // `node_modules` is the fallback, which is what makes the first-party generator work with no install.
  const host = await PluginHost.load([project.config.generator, ...project.config.plugins], {
    from: pluginBases(project),
  });

  // ## Normalize when handed a raw document
  //
  // **`bridge analyze && bridge generate` — the documented sequence — used to fail**, and it failed in the
  // most misleading way available: the analyzer writes `uir.ndjson`, `generate` fell back to it when no
  // normalized document existed, and un-normalized UIR has no `app.Token` nodes because N10 has not run
  // yet. So every themed widget was refused with BRG3010, whose message says *"Give the app a
  // `ColorScheme.fromSeed(...)`"* — advice the example application had already taken. The compiler was
  // telling a user to fix something that was not broken.
  //
  // N1–N11 are not optional. Generating from a document that has not been through them is never correct,
  // so there is no case in which the previous fallback did the right thing: it either found a normalized
  // document, or it produced this.
  //
  // The same `normalize` helper `build` and the inspection commands use — one pipeline, so `bridge
  // generate` and `bridge build` cannot come to different conclusions about the same document.
  const widgets = WidgetRegistry.from(host.plugins);
  const program = input === raw ? normalize(loaded, widgets).program : loaded;
  const nodes = program.nodes;
  const generator = host.plugins.map((plugin) => plugin.generator).find((g) => g !== undefined);
  if (generator === undefined) {
    throw new CliError(
      `\`${project.config.generator}\` loaded, but declares no generator.\n` +
        `  ${dim('→')} check \`generator\` in bridge.json names a package that emits a target.`,
      3,
    );
  }

  const reported: Diagnostic[] = [];
  const context: GeneratorContext = {
    program: programOf(nodes),
    widgets: host.plugins.find((plugin) => plugin.widgets !== undefined)?.widgets ?? {
      name: 'none',
      priority: 0,
      widgets: [],
    },
    diagnostics: [],
    report: (diagnostic) => reported.push(diagnostic),
  };

  const { files } = generator.generate(context);
  const out = at(project, project.config.out);

  if (files.length > 0) {
    for (const file of files) materialise(out, file);
  }

  return summarise(project, reported, files, out, args);
}

/** Writes one emitted file, creating its directory. */
function materialise(root: string, file: EmittedFile): void {
  const full = join(root, file.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, file.contents);
}

function summarise(
  project: Project,
  reported: readonly Diagnostic[],
  files: readonly EmittedFile[],
  out: string,
  args: Args,
): { output: string; exitCode: number } {
  const errors = reported.filter((d) => d.severity === 'error');
  const visible = reported.filter((d) => atLeast(d.severity, project.config.diagnostics.level));

  if (args.flags.get('json') === true) {
    return {
      output: json({
        files: files.map((f) => f.path),
        diagnostics: visible,
        counts: counts(reported),
      }),
      exitCode: errors.length > 0 ? 1 : 0,
    };
  }

  const lines: string[] = [];
  for (const diagnostic of visible) lines.push(render(diagnostic));
  if (lines.length > 0) lines.push('');

  if (errors.length > 0) {
    lines.push(
      red(`${errors.length} error(s) — nothing was written.`),
      dim('  A partial project would compile around the holes and fail where they are.'),
    );
    return { output: lines.join('\n'), exitCode: 1 };
  }

  lines.push(`${green(`wrote ${files.length} file(s)`)} ${dim(`to ${shown(project, out)}`)}`);
  return { output: lines.join('\n'), exitCode: 0 };
}

/** Whether [severity] is at or above [level]. */
function atLeast(severity: string, level: string): boolean {
  const rank: Record<string, number> = { error: 3, warning: 2, info: 1 };
  return (rank[severity] ?? 0) >= (rank[level] ?? 0);
}

function counts(reported: readonly Diagnostic[]): Record<string, number> {
  const out: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const d of reported) out[d.severity] = (out[d.severity] ?? 0) + 1;
  return out;
}

/** One diagnostic, in the shape every other tool a developer uses prints. */
function render(diagnostic: Diagnostic): string {
  const tag =
    diagnostic.severity === 'error'
      ? red('error')
      : diagnostic.severity === 'warning'
        ? yellow('warning')
        : cyan('info');
  return `${tag} ${dim(`[${diagnostic.code}]`)} ${diagnostic.message}`;
}

// ── clean ─────────────────────────────────────────────────────────────────────────────────────────

/** `bridge clean` — removes generated output and intermediate documents. */
export function clean(from: string, args: Args): { output: string; exitCode: number } {
  const project = openProject(from, args);
  const targets = [at(project, project.config.out), at(project, project.config.work)];
  const removed: string[] = [];
  for (const target of targets) {
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(shown(project, target));
  }
  return {
    output:
      removed.length === 0
        ? dim('nothing to clean.')
        : `${green('removed')} ${removed.join(', ')}`,
    exitCode: 0,
  };
}

// ── shared ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Parses an NDJSON document — **through the compiler's parser**, not a second one.
 *
 * This used to be four lines of its own, and they were subtly worse in two ways that only show on a bad
 * document. `JSON.parse(line)` was called bare, so a malformed line surfaced as a raw `SyntaxError` with
 * no indication of *which* line — in the one code path a user actually runs. And the index came from a
 * `.map` applied **after** a `.filter` that dropped blank lines, so every reported line number was wrong
 * by the number of blank lines above it.
 *
 * `parseNdjson` has neither problem, is exported, and is what the loader itself uses. A second parser for
 * the same format is a second set of edge cases to get right, and this one had not.
 */
export function parseDocument(text: string, label: string): AnyUirNode[] {
  try {
    return parseNdjson(text);
  } catch (cause) {
    throw new CliError(`${label}: ${(cause as Error).message}`, 3);
  }
}

/**
 * Writes the manifest that belongs beside a document this tool produced.
 *
 * **Every UIR document on disk must declare the schema it was built against**, or the loader's
 * refusals are only as good as the weakest document in the directory. The analyzer has always written
 * one beside `uir.ndjson`; `build` wrote `normalized.ndjson` with none, and `generate` prefers the
 * normalized document when it exists — so tampering with `uir.manifest.json` and running `generate`
 * sailed straight through, reading a document nothing had vouched for.
 *
 * The producer here is the compiler rather than the analyzer, so `buildVersion` is this tool's
 * version: the question a manifest answers is *what made this, and against which schema*, and for a
 * normalized document the honest answer is the CLI that ran the passes.
 */
export function writeManifest(
  documentPath: string,
  nodes: readonly AnyUirNode[],
  diagnosticCount: number,
): void {
  const manifest: Manifest = {
    buildVersion: VERSION,
    diagnosticCount,
    format: 'ndjson/1',
    recordCount: nodes.length,
    schemaHash: UIR_SCHEMA_HASH,
    uirVersion: UIR_VERSION,
  };
  // Keys sorted, matching what the analyzer writes — a manifest is a file people diff.
  writeFileSync(
    manifestPathFor(documentPath),
    `${JSON.stringify(manifest, Object.keys(manifest).sort())}\n`,
  );
}

/**
 * Reads a UIR document **through the compiler's loader**, so its compatibility refusals apply.
 *
 * The loader checks three things a document can be wrong about — the schema it was built against, its
 * wire format, and whether it is truncated — and refuses rather than proceeding. `loader.ts` explains
 * why that refusal is not optional: a document built against a different schema *deserializes*, with
 * a field missing or an enum the reader has never heard of, and the compiler carries on and is
 * quietly wrong.
 *
 * **Those checks require the manifest, and until now the production path never read it.** `analyze`
 * writes `uir.manifest.json` beside `uir.ndjson`, and `generate`/`build`/`validate` parsed the NDJSON
 * directly and passed no manifest — so every guarantee in `load()` was inert for exactly the commands
 * a user actually runs. It fired only for the inspection commands, which is backwards: those are for
 * someone debugging, who can see the mismatch anyway.
 *
 * This matters far more once the CLI is installable. In a checkout the analyzer and the compiler move
 * together. Once `@bridge/cli` is a published package, a user can have an old document in `.bridge/`
 * and a new CLI, or a `BRIDGE_ANALYZER` pointing at a build from a different version — and version
 * skew between the two language domains becomes an ordinary Tuesday rather than an impossibility.
 */
export function loadDocument(path: string, label: string): Program {
  const manifestPath = manifestPathFor(path);
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest)
    : undefined;

  try {
    return load(readFileSync(path, 'utf8'), manifest);
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
    // Exit 3, not 1: an unreadable document is a refused input (INV-5), and no amount of retrying the
    // same command will change it. The remedy is always to re-analyze, so say that.
    throw new CliError(
      `${label} cannot be read.\n  ${error.message}\n` +
        `  ${dim('→')} run \`bridge analyze\` to rebuild it with this version.`,
      3,
    );
  }
}

/** A `ProgramView` over nodes in hand — the same shape the compiler's `Program` satisfies (ADR-22). */
export function programOf(nodes: readonly AnyUirNode[]): ProgramView {
  const byId = new Map<NodeId, AnyUirNode>();
  for (const node of nodes) byId.set(node.id, node);
  const ordered = [...nodes].sort((a, b) =>
    a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind < b.kind ? -1 : 1,
  );
  return {
    nodes: ordered,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    ofKind: <K extends AnyUirNode['kind']>(kind: K) =>
      ordered.filter((node): node is Extract<AnyUirNode, { kind: K }> => node.kind === kind),
  };
}


/** How a program will be spawned on a given platform. */
export interface SpawnPlan {
  readonly program: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

/**
 * Decides how to invoke [program] on [platform] — the platform-specific part of {@link run}, extracted so
 * it can be asserted from any host.
 *
 * The Windows rules, and why each exists:
 *
 *   * **`shell: true`.** `dart`, `npx` and `flutter` are `dart.bat` / `npx.cmd` there, and
 *     `child_process.spawn` without a shell calls `CreateProcess`, which executes `.exe` and refuses
 *     `.bat`. The spawn fails with `ENOENT` on a program plainly on `PATH`.
 *   * **Quoting.** A shell re-parses the argument vector, so `cmd.exe` splits on whitespace even from an
 *     array. `C:\\Users\\me\\My Projects\\app` would reach the analyzer as `C:\\Users\\me\\My`.
 *     Double quotes, because `cmd` does not honour single ones.
 *
 * On POSIX none of this applies and none of it is done: no shell, no re-parsing, no quoting — `spawn`
 * passes the vector through untouched, which is both correct and one less thing to get wrong.
 */
export function spawnPlan(
  program: string,
  argv: readonly string[],
  platform: string,
): SpawnPlan {
  if (platform !== 'win32') {
    return { program, args: [...argv], shell: false };
  }
  const quote = (argument: string): string => (/[\s&|<>^]/.test(argument) ? `"${argument}"` : argument);
  return { program: quote(program), args: argv.map(quote), shell: true };
}

/**
 * Runs a program and captures its output. Never throws; a missing program is a non-zero code.
 *
 * ## `shell` on Windows, and why it is not a stylistic choice
 *
 * Every program this CLI spawns — `dart`, `npx`, `flutter` — is a **batch file** on Windows
 * (`dart.bat`, `npx.cmd`). `child_process.spawn` without `shell` calls `CreateProcess`, which executes
 * `.exe` files and refuses `.bat`/`.cmd`: the spawn fails with `ENOENT` on a program that is plainly on
 * `PATH`. So on Windows the CLI could not run the analyzer, resolve its dependencies, or typecheck an
 * emitted project — three of its four stages.
 *
 * `shell` is only set on Windows. It is not free: it re-parses the argument vector, so an argument
 * containing a space or a shell metacharacter needs quoting that `spawn` would otherwise have handled.
 * Project paths do contain spaces, so the arguments are quoted below rather than trusted.
 *
 * On POSIX nothing changes: no shell, no re-parsing, no quoting.
 */
export function run(
  program: string,
  argv: readonly string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((settle) => {
    let stdout = '';
    let stderr = '';
    const plan = spawnPlan(program, argv, process.platform);
    const child = spawn(plan.program, [...plan.args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: plan.shell,
    });
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => settle({ code: 127, stdout, stderr: `${stderr}${error.message}\n` }));
    child.on('close', (code) => settle({ code: code ?? 1, stdout, stderr }));
  });
}
