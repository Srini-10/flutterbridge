#!/usr/bin/env node
// Root-cause taxonomy of the diagnostics `bridge build` produces on a real application (M14).
//
//   node tools/taxonomy/taxonomy.mjs <project-dir> [--label A] [--out docs/m14/taxonomy-A]
//
// Runs `bridge build --json` (which stops at the first failing stage), and `bridge generate` (which, since ADR-0077 D5, also stops on normalizer errors), classifies every diagnostic with `rules.json` (first match wins), and writes `<out>.json` (machine-readable)
// and `<out>.md` (human-readable). The diagnostics carry no file/line: the generator reports a node id, and `bridge inspect`/`bridge graph` map it to a span.
//
// It never modifies the project: `bridge build`/`generate` write only inside the project's own `.bridge/` and `build/`, which a disposable copy owns.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bridge = resolve(here, '../../packages/cli/bin/bridge.mjs');
const args = process.argv.slice(2);
const project = resolve(args[0] ?? '.');
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const label = flag('--label', project.split('/').pop());
const out = flag('--out', undefined);
const rules = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')).rules.map((rule) => ({ ...rule, re: new RegExp(rule.match) }));

function run(argv) {
  try {
    return { code: 0, text: execFileSync('node', [bridge, ...argv], { cwd: project, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { code: error.status ?? 1, text: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

// ── the stages `bridge build` reaches ──
const build = run(['build', '--json']);
let stages = [];
try {
  stages = JSON.parse(build.text.slice(build.text.indexOf('{'))).stages ?? [];
} catch {
  stages = [];
}
const normalize = stages.find((stage) => stage.name === 'normalize');
const diagnostics = [];
if (normalize !== undefined && normalize.ok === false) {
  for (const line of normalize.detail.split('\n')) {
    const match = /^(BRG\d+): (.*)$/.exec(line);
    if (match !== null) diagnostics.push({ stage: 'normalize', code: match[1], message: match[2], text: line });
  }
}

// ── the generator, past any normalizer error ──
const generate = run(['generate']);
for (const line of generate.text.split('\n')) {
  const match = /^(error|warning) \[(BRG\d+)\] (.*)$/.exec(line);
  if (match !== null && match[1] === 'error' && match[2] !== 'BRG3005') diagnostics.push({ stage: 'generate', code: match[2], message: match[3], text: `${match[2]}] ${match[3]}` });
}

const classified = diagnostics.map((d) => {
  const rule = rules.find((candidate) => candidate.re.test(d.text)) ?? rules[rules.length - 1];
  return { ...d, root: rule.id, category: rule.category, layer: rule.layer, cause: rule.cause, adr: rule.adr };
});

const groups = new Map();
for (const d of classified) {
  const key = `${d.stage}|${d.root}`;
  const group = groups.get(key) ?? { stage: d.stage, root: d.root, category: d.category, layer: d.layer, cause: d.cause, adr: d.adr, count: 0, codes: new Set(), sample: d.message.slice(0, 220) };
  group.count += 1;
  group.codes.add(d.code);
  groups.set(key, group);
}
const table = [...groups.values()].map((g) => ({ ...g, codes: [...g.codes].sort() })).sort((a, b) => b.count - a.count);
const byCategory = {};
for (const g of table) byCategory[g.category] = (byCategory[g.category] ?? 0) + g.count;

const result = {
  application: label,
  buildStages: stages.map((stage) => ({ name: stage.name, ok: stage.ok })),
  normalizerErrors: classified.filter((d) => d.stage === 'normalize').length,
  generatorErrors: classified.filter((d) => d.stage === 'generate').length,
  uniqueRootCauses: table.length,
  occurrencesByCategory: byCategory,
  rootCauses: table,
};

const markdown = [
  `# Generator taxonomy — ${label}`,
  '',
  `\`bridge build\` stages: ${result.buildStages.map((s) => `${s.name} ${s.ok ? 'ok' : 'FAILED'}`).join(' → ') || 'none reached'}.`,
  `Normalizer errors: **${result.normalizerErrors}**. Generator errors (past the normalizer): **${result.generatorErrors}**. Unique root causes: **${result.uniqueRootCauses}**.`,
  '',
  `Occurrences by category — A (contract bug): ${byCategory.A ?? 0}; B (browser-compatible, not implemented): ${byCategory.B ?? 0}; C (library adapter): ${byCategory.C ?? 0}; D (no browser equivalent): ${byCategory.D ?? 0}; unclassified: ${byCategory['?'] ?? 0}.`,
  '',
  '| Count | Stage | Cat | Root cause | First failing layer | Codes | ADR |',
  '| ---: | --- | --- | --- | --- | --- | --- |',
  ...table.map((g) => `| ${g.count} | ${g.stage} | ${g.category} | ${g.cause} | ${g.layer} | ${g.codes.join(', ')} | ${g.adr} |`),
  '',
].join('\n');

if (out === undefined) {
  process.stdout.write(markdown);
} else {
  writeFileSync(`${out}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`${out}.md`, markdown);
  process.stdout.write(`${label}: normalizer ${result.normalizerErrors}, generator ${result.generatorErrors}, ${result.uniqueRootCauses} root causes → ${out}.{json,md}\n`);
}
