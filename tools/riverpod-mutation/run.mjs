// Mutation testing for the Riverpod runtime: each mutation breaks one rule the oracle scenarios pin, and the oracle test must fail.
//   node tools/riverpod-mutation/run.mjs
// A mutation that the suite does not notice ("survived") is a rule the oracle does not pin; the script exits non-zero if any survive.
// The sources are restored after every mutation, including when the run is interrupted.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('../../packages/runtimes/react/', import.meta.url));
const container = `${pkg}src/internal/riverpod/container.ts`;
const asyncValue = `${pkg}src/internal/riverpod/async_value.ts`;

const MUTATIONS = [
  ['drop the dependency edge', container, "edges.push({ dependency, target, last: value });", "void 0;"],
  ['`read` creates a dependency', container, "        dependency.container.ensureFresh(dependency);\n        return target.pick(dependency);\n      },\n      listen", "        dependency.container.ensureFresh(dependency);\n        edges.push({ dependency, target, last: target.pick(dependency) });\n        return target.pick(dependency);\n      },\n      listen"],
  ['family keys by identity', container, "if (isRecord(arg)) {\n    const record", "if (false as boolean) {\n    const record"],
  ['autoDispose never disposes', container, "    if (!element.def.autoDispose) return;\n    queueMicrotask(", "    return;\n    queueMicrotask("],
  ['autoDispose disposes inside close()', container, "        element.container.scheduleDisposeCheck(element);\n      },\n      read:", "        if (element.def.autoDispose && element.listeners.size === 0) element.container.disposeElement(element);\n      },\n      read:"],
  ['a refresh drops the previous value', asyncValue, "      hasValue: p.hasValue,\n      ...(p.hasValue ? { value: p.value as T } : {}),\n      hasError: p.hasError,\n      ...(p.hasError ? { error: p.error, stackTrace: p.stackTrace } : {}),\n      refresh: isRefresh", "      hasValue: false,\n      hasError: p.hasError,\n      ...(p.hasError ? { error: p.error, stackTrace: p.stackTrace } : {}),\n      refresh: isRefresh"],
  ['an error drops the previous value', asyncValue, "      hasValue: p.hasValue,\n      ...(p.hasValue ? { value: p.value as T } : {}),\n      hasError: true,", "      hasValue: false,\n      hasError: true,"],
  ['a listener hears equal values', container, "if (listener.target.same(listener.last, next)) continue;", "if (false as boolean) continue;"],
  ['overrides are ignored', container, "element.overridden = this.overrides.get(instance.def);", "element.overridden = undefined;"],
  ['a stale future result is kept', container, "const current = (): boolean => !element.disposed && element.generation === generation;", "const current = (): boolean => !element.disposed;"],
  ['`when` does not skip loading on refresh', asyncValue, "? (options.skipLoadingOnRefresh ?? true)", "? (options.skipLoadingOnRefresh ?? false)"],
  ['a source notifies later, not inside the assignment', container, "  private sourceChanged(element: Element, previous: unknown): void {\n    this.notify(element, previous);", "  private sourceChanged(element: Element, previous: unknown): void {\n    queueMicrotask(() => this.notify(element, previous));"],
  ['a derived provider is compared by identity', container, "return this.kind === 'state' || this.kind === 'stateNotifier' ? Object.is(a, b) : dartEquals(a, b);", "return Object.is(a, b);"],
  ['a dependent rebuilds whether or not the dependency changed', container, "if (!edge.target.same(edge.last, edge.target.pick(edge.dependency))) {", "if (true as boolean) {"],
  ['an unlistened provider is rebuilt eagerly', container, "if (element.listeners.size > 0 && (element.dirty || element.stale)) this.ensureFresh(element);", "if (element.dirty || element.stale) this.ensureFresh(element);"],
  ['a rebuild does not run onDispose first', container, "    if (rebuild) this.tearDown(element);\n    element.dirty = false;", "    element.dirty = false;"],
  ['listen does not build eagerly', container, "    const element = this.elementFor(target.source);\n    this.ensureFresh(element);\n    return this.subscribe(element, target, callback as Listener['callback'], options);", "    const element = this.elementFor(target.source);\n    return this.subscribe(element, target, callback as Listener['callback'], options);"],
  ['refresh does not rebuild', container, "    if (element.built) this.invalidateElement(element);\n    this.ensureFresh(element);\n    return target.pick(element);", "    this.ensureFresh(element);\n    return target.pick(element);"],
  // Not listed: `StateNotifier.updateShouldNotify` returning true. It is an *equivalent* mutant — every listener and dependent compares the
  // value again before reacting, so an identical assignment is unobservable either way.
  ['the container does not dispose its providers', container, "for (const element of [...this.order]) this.disposeElement(element);", "void 0;"],
];

const original = new Map();
const restore = () => {
  for (const [path, text] of original) writeFileSync(path, text);
};
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});

let survived = 0;
try {
  for (const path of new Set(MUTATIONS.map((m) => m[1]))) original.set(path, readFileSync(path, 'utf8'));
  for (const [name, path, from, to] of MUTATIONS) {
    const text = original.get(path);
    if (!text.includes(from)) {
      console.log(`  ?  ${name} — the text to mutate is not there; the mutation is stale`);
      survived += 1;
      continue;
    }
    writeFileSync(path, text.replace(from, to));
    let killed = false;
    try {
      execFileSync('npx', ['vitest', 'run', 'tests/riverpod_oracle.test.ts'], { cwd: pkg, stdio: 'pipe', encoding: 'utf8' });
    } catch {
      killed = true;
    }
    writeFileSync(path, text);
    console.log(`  ${killed ? 'killed  ' : 'SURVIVED'}  ${name}`);
    if (!killed) survived += 1;
  }
} finally {
  restore();
}
console.log(survived === 0 ? `all ${MUTATIONS.length} mutations killed` : `${survived} mutation(s) survived`);
process.exit(survived === 0 ? 0 : 1);
