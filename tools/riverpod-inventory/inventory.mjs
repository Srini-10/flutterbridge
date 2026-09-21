// Riverpod usage matrix of a Flutter project (or monorepo): which provider kinds, consumers and `ref` operations it uses, and where.
//   node tools/riverpod-inventory/inventory.mjs <dir> [--label X] [--out docs/m14/riverpod-usage-matrix]
// Reads `.dart` sources only (skipping build output, `.dart_tool` and test directories); nothing is executed and nothing is written but --out.
// A textual count, deliberately — it sizes the feature and names the files; the compiler's own recognition is analyzer-based.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [root, ...rest] = process.argv.slice(2);
const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const label = flag('--label') ?? root;
const out = flag('--out');

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === '.dart_tool' || name === 'build' || name === 'node_modules' || name.startsWith('.')) continue;
    // Tests are the largest single user of `overrides:` and `ProviderContainer`, and are not part of the application that is compiled.
    if (name === 'test' || name === 'integration_test') continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path);
    else if (name.endsWith('.dart')) files.push(path);
  }
};
walk(root);

/** name → pattern. Each counts occurrences; `files` records which files contain at least one. */
const PATTERNS = {
  // Provider declarations
  'Provider(': /\bProvider(?:<[^>(]*>)?\s*\(/g,
  'Provider.family': /\bProvider\.family\b/g,
  'StateProvider': /\bStateProvider\b/g,
  'StateNotifierProvider': /\bStateNotifierProvider\b/g,
  'ChangeNotifierProvider': /\bChangeNotifierProvider\b/g,
  'FutureProvider': /\bFutureProvider\b/g,
  'StreamProvider': /\bStreamProvider\b/g,
  'NotifierProvider': /\bNotifierProvider\b/g,
  'AsyncNotifierProvider': /\bAsyncNotifierProvider\b/g,
  'StreamNotifierProvider': /\bStreamNotifierProvider\b/g,
  'extends Notifier': /extends\s+Notifier</g,
  'extends AsyncNotifier': /extends\s+AsyncNotifier</g,
  'extends StreamNotifier': /extends\s+StreamNotifier</g,
  'extends StateNotifier': /extends\s+StateNotifier</g,
  '@riverpod annotation': /@(?:riverpod|Riverpod)\b/g,
  // Modifiers
  '.family': /\.family\b/g,
  '.autoDispose': /\.autoDispose\b/g,
  // Scopes / overrides
  'ProviderScope': /\bProviderScope\b/g,
  'ProviderContainer': /\bProviderContainer\b/g,
  'overrides:': /\boverrides\s*:/g,
  '.overrideWith': /\.overrideWith(?:Value)?\b/g,
  'UncontrolledProviderScope': /\bUncontrolledProviderScope\b/g,
  // Consumers
  'ConsumerWidget': /extends\s+ConsumerWidget\b/g,
  'ConsumerStatefulWidget': /extends\s+ConsumerStatefulWidget\b/g,
  'ConsumerState': /extends\s+ConsumerState\b/g,
  'Consumer(': /\bConsumer\s*\(/g,
  'HookConsumerWidget': /\bHookConsumerWidget\b/g,
  // ref operations
  'ref.watch': /\bref\.watch\s*\(/g,
  'ref.read': /\bref\.read\s*\(/g,
  'ref.listen': /\bref\.listen(?:Manual)?\s*\(/g,
  'ref.invalidate': /\bref\.invalidate\s*\(/g,
  'ref.refresh': /\bref\.refresh\s*\(/g,
  'ref.onDispose': /\bref\.onDispose\b/g,
  'ref.keepAlive': /\bref\.keepAlive\b/g,
  'ref.exists': /\bref\.exists\b/g,
  '.notifier': /\.notifier\b/g,
  '.future': /\.future\b/g,
  '.select(': /\.select\s*\(/g,
  // AsyncValue handling
  '.when(': /\.when\s*\(/g,
  '.maybeWhen(': /\.maybeWhen\s*\(/g,
  '.whenData(': /\.whenData\s*\(/g,
  'AsyncValue': /\bAsyncValue\b/g,
  'AsyncData/Loading/Error': /\bAsync(?:Data|Loading|Error)\b/g,
  '.valueOrNull/.requireValue': /\.(?:valueOrNull|requireValue)\b/g,
  'AsyncValue.guard': /AsyncValue\.guard/g,
};

const usage = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, { count: 0, files: new Set() }]));
const importsRiverpod = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
  if (/package:(?:flutter_|hooks_)?riverpod|riverpod_annotation/.test(text)) importsRiverpod.add(file);
  for (const [name, re] of Object.entries(PATTERNS)) {
    const n = (text.match(re) ?? []).length;
    if (n > 0) {
      usage[name].count += n;
      usage[name].files.add(relative(root, file));
    }
  }
}

const matrix = Object.fromEntries(
  Object.entries(usage)
    .filter(([, v]) => v.count > 0)
    .map(([k, v]) => [k, { count: v.count, files: v.files.size }]),
);
const report = { label, dartFiles: files.length, filesImportingRiverpod: importsRiverpod.size, matrix };
if (out) {
  writeFileSync(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
