// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { loadGenerated, type Harness } from './execute.js';
import { cleanupBuildProofTemporaries, collectionMutationRaw, compiledFrom, harness, typecheckEmitted } from './support.js';

// ADR-0051 — in-place mutation of a State-held List / Set / Map, executed.
//
// The oracle is Flutter itself: `fixtures/apps/collection_mutation/test/scenarios_test.dart` mounts each scenario's
// widget under `flutter test`, taps the scripted buttons and records every output `Text` after each tap
// (`expected.json`, checked current by `flutter test`). Here the *generated React component* is mounted in jsdom and
// driven through the same script; each step must show what Flutter showed.
//
// Real analyzer output → the real compiler → the real generator → the real runtime kit → real react-dom.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const here = dirname(fileURLToPath(import.meta.url)); // not `new URL(…)`: under jsdom `URL` is jsdom's
const fixture = (name: string): string =>
  join(here, '..', '..', '..', '..', 'fixtures', 'apps', 'collection_mutation', 'test', name);
const scripts = JSON.parse(readFileSync(fixture('scenarios.json'), 'utf8')) as Record<string, string[]>;
const expected = JSON.parse(readFileSync(fixture('expected.json'), 'utf8')) as Record<string, string[][]>;

const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

let generated: { reported: { severity: string }[]; files: readonly { path: string; contents: string }[] };
let runner: Harness;

beforeAll(async () => {
  const { context, reported } = harness(compiledFrom(collectionMutationRaw()));
  const { files } = reactGenerator.generate(context);
  generated = { reported, files };
  runner = await loadGenerated(
    files,
    [...Object.keys(scripts), 'PropsChild', 'KeptChild'].map((name) => [kebab(name), name] as const),
  );
}, 120_000);
afterAll(cleanupBuildProofTemporaries);

// Scenarios where Flutter's output is *not* the contract at some steps: a mutation with no `setState` does not rebuild
// in Flutter, and does in the generated component (ADR-0048 — a State-field write re-renders). Only the listed steps
// are compared; at the others the divergence itself is asserted, so the deviation is pinned rather than hidden.
const NO_REBUILD_STEPS: Readonly<Record<string, readonly number[]>> = { NoSetState: [1, 3, 4] };

describe('the generated project', () => {
  it('has no generator error, and real tsc --strict accepts it', () => {
    expect(generated.reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(generated.files);
  }, 180_000);
});

describe('each scenario matches Flutter, step by step', () => {
  for (const [name, steps] of Object.entries(scripts)) {
    it(name, () => {
      const mounted = runner.mount(kebab(name), name);
      try {
        const trace = expected[name] as string[][];
        expect(mounted.texts(), `${name} at mount`).toEqual(trace[0]);
        const deviating = NO_REBUILD_STEPS[name] ?? [];
        steps.forEach((label, i) => {
          mounted.click(label);
          const step = i + 1;
          if (deviating.includes(step)) {
            // Flutter shows the stale text here; the generated component shows the mutation already.
            expect(mounted.texts(), `${name} after ${label} (#${step}) is ahead of Flutter`).not.toEqual(trace[step]);
          } else {
            expect(mounted.texts(), `${name} after ${label} (#${step})`).toEqual(trace[step]);
          }
        });
      } finally {
        mounted.unmount();
      }
    });
  }
});
