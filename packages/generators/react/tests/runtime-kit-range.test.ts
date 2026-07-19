// The emitted project's dependency on the runtime kit must be installable, and must be satisfiable
// by the kit this repository builds.
//
// Two separate promises, and M5-C found the first one broken outright:
//
//   1. **The range must be expressible to a package manager.** The generator emitted
//      `"@bridge/runtime-react": "workspace:*"`, which is a pnpm-workspace protocol. Every generated
//      application was therefore uninstallable anywhere but inside this monorepo — `npm install` in
//      one fails with `EUNSUPPORTEDPROTOCOL` before it fetches anything. The generator's entire
//      output is a project someone is meant to run, so this was the output being wrong, not the
//      environment.
//
//   2. **The range must actually match the kit.** A caret range declared in the generator and a
//      version set in the kit's manifest are two facts that can disagree, and the failure is
//      invisible until someone outside this repository installs a generated app and resolves a kit
//      that does not have the API the emitted code calls.
//
// So the range is declared once, in `emit/project.ts`, and *verified* here against the kit's real
// manifest — rather than restated in a second place that will eventually drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';
import type { AnyUirNode } from '@bridge/uir';

/** The runtime kit's own manifest — the thing the emitted range has to be satisfied by. */
function kitManifest(): {
  name: string;
  version: string;
  devDependencies: Record<string, string>;
} {
  const path = fileURLToPath(new URL('../../../runtimes/react/package.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as {
    name: string;
    version: string;
    devDependencies: Record<string, string>;
  };
}

const span = { file: 'lib/main.dart', line: 1, column: 1 };

/**
 * The smallest document that makes the generator scaffold a project.
 *
 * A route is what triggers the scaffold — a document with no route emits components and no
 * `package.json`, which is correct and is why this cannot just reuse `helloBridge()`.
 */
function routedApp(): AnyUirNode[] {
  return [
    {
      id: 'c1',
      kind: 'ui.Component',
      span,
      name: 'HomeScreen',
      root: 'e1',
      params: [],
    } as unknown as AnyUirNode,
    { id: 'e1', kind: 'ui.Text', span, value: { kind: 'lit', value: 'Hello' } } as unknown as AnyUirNode,
    { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
  ];
}

/** The emitted `package.json`, read out of the generator's own output. */
function emittedManifest(): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const { files } = reactGenerator.generate(harness(routedApp()).context);
  const file = files.find((f) => f.path === 'package.json');
  expect(file, 'the generator must emit a package.json').toBeDefined();
  return JSON.parse(file!.contents) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

/** Whether [version] satisfies the caret range [range]. Caret only — that is all this emits. */
function satisfiesCaret(range: string, version: string): boolean {
  const match = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (match === null) return false;
  const [, lo, mid, low] = match.map(Number) as [number, number, number, number];
  const parsed = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (parsed === null) return false;
  const [, major, minor, patch] = parsed.map(Number) as [number, number, number, number];

  if (major !== lo) return false;
  // Below 1.0.0 a caret is bounded by the *minor*: ^0.1.0 admits 0.1.x and not 0.2.0. That is semver's
  // rule for 0.x, and it is the rule that makes a 0.x kit release able to break the emitted code.
  if (lo === 0) return minor === mid && patch >= low;
  return minor > mid || (minor === mid && patch >= low);
}

describe('the emitted runtime-kit dependency', () => {
  it('is installable by a package manager that is not pnpm', () => {
    const { dependencies } = emittedManifest();
    const range = dependencies['@bridge/runtime-react'];

    expect(range, 'the emitted app must depend on the runtime kit').toBeDefined();
    // The specific regression: `workspace:` never reaches a registry.
    expect(range).not.toMatch(/^workspace:/);
    expect(range).not.toMatch(/^(file|link|portal):/);
    expect(range).toMatch(/^\^?\d+\.\d+\.\d+/);
  });

  it('is satisfied by the runtime kit this repository builds', () => {
    const { dependencies } = emittedManifest();
    const kit = kitManifest();
    const range = dependencies['@bridge/runtime-react']!;

    expect(
      satisfiesCaret(range, kit.version),
      `the generator emits "${range}" but the kit is ${kit.version} — an app generated by this ` +
        `build would resolve a kit that is not this one. Update RUNTIME_KIT_RANGE in emit/project.ts.`,
    ).toBe(true);
  });

  it('pins every other dependency to something a registry can resolve', () => {
    const { dependencies, devDependencies } = emittedManifest();
    for (const [name, range] of Object.entries({ ...dependencies, ...devDependencies })) {
      expect(range, `${name} must be a registry-resolvable range`).toMatch(/^\^?\d+\.\d+\.\d+/);
    }
  });

  it('emits the type-stub versions this repository actually installs', () => {
    // The defect this pins down: the generator emitted `@types/react-dom` at React's version, and
    // `@types/react-dom@19.2.7` has never existed — the 19.2.x line ends at 19.2.3. Every generated
    // project failed `npm install` with ETARGET before fetching a single package.
    //
    // A stub package tracks the major and minor of its subject and then versions on its own patch
    // cadence, so its number cannot be derived from React's. The kit's devDependencies hold versions
    // that demonstrably resolve and typecheck here, which makes them the reference: if the generator
    // emits something else, one of the two is about to be wrong and this says so before a user finds
    // out by installing.
    const { devDependencies: emitted } = emittedManifest();
    const { devDependencies: known } = kitManifest();

    for (const stub of ['@types/react', '@types/react-dom']) {
      expect(emitted[stub], `the emitted project must pin ${stub}`).toBeDefined();
      expect(
        emitted[stub],
        `the generator emits ${stub}@${emitted[stub]} but this repository installs ${known[stub]}`,
      ).toBe(known[stub]);
    }
  });
});
