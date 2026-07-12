// `normalize`, `diagnostics`, `stats`, `explain`.
//
// These four run the real pipeline. Not a copy of it, not a subset of it, not a re-implementation that
// "does the same thing" — `normalizationPipeline()` and `PassManager`, exactly as the compiler runs
// them. That is the whole design constraint of this package: a debugger that disagrees with the
// compiler is a debugger that sends you looking for a bug that is not there.

import { writeFileSync } from 'node:fs';

import { normalizationPipeline, PassManager, Program, referencesOf } from '@bridge/compiler';
import {
  canonicalEncode,
  nodeIdOfContent,
  stripIdentity,
  UIR_SCHEMA_HASH,
  UIR_VERSION,
  type AnyUirNode,
  type NodeId,
} from '@bridge/uir';

import { flag, value, type Args } from '../args.js';
import { CliError, normalize, type Document } from '../document.js';
import { bar, bold, cyan, dim, green, json, red, table, yellow } from '../render.js';

/** The severities, worst first. */
const SEVERITY = ['error', 'warning', 'info'] as const;

const colourOf = (severity: string): ((s: string) => string) =>
  severity === 'error' ? red : severity === 'warning' ? yellow : dim;

// ── normalize ─────────────────────────────────────────────────────────────────────────────────────

/** Runs N1..N11 and writes the normalized document. */
export function normalizeCommand(doc: Document, args: Args): string {
  if (doc.normalized) throw new CliError('`normalize` runs the pipeline itself; drop --normalized.', 2);

  const result = normalize(doc.program, doc.widgets);
  const ndjson = result.program.toNdjson();

  const out = value(args, 'out');
  if (out !== undefined) {
    writeFileSync(out, ndjson);
  } else if (!flag(args, 'json')) {
    process.stdout.write(ndjson);
    return '';
  }

  if (flag(args, 'json')) return json(result.manifest);

  const changed = result.manifest.passes.filter((p) => p.changed);
  return [
    `${bold('wrote')} ${out}`,
    table([
      ['nodes in', doc.program.nodes.length],
      ['nodes out', result.program.nodes.length],
      ['passes that changed the program', changed.length === 0 ? dim('none') : changed.map((p) => p.id).join(', ')],
      ['diagnostics', result.diagnostics.length],
    ]),
  ].join('\n');
}

// ── diagnostics ───────────────────────────────────────────────────────────────────────────────────

/** Runs the pipeline and reports everything it said. Exits 1 if anything was an error. */
export function diagnostics(doc: Document, args: Args): { output: string; exitCode: number } {
  const result = normalize(doc.normalized ? doc.program : doc.program, doc.widgets);
  const all = result.diagnostics;

  if (flag(args, 'json')) {
    return {
      output: json(all),
      exitCode: all.some((d) => d.severity === 'error') ? 1 : 0,
    };
  }

  if (all.length === 0) {
    return { output: green('no diagnostics — the program normalized cleanly.'), exitCode: 0 };
  }

  const byCode = new Map<string, typeof all>();
  for (const d of all) byCode.set(d.code, [...(byCode.get(d.code) ?? []), d]);

  const out: string[] = [];
  for (const severity of SEVERITY) {
    const codes = [...byCode.entries()]
      .filter(([, ds]) => ds[0]!.severity === severity)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (codes.length === 0) continue;

    const paint = colourOf(severity);
    const total = codes.reduce((n, [, ds]) => n + ds.length, 0);
    out.push(paint(bold(`${severity} (${total})`)));

    for (const [code, ds] of codes) {
      out.push(`  ${paint(code)} ${dim(`×${ds.length}`)}  ${ds[0]!.message}`);
      if (flag(args, 'verbose')) {
        for (const d of ds) out.push(dim(`      ${d.nodeId}`));
      }
    }
    out.push('');
  }

  const errors = all.filter((d) => d.severity === 'error').length;
  out.push(
    errors > 0
      ? red(`${errors} error(s). This program is not fit to generate from.`)
      : dim('no errors. Warnings describe work a generator would otherwise have to guess at.'),
  );

  return { output: out.join('\n'), exitCode: errors > 0 ? 1 : 0 };
}

// ── stats ─────────────────────────────────────────────────────────────────────────────────────────

