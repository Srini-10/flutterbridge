// A Flutter-oracle suite for one fixture (`fixtures/apps/<name>/test/`): the generated project has no generator error and passes
// real `tsc --strict`, and each scenario's generated component, mounted in jsdom (real `react-dom`, the real runtime kit), shows
// after every scripted step what Flutter showed (`expected.json`, recorded by `flutter test`). Used by every fixture added in M12.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { loadGenerated, type Harness } from './execute.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, typecheckEmitted } from './support.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const here = dirname(fileURLToPath(import.meta.url)); // not `new URL(…)`: under jsdom `URL` is jsdom's
const repo = join(here, '..', '..', '..', '..');
const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export interface OracleOptions {
  /** The fixture app's directory name under `fixtures/apps`, which is also its golden's name under `fixtures/uir`. */
  readonly fixture: string;
  /** Components mounted only as children of a scenario, which the bundle must still contain. */
  readonly extraComponents?: readonly string[];
  /** Milliseconds a `@wait` step lets pass. */
  readonly waitMs?: number;
  /** Installs the jsdom layout shim and `ResizeObserver` (for components that measure). */
  readonly layout?: boolean;
  /** Steps whose output is asserted to DIFFER from Flutter's (a documented deviation), by scenario, 1-based. */
  readonly deviations?: Readonly<Record<string, readonly number[]>>;
}

/** Registers the suite. Call at the top level of a `*.test.ts` file that starts with `// @vitest-environment jsdom`. */
export function defineOracleSuite(options: OracleOptions): void {
  const dir = join(repo, 'fixtures', 'apps', options.fixture, 'test');
  const scripts = JSON.parse(readFileSync(join(dir, 'scenarios.json'), 'utf8')) as Record<string, string[]>;
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Record<string, string[][]>;
  const golden = readFileSync(join(repo, 'fixtures', 'uir', `${options.fixture}.ndjson`), 'utf8');

  let generated: { reported: { severity: string; message: string }[]; files: readonly { path: string; contents: string }[] };
  let runner: Harness;

  beforeAll(async () => {
    const { context, reported } = harness(compiledFrom(golden));
    const { files } = reactGenerator.generate(context);
    generated = { reported, files };
    runner = await loadGenerated(
      files,
      [...Object.keys(scripts), ...(options.extraComponents ?? [])].map((name) => [kebab(name), name] as const),
      { layout: options.layout === true },
    );
  }, 180_000);
  afterAll(cleanupBuildProofTemporaries);

  describe(`${options.fixture}: the generated project`, () => {
    it('has no generator error, and real tsc --strict accepts it', () => {
      expect(generated.reported.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
      typecheckEmitted(generated.files);
    }, 240_000);
  });

  describe(`${options.fixture}: each scenario matches Flutter, step by step`, () => {
    for (const [name, steps] of Object.entries(scripts)) {
      it(name, async () => {
        const mounted = runner.mount(kebab(name), name);
        try {
          const trace = expected[name] as string[][];
          expect(mounted.texts(), `${name} at mount`).toEqual(trace[0]);
          const deviating = options.deviations?.[name] ?? [];
          for (const [i, label] of steps.entries()) {
            if (label === '@wait') await mounted.wait(options.waitMs ?? 60);
            else if (label.startsWith('@')) await mounted.input(label);
            else mounted.click(label);
            const step = i + 1;
            if (deviating.includes(step)) expect(mounted.texts(), `${name} #${step} deviates`).not.toEqual(trace[step]);
            else expect(mounted.texts(), `${name} after ${label} (#${step})`).toEqual(trace[step]);
          }
        } finally {
          mounted.unmount();
        }
      }, 30_000);
    }
  });
}
