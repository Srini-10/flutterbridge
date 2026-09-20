// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { loadGenerated, type Harness } from './execute.js';
import { cleanupBuildProofTemporaries, compiledFrom, harness, lifecycleLoweringRaw, typecheckEmitted } from './support.js';

// ADR-0052 — the State lifecycle, executed.
//
// The oracle is Flutter itself (`fixtures/apps/lifecycle_lowering/test/scenarios_test.dart`, `expected.json`): each
// scenario mounts a host, taps the scripted buttons (`@wait` lets 50 ms of the clock pass) and records every output
// `Text`. The generated component is driven through the same script in jsdom and must show the same thing.
//
// What is compared is a *log the host owns and shows only on `refresh`*, so the comparison does not depend on the one
// known re-render difference (a mutation without `setState`, ADR-0048). Two behaviours genuinely differ from Flutter
// and are pinned here rather than hidden: the ORDER in which lifecycle methods of different components run
// (`OrderHost`, below).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  join(here, '..', '..', '..', '..', 'fixtures', 'apps', 'lifecycle_lowering', 'test', name);
const scripts = JSON.parse(readFileSync(fixture('scenarios.json'), 'utf8')) as Record<string, string[]>;
const expected = JSON.parse(readFileSync(fixture('expected.json'), 'utf8')) as Record<string, string[][]>;
const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

let generated: { reported: { severity: string }[]; files: readonly { path: string; contents: string }[] };
let runner: Harness;

beforeAll(async () => {
  const { context, reported } = harness(compiledFrom(lifecycleLoweringRaw()));
  const { files } = reactGenerator.generate(context);
  generated = { reported, files };
  runner = await loadGenerated(
    files,
    [...Object.keys(scripts), 'Probe', 'LogNode', 'AsyncProbe'].map((name) => [kebab(name), name] as const),
  );
}, 120_000);
afterAll(cleanupBuildProofTemporaries);

/** Where the generated component's order differs from Flutter's — asserted as what it *is*, so it cannot drift. */
const ORDER_DEVIATIONS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  // Flutter: init a | init b | init c — a parent's initState before its child's. React runs a child's effect before its
  // parent's, so the effectful part of `initState` runs b, a, c.
  // Flutter: dispose b | dispose a | dispose c — a subtree's children before the parent. React runs the parent's cleanup
  // first: a, b, c.
  OrderHost: {
    1: '> order: init b | init a | init c',
    2: '> order: init b | init a | init c',
    3: '> order: init b | init a | init c | dispose a | dispose b | dispose c',
    4: '> order: init b | init a | init c | dispose a | dispose b | dispose c',
    5: '> order: init b | init a | init c | dispose a | dispose b | dispose c | init b | init a | init c',
  },
};

describe('the generated project', () => {
  it('has no generator error, and real tsc --strict accepts it', () => {
    expect(generated.reported.filter((d) => d.severity === 'error')).toEqual([]);
    typecheckEmitted(generated.files);
  }, 180_000);
});

describe('each scenario matches Flutter, step by step', () => {
  for (const [name, steps] of Object.entries(scripts)) {
    it(name, async () => {
      const mounted = runner.mount(kebab(name), name);
      try {
        const trace = expected[name] as string[][];
        expect(mounted.texts(), `${name} at mount`).toEqual(trace[0]);
        const deviations = ORDER_DEVIATIONS[name] ?? {};
        for (const [i, label] of steps.entries()) {
          if (label === '@wait') await mounted.wait(60);
          else mounted.click(label);
          const step = i + 1;
          const actual = mounted.texts();
          const wanted = trace[step] as string[];
          const deviation = deviations[step];
          if (deviation === undefined) {
            expect(actual, `${name} after ${label} (#${step})`).toEqual(wanted);
          } else {
            expect(actual[0], `${name} after ${label} (#${step}) — pinned order deviation`).toBe(deviation);
            expect(actual.slice(1), `${name} after ${label} (#${step})`).toEqual(wanted.slice(1));
            expect(actual[0], 'the deviation is real').not.toBe(wanted[0]);
          }
        }
      } finally {
        mounted.unmount();
      }
    });
  }
});

describe('development StrictMode mounts, unmounts and mounts again — init and dispose stay paired', () => {
  it('a single Probe: the log reads init, dispose, init and nothing is left dangling', () => {
    const mounted = runner.mount('lifecycle-host', 'LifecycleHost', { strict: true });
    try {
      mounted.click('refresh');
      const log = (mounted.texts()[0] ?? '').replace('> log: ', '').split(' | ');
      // Each `init p1` is separated from the next by a `dispose p1` — StrictMode's replay — and the run ends in `init`.
      const events = log.filter((e) => e.endsWith(' p1') && (e.startsWith('init') || e.startsWith('dispose')));
      expect(events[0]).toBe('init p1');
      expect(events.at(-1)).toBe('init p1');
      for (let i = 1; i < events.length; i++) expect(events[i], `event ${i}`).not.toBe(events[i - 1]);
    } finally {
      mounted.unmount();
    }
  });

  it('a pure initState still shows its value on the first frame', () => {
    const mounted = runner.mount('init-only', 'InitOnly', { strict: true });
    try {
      expect(mounted.texts()).toEqual(['> init-only 5 n=5 5,6']);
    } finally {
      mounted.unmount();
    }
  });
});

describe('the first frame: what runs before the first render, and what only after (ADR-0052)', () => {
  // No effect runs in a first render (`renderToString`; the same is true of the first client render before commit), so
  // this shows exactly what `initState` contributed *before the first build*, as Flutter's first frame does.
  it('a pure initState is on the first frame', () => {
    expect(runner.firstRender('InitOnly')).toContain('init-only 5 n=5 5,6');
  });

  it('the pure prefix of a mixed initState is on the first frame; what follows an effect is not', () => {
    const html = runner.firstRender('Probe', { name: 'p', log: [], tag: 'a' });
    // `_b = _a + 1` and `_seen = 'tag …'` are the pure prefix: b=6 and the seen text are already there. `_a = 100`
    // follows `widget.log.add(…)`, so it runs after the first commit and the first frame still shows a=5.
    expect(html).toContain('a=5');
    expect(html).toContain('b=6');
    expect(html).toContain('tag a');
  });
});