/** Where the time goes, and where the nodes go. */
export function stats(doc: Document, args: Args): string {
  if (doc.normalized) throw new CliError('`stats` times the pipeline itself; drop --normalized.', 2);

  const time = (f: () => unknown, runs = 5): number => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < runs; i++) f();
    return Number(process.hrtime.bigint() - start) / 1e6 / runs;
  };

  const passes = normalizationPipeline();
  const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH, widgets: doc.widgets };

  const full = time(() => new PassManager(passes).run(doc.program, options));
  const encode = time(() => doc.program.toNdjson());

  // Each pass timed as the marginal cost of adding it to the prefix before it. Not a profiler — a
  // measurement, taken the only way that respects the pass dependency graph.
  const rows: { id: string; name: string; ms: number; changed: boolean }[] = [];
  const result = new PassManager(passes).run(doc.program, options);
  let previous = 0;
  for (let i = 0; i < passes.length; i++) {
    const prefix = passes.slice(0, i + 1);
    const cumulative = time(() => new PassManager(prefix).run(doc.program, options));
    const pass = passes[i]!;
    rows.push({
      id: pass.id,
      name: pass.name,
      ms: Math.max(0, cumulative - previous),
      changed: result.manifest.passes.find((p) => p.id === pass.id)?.changed ?? false,
    });
    previous = cumulative;
  }

  if (flag(args, 'json')) {
    return json({
      nodes: doc.program.nodes.length,
      pipelineMs: full,
      encodeMs: encode,
      passes: rows,
    });
  }

  const max = Math.max(...rows.map((r) => r.ms), 0.001);
  const out: string[] = [
    bold(doc.path),
    table([
      ['nodes', doc.program.nodes.length],
      ['full pipeline N1..N11', `${full.toFixed(2)} ms`],
      ['canonical encode (toNdjson)', `${encode.toFixed(2)} ms`],
    ]),
    '',
    bold('per pass') + dim('  (marginal cost; ● = changed the program)'),
  ];
  for (const row of rows) {
    out.push(
      `  ${row.changed ? green('●') : dim('○')} ${row.id.padEnd(3)} ${row.name.padEnd(26)} ` +
        `${row.ms.toFixed(2).padStart(7)} ms  ${bar(row.ms, max)}`,
    );
  }
  return out.join('\n');
}

// ── explain ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything about one node: what it is, where it came from, what its id is a function of, what points
 * at it, and what each of the eleven passes did to it.
 *
 * The id derivation is **recomputed and checked**, not quoted. If a node's stored id is not the hash of
 * its own canonical content, that is the single most dangerous corruption possible in this compiler —
 * every anchor, every cache key and every incremental decision rests on it — and this is where you find
 * out.
 */
