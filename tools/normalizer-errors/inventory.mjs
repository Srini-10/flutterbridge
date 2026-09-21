// Root-cause inventory of a raw UIR document's normalizer errors.
//   node tools/normalizer-errors/inventory.mjs <uir.ndjson> [--out normalizer-errors.json]
// Runs the same N1–N11 pipeline `bridge build` does and lists every error-severity diagnostic with its code, source span and message,
// grouped by code — the input to classifying each one as a compiler bug or a legitimate refusal.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalizationPipeline, PassManager, PluginHost, WidgetRegistry, load } from '../../packages/cli/node_modules/@bridge/compiler/dist/index.js';
import { UIR_SCHEMA_HASH, UIR_VERSION } from '../../packages/cli/node_modules/@bridge/uir/dist/index.js';

const [input, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
const host = await PluginHost.load(['@bridge/widgets-material'], { from: [new URL('../../packages/cli/', import.meta.url).pathname] });
const widgets = WidgetRegistry.from(host.plugins);
const result = new PassManager(normalizationPipeline()).run(load(readFileSync(input, 'utf8')), { uirVersion: UIR_VERSION, schemaHash: UIR_SCHEMA_HASH, widgets });
const errors = result.diagnostics.filter((d) => d.severity === 'error');
const program = load(readFileSync(input, 'utf8'));
const byId = new Map(program.nodes.map((n) => [n.id, n]));
const byCode = {};
for (const d of errors) (byCode[d.code] ??= []).push({ nodeId: d.nodeId ?? null, source: d.nodeId ? (byId.get(d.nodeId)?.span ?? null) : null, message: d.message });
const report = { input, total: errors.length, byCode: Object.fromEntries(Object.entries(byCode).map(([k, v]) => [k, { count: v.length, items: v }])) };
const text = `${JSON.stringify(report, null, 2)}\n`;
if (outIdx >= 0) writeFileSync(rest[outIdx + 1], text); else process.stdout.write(text);
console.error(`${errors.length} normalizer error(s):`, Object.fromEntries(Object.entries(byCode).map(([k, v]) => [k, v.length])));