export function explain(doc: Document, args: Args): string {
  const id = args.positionals[1];
  if (id === undefined) throw new CliError('`explain` needs a node id: bridge explain <doc> <node-id>', 2);

  const found = find(doc.program, id);
  if (found.length === 0) throw new CliError(`no node with id ${id} in ${doc.path}`, 2);
  if (found.length > 1) {
    throw new CliError(
      `${id} is ambiguous — it matches ${found.length} nodes: ${found.map((m) => m.node.id).join(', ')}`,
      2,
    );
  }

  const { node, topLevel } = found[0]!;
  const record = node as unknown as Record<string, unknown>;
  const span = record['span'] as { file?: string; line?: number; column?: number } | undefined;

  // ── identity (ADR-17), recomputed rather than quoted. ──
  //
  // A **tree node** is content-addressed: its id *is* `sha256('n:' + canonical content)`, so it can be
  // recomputed here and checked, and a mismatch is real corruption.
  //
  // A **declaration** is symbol-addressed: `sha256('d:' + symbol)`, where the symbol is a source
  // coordinate like `sig:lib/login.dart#_LoginState._email`. That symbol is *not carried in the
  // document* — it exists only inside the analyzer. So this id cannot be recomputed from this file, and
  // saying "corrupt" because a declaration's content does not hash to its id would be a lie. It would
  // be true of every healthy declaration in every document this compiler has ever produced.
  const contentHash = nodeIdOfContent(stripIdentity(node));
  const contentAddressed = contentHash === node.id;
  const declaration = topLevel && !contentAddressed;
  const honest = contentAddressed || declaration;

  // ── who points at it, and what it points at. ──
  const outgoing = referencesOf(node);
  const incoming = doc.program.nodes
    .filter((n) => n.id !== node.id && referencesOf(n).includes(node.id))
    .map((n) => ({ id: n.id, kind: n.kind }));

  // ── what the pipeline does to it. ──
  const fate = doc.normalized ? [] : trace(doc, node.id);

  if (flag(args, 'json')) {
    return json({
      id: node.id,
      kind: node.kind,
      span: span ?? null,
      identity: {
        scheme: declaration ? 'symbol' : 'content',
        contentHash,
        verified: contentAddressed,
        verifiable: !declaration,
      },
      references: outgoing,
      referencedBy: incoming,
      pipeline: fate,
      content: node,
    });
  }

  const out: string[] = [
    `${cyan(node.kind)} ${bold(node.id)}`,
    '',
    table([
      ['source', span === undefined ? dim('(none)') : `${span.file}:${span.line}:${span.column}`],
      [
        'identity',
        declaration
          ? "declaration — sha256('d:' + symbol)"
          : "tree node — sha256('n:' + canonical content)",
      ],
      [
        'id check',
        contentAddressed
          ? green(`✓ content hashes to ${contentHash} — the id is a function of the content`)
          : declaration
            ? dim('— symbol-addressed; the symbol is not carried in the document, so it cannot be')
            : red(`✗ stored ${node.id}, but its content hashes to ${contentHash}`),
      ],
      ...(declaration
        ? ([['', dim('  recomputed here. Only the analyzer that minted it can check this one.')]] as const)
        : []),
    ]),
  ];

  if (!honest) {
    out.push(
      '',
      red("  This node's id is not the hash of its content, and it is not a declaration. Every anchor,"),
      red('  cache key and incremental decision in this compiler assumes it is. Do not trust this file.'),
    );
  }

  out.push('', bold(`references (${outgoing.length})`));
  for (const to of outgoing) {
    const target = doc.program.nodes.find((n) => n.id === to);
    out.push(`  → ${target === undefined ? yellow(`${to} (dangling)`) : `${cyan(target.kind)} ${dim(to)}`}`);
  }
  if (outgoing.length === 0) out.push(dim('  none'));

  out.push('', bold(`referenced by (${incoming.length})`));
  for (const from of incoming) out.push(`  ← ${cyan(from.kind)} ${dim(from.id)}`);
  if (incoming.length === 0) out.push(dim('  none'));

  if (fate.length > 0) {
    out.push('', bold('through the pipeline'));
    for (const step of fate) {
      const mark =
        step.fate === 'removed' ? red('removed') : step.fate === 'changed' ? yellow('changed') : dim('·');
      out.push(`  ${step.id.padEnd(3)} ${step.name.padEnd(26)} ${mark}`);
    }
  }

  out.push('', bold('canonical content'), dim(canonicalEncode(stripIdentity(node))));
  return out.join('\n');
}

/** Every node whose id is [id] or starts with it — nested nodes included. */
function find(program: Program, id: NodeId): { node: AnyUirNode; topLevel: boolean }[] {
  const found: { node: AnyUirNode; topLevel: boolean }[] = [];

  const visit = (value: unknown, topLevel: boolean): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, false);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    if (typeof record['kind'] === 'string' && typeof record['id'] === 'string' && record['id'].startsWith(id)) {
      found.push({ node: value as AnyUirNode, topLevel });
    }
    for (const child of Object.values(record)) visit(child, false);
  };

  for (const node of program.nodes) visit(node, true);
  return found;
}

/** What each pass did to the node [id]: left it alone, changed it, or removed it. */
function trace(doc: Document, id: NodeId): { id: string; name: string; fate: string }[] {
  const passes = normalizationPipeline();
  const options = { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH, widgets: doc.widgets };

  const contentOf = (program: Program): string | undefined => {
    const node = find(program, id)[0]?.node;
    return node === undefined ? undefined : canonicalEncode(node);
  };

  const steps: { id: string; name: string; fate: string }[] = [];
  let previous = contentOf(doc.program);

  for (let i = 0; i < passes.length; i++) {
    const after = new PassManager(passes.slice(0, i + 1)).run(doc.program, options).program;
    const now = contentOf(after);
    const pass = passes[i]!;

    steps.push({
      id: pass.id,
      name: pass.name,
      fate: now === undefined ? (previous === undefined ? 'absent' : 'removed') : now === previous ? 'unchanged' : 'changed',
    });
    previous = now;
  }
  return steps;
}
